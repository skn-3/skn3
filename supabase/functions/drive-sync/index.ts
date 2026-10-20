import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.25.76';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireCoordinator } from '../_shared/auth.ts';
import { DRIVE_KINDS } from '../_shared/driveFolders.ts';
import { collectCandidates, candidateKey, type Candidate } from './candidates.ts';
import { GoogleDrive, serviceAccount } from './google.ts';

const Body = z.discriminatedUnion('action',[
  z.object({action:z.literal('status')}), z.object({action:z.literal('test')}),
  z.object({action:z.literal('run'),limit:z.number().int().min(1).max(25).default(10)}),
  z.object({action:z.literal('retry'),id:z.string().uuid()}),
]);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

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
  if (!cron) {
    const auth = await requireCoordinator(req,corsHeaders);
    if (auth.response) return auth.response;
  }
  const admin = createClient(url,key);
  let owner: string | null = null, generation: number | null = null;
  let finishRemaining = false;
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({error:'Ogiltig begäran',details:parsed.error.flatten()},400);
    const body = parsed.data;
    const {data:settings,error:settingsError} = await admin.from('drive_sync_settings').select('*').eq('id',1).single();
    if (settingsError) throw new Error(settingsError.message);
    if (body.action === 'status') {
      const collected = await collectCandidates(admin);
      let email = null, credentialError = null;
      try { email = serviceAccount().client_email; } catch (e) { credentialError = message(e); }
      const counts = DRIVE_KINDS.map(doc_kind => ({doc_kind,
        remaining:collected.candidates.filter(c => c.doc_kind === doc_kind && !['synced','skipped'].includes(collected.logs.get(candidateKey(c))?.status)).length,
        errors:collected.syncRows.filter(r => r.doc_kind === doc_kind && r.status === 'error').length,
      }));
      const recent = [...collected.syncRows].sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0,100);
      const {data:runtime} = await admin.from('drive_sync_runtime').select('callback_url').eq('id',1).single();
      return json({client_email:email,credential_error:credentialError,settings,counts,error_count:collected.syncRows.filter(r => r.status === 'error').length,recent,remaining:collected.remaining.length,automatic_ready:Boolean(runtime?.callback_url)});
    }
    if (body.action === 'run' && !settings.enabled) return json({processed:0,synced:0,skipped:0,errors:0,remaining:0,disabled:true});
    serviceAccount(); // Fail clearly, without touching document attempts, when key is absent.
    const drive = new GoogleDrive();
    if (body.action === 'test') {
      const [root,kunder] = await Promise.all([drive.metadata(settings.root_folder_id),drive.metadata(settings.kunder_folder_id)]);
      // Only activate callbacks after a successful real Google access check.
      const {error} = await admin.from('drive_sync_runtime').update({callback_url:`${url}/functions/v1/drive-sync`,callback_bearer:key}).eq('id',1);
      if (error) throw new Error(error.message);
      return json({ok:true,root:root.name,kunder:kunder.name});
    }
    owner = crypto.randomUUID();
    const claim = await admin.rpc('drive_sync_claim',{p_owner:owner});
    if (claim.error) throw new Error(claim.error.message);
    if (claim.data === null) { owner = null; return json({error:'En synkning pågår redan. Försök igen om en stund.'},409); }
    generation = claim.data;
    let collected = await collectCandidates(admin);
    let batch: Candidate[];
    if (body.action === 'retry') {
      const row = collected.syncRows.find(r => r.id === body.id);
      if (!row) return json({error:'Synkraden hittades inte'},404);
      if (row.status === 'synced' || row.status === 'skipped') return json({processed:0,synced:0,skipped:0,errors:0,remaining:collected.remaining.length});
      const candidate = collected.candidates.find(c => candidateKey(c) === candidateKey(row));
      if (!candidate) return json({error:'Källdokumentet finns inte längre'},404);
      const reset = await admin.from('drive_sync').update({attempts:0,status:'pending',error:null}).eq('id',body.id);
      if (reset.error) throw new Error(reset.error.message);
      row.attempts = 0;
      batch = [candidate];
    } else batch = collected.remaining.slice(0,body.limit);
    const result = {processed:0,synced:0,skipped:0,errors:0,remaining:0};
    const failures: string[] = [];
    const started = Date.now();
    for (const c of batch) {
      if (Date.now()-started > 110_000) break;
      // Refresh the lease before every potentially slow upload.
      const lease = await admin.from('drive_sync_runtime').update({lease_until:new Date(Date.now()+240_000).toISOString()}).eq('id',1).eq('lease_owner',owner);
      if (lease.error) throw new Error(lease.error.message);
      const prior = collected.logs.get(candidateKey(c));
      if (prior?.status === 'synced' || prior?.status === 'skipped') continue;
      const log: Record<string,unknown> = {
        source_table:c.source_table,source_id:c.source_id,doc_kind:c.doc_kind,storage_path:c.storage_path,file_name:c.file_name,
        attempts:(prior?.attempts || 0)+1,status:'pending',error:null,
      };
      // Persist the attempt before external side effects; a crashed worker is safely retried.
      const pending = await admin.from('drive_sync').upsert(log,{onConflict:'source_table,source_id,doc_kind'});
      if (pending.error) throw new Error(pending.error.message);
      try {
        const folder = await drive.target(settings,c.destination,c.date,c.address);
        log.drive_folder_id = folder.id; log.drive_folder_path = folder.path;
        const existing = await drive.duplicate(folder.id,c.file_name,c.number);
        if (existing) {
          log.status = 'skipped'; log.error = `Fanns redan: ${existing.name}`;
          log.drive_file_id = existing.id; log.drive_web_link = existing.webViewLink || `https://drive.google.com/file/d/${existing.id}/view`;
          result.skipped++;
        } else {
          const {data:pdf,error} = await admin.storage.from('case-documents').download(c.storage_path);
          if (error || !pdf) throw new Error(`PDF kunde inte hämtas: ${error?.message || 'fil saknas'}`);
          const uploaded = await drive.upload(folder.id,c.file_name,pdf);
          log.status = 'synced'; log.drive_file_id = uploaded.id;
          log.drive_web_link = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
          result.synced++;
        }
        log.synced_at = new Date().toISOString();
      } catch (e) {
        log.status = 'error'; log.error = message(e); failures.push(message(e)); result.errors++;
      }
      const saved = await admin.from('drive_sync').upsert(log,{onConflict:'source_table,source_id,doc_kind'});
      if (saved.error) throw new Error(saved.error.message);
      result.processed++;
    }
    collected = await collectCandidates(admin);
    result.remaining = collected.remaining.length;
    finishRemaining = result.remaining > 0;
    const update = await admin.from('drive_sync_settings').update({last_run_at:new Date().toISOString(),last_error:failures.length ? failures.join('\n').slice(0,6000) : null}).eq('id',1);
    if (update.error) throw new Error(update.error.message);
    // Continue immediately only for never-attempted work; errors wait for bounded cron retries.
    if (cron && collected.remaining.some(c => !collected.logs.has(candidateKey(c)))) {
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