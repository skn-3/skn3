import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.25.76';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireCoordinator } from '../_shared/auth.ts';
import { DRIVE_KINDS, YearFolderMissingError, inExpectedFolder, monthKeyFromFolder, fiscalYearMonths, isIsoDate } from '../_shared/driveFolders.ts';
import { collectCandidates, persistHolds, candidateKey, holdFor, releasableYearMissing, type Candidate, type Settings } from './candidates.ts';
import { GoogleDrive, serviceAccount } from './google.ts';

const Body = z.discriminatedUnion('action',[
  z.object({action:z.literal('status')}), z.object({action:z.literal('test')}),
  z.object({action:z.literal('run'),limit:z.number().int().min(1).max(25).default(10)}),
  z.object({action:z.literal('retry'),id:z.string().uuid()}),
  z.object({action:z.literal('audit')}),
  z.object({action:z.literal('fix_date'),id:z.string().uuid(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}),
  z.object({action:z.literal('force'),id:z.string().uuid()}),
  z.object({action:z.literal('open'),id:z.string().uuid()}),
]);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const driveLink = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;
type Collected = Awaited<ReturnType<typeof collectCandidates>>;

/** Översikt för öppet räkenskapsår: arkiverade filer per månad och typ. */
function overview(collected: Collected) {
  const months = fiscalYearMonths(collected.today).map(m => ({...m,outgoing:0,incoming:0,customers:0,outgoing_folder:null as string|null,incoming_folder:null as string|null}));
  const byKey = new Map(months.map(m => [m.key,m]));
  const candidates = new Map(collected.candidates.map(c => [candidateKey(c),c]));
  for (const r of collected.syncRows) {
    if (r.status !== 'synced' && r.status !== 'skipped') continue;
    const path: string = r.drive_folder_path || '';
    if (path.startsWith('Kunder/')) {
      const date = candidates.get(candidateKey(r))?.date || r.synced_at?.slice(0,10);
      const month = date ? byKey.get(date.slice(0,7)) : null;
      if (month) month.customers++;
      continue;
    }
    const month = byKey.get(monthKeyFromFolder(path) ?? '');
    if (!month) continue;
    const type = path.includes('Kvitton&Fakturor') ? 'outgoing' : path.includes('Intäkter') ? 'incoming' : null;
    if (!type) continue;
    month[type]++;
    if (r.drive_folder_id && !month[`${type}_folder`]) month[`${type}_folder`] = folderLink(r.drive_folder_id);
  }
  return months;
}

async function wake(admin: SupabaseClient) {
  const {error} = await admin.rpc('drive_sync_wake');
  if (error) console.error('Drive wake failed:',error.message);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
  if (req.method !== 'POST') return json({error:'Använd POST'},405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({error:'Cloud-konfiguration saknas'},500);
  const authorization = req.headers.get('Authorization');
  let cron = authorization === `Bearer ${key}`;
  // Managed environments can expose a newer secret key to the function while
  // callers still hold a valid legacy service JWT. Verify it through the Data
  // API's service-only table privileges, never by trusting a decoded JWT role.
  if (!cron && authorization?.startsWith('Bearer ')) {
    const verifier = createClient(url,Deno.env.get('SUPABASE_ANON_KEY') || key,{global:{headers:{Authorization:authorization}}});
    const verified = await verifier.from('drive_sync_runtime').select('id').eq('id',1).maybeSingle();
    cron = !verified.error && verified.data?.id === 1;
  }
  let actorName = 'Drive-synk';
  const admin = createClient(url,key);
  if (!cron) {
    const auth = await requireCoordinator(req,corsHeaders);
    if (auth.response) return auth.response;
    const {data:profile} = await admin.from('profiles').select('name').eq('id',auth.userId).maybeSingle();
    actorName = profile?.name || 'Okänd';
  }
  let owner: string | null = null, generation: number | null = null;
  let finishRemaining = false;
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({error:'Ogiltig begäran',details:parsed.error.flatten()},400);
    const body = parsed.data;
    const {data:settings,error:settingsError} = await admin.from('drive_sync_settings').select('*').eq('id',1).single<Settings & Record<string,unknown>>();
    if (settingsError) throw new Error(settingsError.message);

    if (body.action === 'status') {
      let collected = await collectCandidates(admin,settings);
      if (await persistHolds(admin,collected)) collected = await collectCandidates(admin,settings);
      let email = null, credentialError = null;
      try { email = serviceAccount().client_email; } catch (e) { credentialError = message(e); }
      const statusOf = (c: Candidate) => collected.logs.get(candidateKey(c))?.status;
      const counts = DRIVE_KINDS.map(doc_kind => ({doc_kind,
        remaining:collected.remaining.filter(c => c.doc_kind === doc_kind).length,
        errors:collected.syncRows.filter(r => r.doc_kind === doc_kind && r.status === 'error').length,
        review:collected.candidates.filter(c => c.doc_kind === doc_kind && statusOf(c) === 'review').length,
        out_of_range:collected.candidates.filter(c => c.doc_kind === doc_kind && statusOf(c) === 'out_of_range').length,
      })).filter(c => c.remaining || c.errors || c.review || c.out_of_range || !['other_document'].includes(c.doc_kind));
      const review = collected.candidates.flatMap(c => {
        const row = collected.logs.get(candidateKey(c));
        if (row?.status !== 'review') return [];
        return [{id:row.id,doc_kind:c.doc_kind,file_name:c.file_name,amount:c.amount ?? null,date:c.date,reason:row.review_reason,code:row.review_code,
          source_table:c.source_table,can_fix_date:Boolean(c.can_fix_date) && row.review_code !== 'year_missing',
          can_force:row.review_code !== 'unknown_type' && row.review_code !== 'year_missing' && Boolean(c.destination),
          can_retry:row.review_code === 'year_missing'}];
      });
      const outOfRange = collected.candidates.filter(c => statusOf(c) === 'out_of_range').length;
      const {data:misfiled,error:misfiledError} = await admin.from('drive_misfiled').select('*').is('resolved_at',null).order('detected_at',{ascending:false});
      if (misfiledError) throw new Error(misfiledError.message);
      const recent = [...collected.syncRows].filter(r => r.status !== 'out_of_range').sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0,100);
      const {data:runtime} = await admin.from('drive_sync_runtime').select('callback_url').eq('id',1).single();
      return json({client_email:email,credential_error:credentialError,settings,counts,error_count:collected.syncRows.filter(r => r.status === 'error').length,
        recent,remaining:collected.remaining.length,automatic_ready:Boolean(runtime?.callback_url),review,out_of_range:outOfRange,misfiled:misfiled ?? [],overview:overview(collected),today:collected.today});
    }

    if (body.action === 'open') {
      if (cron) return json({error:'Inte tillåtet'},403);
      const collected = await collectCandidates(admin,settings);
      const row = collected.syncRows.find(r => r.id === body.id);
      const candidate = row && collected.candidates.find(c => candidateKey(c) === candidateKey(row));
      if (!candidate) return json({error:'Dokumentet hittades inte'},404);
      const {data,error} = await admin.storage.from(candidate.bucket).createSignedUrl(candidate.storage_path,300);
      if (error || !data?.signedUrl) return json({error:`Dokumentet kunde inte öppnas: ${error?.message || 'saknas'}`},404);
      return json({url:data.signedUrl});
    }

    if (body.action === 'fix_date' || body.action === 'force') {
      if (cron) return json({error:'Inte tillåtet'},403);
      const {data:row,error} = await admin.from('drive_sync').select('*').eq('id',body.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return json({error:'Synkraden hittades inte'},404);
      if (row.status !== 'review' && row.status !== 'out_of_range') return json({error:'Dokumentet väntar inte på granskning'},409);
      if (body.action === 'force') {
        if (row.review_code === 'unknown_type') return json({error:'Okända dokumenttyper kan inte arkiveras automatiskt'},409);
        const upd = await admin.from('drive_sync').update({review_override:true,status:'pending',attempts:0,error:null,review_reason:null,review_code:null}).eq('id',row.id);
        if (upd.error) throw new Error(upd.error.message);
        await admin.from('activity_log').insert({actor_name:actorName,actor_role:'admin',action:'drive_archive_forced',category:'admin',description:`Arkivera ändå: ${row.file_name}`,metadata:{drive_sync_id:row.id,reason:row.review_reason}});
        await wake(admin);
        return json({ok:true});
      }
      if (row.source_table !== 'case_documents') return json({error:'Datum kan bara rättas för uppladdade dokument'},409);
      if (!isIsoDate(body.date)) return json({error:'Ogiltigt datum'},400);
      const {data:doc,error:docError} = await admin.from('case_documents').select('id,file_path,invoice_date,invoice_number,case_id').eq('id',row.source_id).maybeSingle();
      if (docError) throw new Error(docError.message);
      if (!doc) return json({error:'Källdokumentet finns inte längre'},404);
      // Samma fil kan ha flera rader (en per ärende); alla får samma rättade datum.
      const upd = await admin.from('case_documents').update({invoice_date:body.date,drive_review_reason:null}).eq('file_path',doc.file_path);
      if (upd.error) throw new Error(upd.error.message);
      const log = await admin.from('activity_log').insert({actor_name:actorName,actor_role:'admin',action:'document_date_corrected',category:'admin',
        description:`Rättade fakturadatum för ${doc.invoice_number || row.file_name} från ${doc.invoice_date || 'saknas'} till ${body.date}`,
        case_id:doc.case_id,metadata:{case_document_id:doc.id,file_path:doc.file_path,from:doc.invoice_date,to:body.date,via:'Drive-synk'}});
      if (log.error) console.error('Activity log failed:',log.error.message);
      const reset = await admin.from('drive_sync').update({status:'pending',attempts:0,error:null,review_reason:null,review_code:null}).eq('id',row.id);
      if (reset.error) throw new Error(reset.error.message);
      const collected = await collectCandidates(admin,settings);
      const candidate = collected.candidates.find(c => candidateKey(c) === candidateKey(row));
      const hold = candidate ? holdFor(candidate,settings,collected.today) : null;
      await persistHolds(admin,collected);
      if (!hold) await wake(admin);
      return json({ok:true,hold});
    }

    if ((body.action === 'run' || body.action === 'audit') && !settings.enabled) return json({processed:0,synced:0,skipped:0,errors:0,remaining:0,disabled:true});
    serviceAccount(); // Fail clearly, without touching document attempts, when key is absent.
    const drive = new GoogleDrive();
    if (body.action === 'test') {
      const [root,kunder] = await Promise.all([drive.metadata(settings.root_folder_id),drive.metadata(settings.kunder_folder_id)]);
      // Only activate callbacks after a successful real Google access check.
      const {error} = await admin.from('drive_sync_runtime').update({callback_url:`${url}/functions/v1/drive-sync`,callback_bearer:key}).eq('id',1);
      if (error) throw new Error(error.message);
      // A successful access check clears the previous connection error.
      const cleared = await admin.from('drive_sync_settings').update({last_error:null}).eq('id',1);
      if (cleared.error) throw new Error(cleared.error.message);
      return json({ok:true,root:root.name,kunder:kunder.name});
    }
    owner = crypto.randomUUID();
    const claim = await admin.rpc('drive_sync_claim',{p_owner:owner});
    if (claim.error) throw new Error(claim.error.message);
    if (claim.data === null) { owner = null; return json({error:'En synkning pågår redan. Försök igen om en stund.'},409); }
    generation = claim.data;
    finishRemaining = true; // Preserve bounded retries if candidate discovery fails.
    let collected = await collectCandidates(admin,settings);
    await persistHolds(admin,collected);
    const started = Date.now();
    const refreshLease = async () => {
      const lease = await admin.from('drive_sync_runtime').update({lease_until:new Date(Date.now()+240_000).toISOString()}).eq('id',1).eq('lease_owner',owner);
      if (lease.error) throw new Error(lease.error.message);
    };

    if (body.action === 'audit') {
      // Kontroll: ligger arkiverade filer i den mapp som källans nuvarande datum anger?
      const result = {checked:0,misplaced:0,copied:0,repointed:0,released:0,errors:0,notes:[] as string[]};
      // Släpp year_missing-rader när årsmappen har skapats (bara läsning; inget skapas här).
      if (collected.syncRows.some(r => r.status === 'review' && r.review_code === 'year_missing')) {
        try {
          const rootNames = (await drive.list(settings.root_folder_id,true)).map(f => f.name);
          const ids = releasableYearMissing(collected.syncRows,collected.candidates,rootNames);
          for (let i = 0; i < ids.length; i += 200) {
            const rel = await admin.from('drive_sync').update({status:'pending',attempts:0,error:null,review_reason:null,review_code:null})
              .in('id',ids.slice(i,i+200)).eq('status','review').eq('review_code','year_missing');
            if (rel.error) throw new Error(rel.error.message);
          }
          result.released = ids.length;
          if (ids.length) {
            // Ny generation: drive_sync_finish väcker synken direkt när kontrollen är klar.
            await admin.from('drive_sync_runtime').update({generation:Number(generation)+1}).eq('id',1).eq('lease_owner',owner);
            collected = await collectCandidates(admin,settings);
          }
        } catch (e) { result.errors++; result.notes.push(`Årsmappar: ${message(e)}`); }
      }
      for (const row of collected.syncRows) {
        if (row.status !== 'synced') continue;
        const c = collected.candidates.find(x => candidateKey(x) === candidateKey(row));
        if (!c || !c.destination || c.destination === 'customers' || !c.date || c.date < settings.earliest_open_date) continue;
        if (holdFor(c,settings,collected.today,Boolean(row.review_override))) continue;
        result.checked++;
        if (inExpectedFolder(row.drive_folder_path,c.destination,c.date)) continue;
        result.misplaced++;
        if (Date.now()-started > 110_000) { result.notes.push('Tidsgränsen nåddes; resten kontrolleras vid nästa körning.'); break; }
        await refreshLease();
        try {
          const folder = await drive.target(settings,c.destination,c.date);
          const existing = await drive.duplicate(folder.id,c.file_name,c.number);
          let newId: string, newLink: string;
          if (existing) {
            newId = existing.id; newLink = existing.webViewLink || driveLink(existing.id); result.repointed++;
          } else {
            const {data:file,error} = await admin.storage.from(c.bucket).download(c.storage_path);
            if (error || !file) throw new Error(`Filen kunde inte hämtas: ${error?.message || 'fil saknas'}`);
            const uploaded = await drive.upload(folder.id,c.file_name,file);
            newId = uploaded.id; newLink = uploaded.webViewLink || driveLink(uploaded.id); result.copied++;
          }
          if (row.drive_file_id && row.drive_file_id !== newId) {
            const mis = await admin.from('drive_misfiled').upsert({drive_sync_id:row.id,drive_file_id:row.drive_file_id,drive_folder_path:row.drive_folder_path,
              file_name:row.file_name,reason:`Ta bort manuellt – fel mapp. Rätt mapp är ${folder.path}`},{onConflict:'drive_file_id',ignoreDuplicates:true});
            if (mis.error) throw new Error(mis.error.message);
          }
          const upd = await admin.from('drive_sync').update({drive_folder_id:folder.id,drive_folder_path:folder.path,drive_file_id:newId,drive_web_link:newLink,file_name:c.file_name,synced_at:new Date().toISOString()}).eq('id',row.id);
          if (upd.error) throw new Error(upd.error.message);
        } catch (e) {
          result.errors++; result.notes.push(`${row.file_name}: ${message(e)}`);
        }
      }
      finishRemaining = collected.remaining.length > 0;
      const update = await admin.from('drive_sync_settings').update({last_audit_at:new Date().toISOString(),last_audit_result:result}).eq('id',1);
      if (update.error) throw new Error(update.error.message);
      return json(result);
    }

    let batch: Candidate[];
    if (body.action === 'retry') {
      finishRemaining = collected.remaining.length > 0;
      const row = collected.syncRows.find(r => r.id === body.id);
      if (!row) return json({error:'Synkraden hittades inte'},404);
      if (row.status === 'synced' || row.status === 'skipped') return json({processed:0,synced:0,skipped:0,errors:0,remaining:collected.remaining.length});
      const candidate = collected.candidates.find(c => candidateKey(c) === candidateKey(row));
      if (!candidate) return json({error:'Källdokumentet finns inte längre'},404);
      const hold = holdFor(candidate,settings,collected.today,Boolean(row.review_override));
      if (hold) return json({error:`Dokumentet hålls kvar: ${hold.reason}`},409);
      const reset = await admin.from('drive_sync').update({attempts:0,status:'pending',error:null,review_reason:null,review_code:null}).eq('id',body.id);
      if (reset.error) throw new Error(reset.error.message);
      row.attempts = 0; row.status = 'pending';
      batch = [candidate];
    } else batch = collected.remaining.slice(0,body.limit);
    const result = {processed:0,synced:0,skipped:0,errors:0,review:0,remaining:0};
    const failures: string[] = [];
    for (const c of batch) {
      if (Date.now()-started > 110_000) break;
      // Refresh the lease before every potentially slow upload.
      await refreshLease();
      const prior = collected.logs.get(candidateKey(c));
      if (prior?.status === 'synced' || prior?.status === 'skipped') continue;
      const log: Record<string,unknown> = {
        source_table:c.source_table,source_id:c.source_id,doc_kind:c.doc_kind,storage_path:c.storage_path,file_name:c.file_name,
        attempts:(prior?.status === 'review' || prior?.status === 'out_of_range' ? 0 : (prior?.attempts || 0))+1,status:'pending',error:null,review_reason:null,review_code:null,
      };
      // Persist the attempt before external side effects; a crashed worker is safely retried.
      const pending = await admin.from('drive_sync').upsert(log,{onConflict:'source_table,source_id,doc_kind'});
      if (pending.error) throw new Error(pending.error.message);
      try {
        const folder = await drive.target(settings,c.destination!,c.date!,c.address);
        log.drive_folder_id = folder.id; log.drive_folder_path = folder.path;
        const existing = await drive.duplicate(folder.id,c.file_name,c.number);
        if (existing) {
          log.status = 'skipped'; log.error = `Fanns redan: ${existing.name}`;
          log.drive_file_id = existing.id; log.drive_web_link = existing.webViewLink || driveLink(existing.id);
          result.skipped++;
        } else {
          const {data:file,error} = await admin.storage.from(c.bucket).download(c.storage_path);
          if (error || !file) throw new Error(`Filen kunde inte hämtas: ${error?.message || 'fil saknas'}`);
          const uploaded = await drive.upload(folder.id,c.file_name,file);
          log.status = 'synced'; log.drive_file_id = uploaded.id;
          log.drive_web_link = uploaded.webViewLink || driveLink(uploaded.id);
          result.synced++;
        }
        log.synced_at = new Date().toISOString();
      } catch (e) {
        if (e instanceof YearFolderMissingError) {
          // Ingen årsmapp skapas: håll dokumentet för granskning tills någon skapat mappen.
          log.status = 'review'; log.review_reason = e.message; log.review_code = 'year_missing'; result.review++;
        } else { log.status = 'error'; log.error = message(e); failures.push(message(e)); result.errors++; }
      }
      const saved = await admin.from('drive_sync').upsert(log,{onConflict:'source_table,source_id,doc_kind'});
      if (saved.error) throw new Error(saved.error.message);
      result.processed++;
    }
    collected = await collectCandidates(admin,settings);
    result.remaining = collected.remaining.length;
    finishRemaining = result.remaining > 0;
    const update = await admin.from('drive_sync_settings').update({last_run_at:new Date().toISOString(),last_error:failures.length ? failures.join('\n').slice(0,6000) : null}).eq('id',1);
    if (update.error) throw new Error(update.error.message);
    // Continue immediately only for never-attempted work; errors wait for bounded cron retries.
    if (cron && collected.remaining.some(c => !collected.logs.has(candidateKey(c)) || ['review','out_of_range'].includes(collected.logs.get(candidateKey(c))?.status))) {
      await admin.rpc('drive_sync_wake');
    }
    return json(result);
  } catch (e) {
    const error = message(e);
    await admin.from('drive_sync_settings').update({last_error:error.slice(0,6000)}).eq('id',1);
    return json({error},error.includes('GOOGLE_SERVICE_ACCOUNT_JSON saknas') ? 503 : 500);
  } finally {
    if (owner && generation !== null) {
      const finished = await admin.rpc('drive_sync_finish',{p_owner:owner,p_generation:generation,p_remaining:finishRemaining});
      if (finished.error) console.error('Drive worker release failed:',finished.error.message);
    }
  }
});

