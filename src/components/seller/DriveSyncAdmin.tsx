import { useCallback, useEffect, useRef, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Square, Link, ExternalLink, Loader2, ChevronDown, FileText, CalendarCheck, Check, ShieldCheck } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { openDocumentInNewTab } from '@/lib/openDocument';
import { toast } from 'sonner';

const labels: Record<string,string> = {
  a_order_invoice:'A-orderfakturor och krediter', montor_invoice:'Montörsfakturor', mockfjards_payout:'Mockfjärdsutbetalningar',
  uppdrag_handpenning:'Handpenningsfakturor', uppdrag_slutfaktura:'Slutfakturor', signed_offer:'Signerade avtal', offer_confirmation:'Orderbekräftelser',
  sheet_metal_invoice:'Plåtfakturor', uploaded_montor_invoice:'Uppladdade montörsfakturor', uploaded_a_order:'Uppladdade egna fakturor / A-ordrar',
  cost_receipt:'Kvitton på kostnader', other_document:'Övriga uppladdade dokument',
};
const statusLabels: Record<string,string> = {pending:'Väntar',synced:'Synkad',skipped:'Fanns redan',error:'Fel',review:'Att granska',out_of_range:'Före öppet år'};
interface ReviewRow { id:string; doc_kind:string; file_name:string; amount:number|null; date:string|null; reason:string|null; code:string|null; source_table:string; can_fix_date:boolean; can_force:boolean; can_retry?:boolean }
interface MisfiledRow { id:string; drive_file_id:string; drive_folder_path:string|null; file_name:string; reason:string; detected_at:string }
interface MonthRow { key:string; fiscalMonth:string; monthName:string; year:number; outgoing:number; incoming:number; customers:number; outgoing_folder:string|null; incoming_folder:string|null }
interface AuditResult { checked:number; misplaced:number; copied:number; repointed:number; released?:number; errors:number; notes:string[] }
interface SyncRow { id:string; updated_at:string; doc_kind:string; file_name:string; drive_web_link:string|null; drive_folder_path:string|null; status:string; error:string|null }
interface Status {
  client_email:string|null; credential_error:string|null; automatic_ready:boolean;
  settings:{enabled:boolean; root_folder_id:string; kunder_folder_id:string; last_run_at:string|null; last_error:string|null; earliest_open_date:string; last_audit_at:string|null; last_audit_result:AuditResult|null};
  counts:{doc_kind:string;remaining:number;errors:number;review:number;out_of_range:number}[]; recent:SyncRow[]; remaining:number;
  review:ReviewRow[]; out_of_range:number; misfiled:MisfiledRow[]; overview:MonthRow[]; today:string;
}
async function invoke<T>(body: Record<string,unknown>): Promise<T> {
  const {data,error} = await supabase.functions.invoke('drive-sync',{body});
  if (error) {
    let details = error.message;
    if (error instanceof FunctionsHttpError) {
      const text = await error.context.text();
      try { details = JSON.parse(text).error || text; } catch { details = text; }
    }
    throw new Error(details);
  }
  return data as T;
}
export function DriveSyncAdmin() {
  const [status,setStatus] = useState<Status|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [testing,setTesting] = useState(false);
  const [testResult,setTestResult] = useState('');
  const [progress,setProgress] = useState('');
  const [folders,setFolders] = useState({root_folder_id:'',kunder_folder_id:''});
  const [earliest,setEarliest] = useState('');
  const [fixing,setFixing] = useState<Record<string,string>>({});
  const [forceRow,setForceRow] = useState<ReviewRow|null>(null);
  const [auditing,setAuditing] = useState(false);
  const stop = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const raw = await invoke<Status>({action:'status'});
      // Tålig mot en äldre driftsatt funktion som saknar de nya fälten.
      const data: Status = {...raw,review:raw.review ?? [],misfiled:raw.misfiled ?? [],overview:raw.overview ?? [],out_of_range:raw.out_of_range ?? 0,
        counts:(raw.counts ?? []).map(c => ({...c,review:c.review ?? 0,out_of_range:c.out_of_range ?? 0})),
        settings:{...raw.settings,earliest_open_date:raw.settings.earliest_open_date ?? '2026-08-01',last_audit_at:raw.settings.last_audit_at ?? null,last_audit_result:raw.settings.last_audit_result ?? null}};
      if (!mounted.current) return;
      setStatus(data); setError('');
      setFolders({root_folder_id:data.settings.root_folder_id,kunder_folder_id:data.settings.kunder_folder_id});
      setEarliest(data.settings.earliest_open_date);
      return data;
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : String(e)); }
  },[]);
  useEffect(() => { mounted.current = true; void refresh(); return () => {mounted.current = false;stop.current = true;}; },[refresh]);
  async function saveSettings(values: {enabled?:boolean;root_folder_id?:string;kunder_folder_id?:string;earliest_open_date?:string}) {
    setBusy(true);
    try {
      const {error} = await supabase.from('drive_sync_settings').update(values).eq('id',1);
      if (error) throw error;
      await refresh(); toast.success('Inställningarna sparades');
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally {setBusy(false);}
  }
  async function test() {
    setTesting(true); setTestResult('');
    try { const result = await invoke<{root:string;kunder:string}>({action:'test'}); setTestResult(`Kopplingen fungerar: ${result.root} · ${result.kunder}`); await refresh(); }
    catch (e) {setTestResult(e instanceof Error ? e.message : String(e));}
    finally {setTesting(false);}
  }
  async function run() {
    if (!status) return;
    stop.current = false; setBusy(true);
    let completed = 0, failed = 0;
    const total = status.remaining;
    try {
      for (let round = 0; round < 40 && !stop.current; round++) {
        const result = await invoke<{processed:number;synced:number;skipped:number;errors:number;remaining:number;disabled?:boolean}>({action:'run',limit:25});
        completed += result.synced + result.skipped; failed += result.errors;
        if (mounted.current) setProgress(`${completed} av ${total} klara${failed ? ` · ${failed} misslyckade försök` : ''}`);
        if (result.remaining === 0 || result.processed === 0 || result.disabled) break;
      }
      if (mounted.current) {await refresh();toast.success(stop.current ? 'Synkningen stoppades' : 'Körningen avslutades');}
    } catch (e) { if (mounted.current) toast.error(e instanceof Error ? e.message : String(e)); }
    finally {if (mounted.current) setBusy(false);}
  }
  async function retry(id:string) {
    setBusy(true);
    try {
      const r = await invoke<{review?:number;errors?:number}>({action:'retry',id}); await refresh();
      if (r.review) toast.error('Årsmappen finns fortfarande inte – skapa den i Drive och försök igen.');
      else if (r.errors) toast.error('Försöket misslyckades. Se felet i listan.');
      else toast.success('Dokumentet har behandlats igen');
    }
    catch (e) {toast.error(e instanceof Error ? e.message : String(e));}
    finally {setBusy(false);}
  }
  async function fixDate(row: ReviewRow) {
    const value = fixing[row.id];
    if (!value) return;
    setBusy(true);
    try {
      const result = await invoke<{ok:boolean;hold:{reason:string}|null}>({action:'fix_date',id:row.id,date:value});
      setFixing(f => { const n = {...f}; delete n[row.id]; return n; });
      await refresh();
      if (result.hold) toast.warning(`Datumet sparades men dokumentet hålls kvar: ${result.hold.reason}`);
      else toast.success('Datumet rättades. Dokumentet arkiveras inom några minuter.');
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function forceArchive(row: ReviewRow) {
    setForceRow(null); setBusy(true);
    try { await invoke({action:'force',id:row.id}); await refresh(); toast.success('Dokumentet släpps till arkivet.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function openRow(id: string) {
    const ok = await openDocumentInNewTab(async () => (await invoke<{url:string}>({action:'open',id})).url);
    if (!ok) toast.error('Dokumentet kunde inte öppnas');
  }
  async function audit() {
    setAuditing(true);
    try {
      const r = await invoke<AuditResult & {disabled?:boolean}>({action:'audit'});
      await refresh();
      if (r.disabled) toast.message('Synken är avstängd.');
      else toast.success(`Kontroll klar: ${r.checked} filer kontrollerade, ${r.misplaced} i fel mapp${r.released ? `, ${r.released} släppta när årsmappen fanns` : ''}${r.errors ? `, ${r.errors} fel` : ''}.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setAuditing(false); }
  }
  async function resolveMisfiled(row: MisfiledRow) {
    setBusy(true);
    try {
      const {data:{user}} = await supabase.auth.getUser();
      const {data:profile} = user ? await supabase.from('profiles').select('name').eq('id',user.id).maybeSingle() : {data:null};
      const {error} = await supabase.from('drive_misfiled').update({resolved_at:new Date().toISOString(),resolved_by:profile?.name ?? null}).eq('id',row.id);
      if (error) throw error;
      await refresh(); toast.success('Markerad som borttagen');
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const kr = (n:number|null) => n == null ? '—' : `${Number(n).toLocaleString('sv-SE',{minimumFractionDigits:0,maximumFractionDigits:2})} kr`;
  const date = (value:string|null) => value ? new Date(value).toLocaleString('sv-SE') : '—';
  return <div className="space-y-8 pb-8">
    <header className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">Drive-synk</h2><Button variant="outline" size="icon" title="Uppdatera status" disabled={busy || testing} onClick={() => void refresh()}><RefreshCw className="h-4 w-4"/></Button></header>
    {error && <p role="alert" className="text-destructive break-words">{error}</p>}
    {!status && !error && <Loader2 className="h-5 w-5 animate-spin" aria-label="Hämtar status"/>}
    {status && <>
      <section className="space-y-4 border-b border-border pb-6">
        <div className="flex items-center justify-between gap-4"><h3 className="font-semibold">Koppling</h3><div className="flex items-center gap-3"><Label htmlFor="drive-enabled">Automatisk synkning</Label><Switch id="drive-enabled" checked={status.settings.enabled} disabled={busy || testing} onCheckedChange={enabled => void saveSettings({enabled})}/></div></div>
        <p className="text-sm text-muted-foreground">Synken kan bara läsa och skapa filer och mappar i Driven. Den kan aldrig ändra, flytta eller radera något; det görs alltid manuellt av en person.</p>
        {status.client_email ? <><p className="font-mono text-sm break-all">{status.client_email}</p><p className="text-sm text-muted-foreground">Dela mappen Smartklimat N3Prenad (den som innehåller Intäkter, Kvitton&amp;Fakturor och Kunder) med den här adressen. Rollen Deltagare räcker; den kan skapa men inte radera.</p></> : <p className="text-destructive" role="alert">{status.credential_error || 'GOOGLE_SERVICE_ACCOUNT_JSON saknas'}</p>}
        <div className="grid gap-4 md:grid-cols-2">{(['root_folder_id','kunder_folder_id'] as const).map(key => <div key={key} className="space-y-2"><Label htmlFor={key}>{key === 'root_folder_id' ? 'Smartklimat N3Prenad-mappens id' : 'Kunder-mappens id'}</Label><Input id={key} value={folders[key]} disabled={busy || testing} onChange={e => setFolders({...folders,[key]:e.target.value})}/></div>)}</div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || testing || !folders.root_folder_id.trim() || !folders.kunder_folder_id.trim()} onClick={() => void saveSettings({root_folder_id:folders.root_folder_id.trim(),kunder_folder_id:folders.kunder_folder_id.trim()})}>Spara mappar</Button><Button variant="outline" disabled={busy || testing} onClick={() => void test()}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Link className="mr-2 h-4 w-4"/>}Testa koppling</Button></div>
        {testResult && <p role="status" className="text-sm break-words">{testResult}</p>}
        <p className="text-sm text-muted-foreground">{status.automatic_ready ? 'Automatiken är ansluten.' : 'Automatiken väntar på ett lyckat kopplingstest.'} Senaste körning: {date(status.settings.last_run_at)}</p>
        {status.settings.last_error && <p className="text-sm text-destructive break-words">{status.settings.last_error}</p>}
      </section>
      <section className="space-y-3 border-b border-border pb-6">
        <h3 className="font-semibold">Öppet räkenskapsår</h3>
        <p className="text-sm text-muted-foreground">Dokument daterade före detta datum arkiveras aldrig automatiskt, så att inga nya filer hamnar i stängda räkenskapsår.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2"><Label htmlFor="earliest-open">Tidigaste öppna datum</Label><Input id="earliest-open" type="date" className="min-h-12 w-48" value={earliest} disabled={busy} onChange={e => setEarliest(e.target.value)}/></div>
          <Button variant="outline" className="min-h-12" disabled={busy || !earliest || earliest === status.settings.earliest_open_date} onClick={() => void saveSettings({earliest_open_date:earliest})}>Spara datum</Button>
        </div>
      </section>
      <section className="space-y-3 border-b border-border pb-6">
        <h3 className="font-semibold">Arkiverat per månad</h3>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]"><thead className="text-muted-foreground"><tr className="border-b border-border"><th className="text-left py-2">Månad</th><th className="text-right">Utgifter</th><th className="text-right">Intäkter</th><th className="text-right">Kunder</th></tr></thead>
        <tbody>{status.overview.map(m => <tr key={m.key} className="border-b border-border">
          <td className="py-3">{m.fiscalMonth} {m.monthName} {m.year}</td>
          <td className="text-right font-mono">{m.outgoing_folder ? <a className="text-primary underline inline-flex items-center gap-1 min-h-11 justify-end" href={m.outgoing_folder} target="_blank" rel="noopener noreferrer">{m.outgoing}<ExternalLink className="h-3 w-3"/></a> : m.outgoing}</td>
          <td className="text-right font-mono">{m.incoming_folder ? <a className="text-primary underline inline-flex items-center gap-1 min-h-11 justify-end" href={m.incoming_folder} target="_blank" rel="noopener noreferrer">{m.incoming}<ExternalLink className="h-3 w-3"/></a> : m.incoming}</td>
          <td className="text-right font-mono">{m.customers}</td>
        </tr>)}</tbody></table></div>
      </section>
      <section className="space-y-3 border-b border-border pb-6">
        <h3 className="font-semibold">Att granska {status.review.length > 0 && <Badge variant="secondary" className="ml-2">{status.review.length}</Badge>}</h3>
        <p className="text-sm text-muted-foreground">Dokument som inte arkiveras förrän någon har kontrollerat dem. Inget av dessa har laddats upp till Driven.</p>
        {status.review.length === 0 && <p className="text-sm text-muted-foreground">Inget att granska.</p>}
        <ul className="space-y-3">{status.review.map(row => <li key={row.id} className="rounded-md border border-border p-3 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0"><div className="text-xs text-muted-foreground">{labels[row.doc_kind] || row.doc_kind}</div><div className="font-medium break-words">{row.file_name}</div></div>
            <div className="text-sm text-right"><div>{kr(row.amount)}</div><div className="text-muted-foreground">{row.date || 'Datum saknas'}</div></div>
          </div>
          <p className="text-sm text-destructive break-words">{row.reason}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="outline" className="min-h-12" disabled={busy} onClick={() => void openRow(row.id)}><FileText className="mr-2 h-4 w-4"/>Öppna dokument</Button>
            {row.can_fix_date && (fixing[row.id] === undefined
              ? <Button variant="outline" className="min-h-12" disabled={busy} onClick={() => setFixing(f => ({...f,[row.id]:row.date || ''}))}><CalendarCheck className="mr-2 h-4 w-4"/>Rätta datum</Button>
              : <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1"><Label htmlFor={`fix-${row.id}`}>Rätt fakturadatum</Label><Input id={`fix-${row.id}`} type="date" className="min-h-12 w-48" value={fixing[row.id]} onChange={e => setFixing(f => ({...f,[row.id]:e.target.value}))}/></div>
                  <Button className="min-h-12" disabled={busy || !fixing[row.id]} onClick={() => void fixDate(row)}>Spara datum</Button>
                  <Button variant="ghost" className="min-h-12" disabled={busy} onClick={() => setFixing(f => { const n = {...f}; delete n[row.id]; return n; })}>Avbryt</Button>
                </div>)}
            {row.can_retry && <Button variant="outline" className="min-h-12" disabled={busy} onClick={() => void retry(row.id)}><RefreshCw className="mr-2 h-4 w-4"/>Försök igen</Button>}
            {row.can_force && <Button variant="outline" className="min-h-12" disabled={busy} onClick={() => setForceRow(row)}><ShieldCheck className="mr-2 h-4 w-4"/>Arkivera ändå</Button>}
          </div>
        </li>)}</ul>
        {status.out_of_range > 0 && <Collapsible>
          <CollapsibleTrigger asChild><Button variant="ghost" className="min-h-12 px-2 text-muted-foreground"><ChevronDown className="mr-2 h-4 w-4"/>{status.out_of_range} dokument före {status.settings.earliest_open_date} arkiveras inte automatiskt</Button></CollapsibleTrigger>
          <CollapsibleContent><table className="w-full text-sm"><tbody>{status.counts.filter(c => c.out_of_range > 0).map(c => <tr key={c.doc_kind} className="border-b border-border"><td className="py-2">{labels[c.doc_kind] || c.doc_kind}</td><td className="text-right font-mono">{c.out_of_range}</td></tr>)}</tbody></table></CollapsibleContent>
        </Collapsible>}
      </section>
      <section className="space-y-3 border-b border-border pb-6">
        <h3 className="font-semibold">Felplacerade filer att ta bort manuellt</h3>
        <p className="text-sm text-muted-foreground">En kontroll körs varje natt. Ligger en arkiverad fil i fel månadsmapp läggs en ny kopia i rätt mapp och den gamla listas här. Synken raderar aldrig själv – ta bort den gamla filen i Driven och tryck sedan Klar.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="min-h-12" disabled={busy || auditing || !status.settings.enabled} onClick={() => void audit()}>{auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}Kontrollera mappar nu</Button>
          <span className="text-sm text-muted-foreground">Senaste kontroll: {date(status.settings.last_audit_at)}{status.settings.last_audit_result ? ` · ${status.settings.last_audit_result.checked} kontrollerade, ${status.settings.last_audit_result.misplaced} i fel mapp` : ''}</span>
        </div>
        {status.settings.last_audit_result?.notes?.length ? <ul className="text-sm text-destructive list-disc pl-5">{status.settings.last_audit_result.notes.map(n => <li key={n} className="break-words">{n}</li>)}</ul> : null}
        {status.misfiled.length === 0 ? <p className="text-sm text-muted-foreground">Inga felplacerade filer.</p> :
        <ul className="space-y-3">{status.misfiled.map(row => <li key={row.id} className="rounded-md border border-border p-3 space-y-2">
          <a className="text-primary underline break-words inline-flex items-center gap-1 min-h-11" href={`https://drive.google.com/file/d/${row.drive_file_id}/view`} target="_blank" rel="noopener noreferrer">{row.file_name}<ExternalLink className="h-3 w-3"/></a>
          <div className="text-sm text-muted-foreground break-words">Ligger i: {row.drive_folder_path || '—'}</div>
          <div className="text-sm break-words">{row.reason}</div>
          <Button variant="outline" className="min-h-12" disabled={busy} onClick={() => void resolveMisfiled(row)}><Check className="mr-2 h-4 w-4"/>Klar – borttagen</Button>
        </li>)}</ul>}
      </section>
      <section className="space-y-4">
        <h3 className="font-semibold">Att synka</h3>
        <table className="w-full text-sm"><thead className="text-muted-foreground"><tr className="border-b border-border"><th className="text-left py-2">Dokumenttyp</th><th className="text-right">Kvar</th><th className="text-right">Fel</th></tr></thead><tbody>{status.counts.filter(row => row.remaining || row.errors || row.doc_kind !== 'other_document').map(row => <tr key={row.doc_kind} className="border-b border-border"><td className="py-3">{labels[row.doc_kind] || row.doc_kind}</td><td className="text-right font-mono">{row.remaining}</td><td className="text-right font-mono">{row.errors}</td></tr>)}</tbody></table>
        <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || testing || !status.settings.enabled} onClick={() => void run()}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`}/>Synka nu</Button>{busy && <Button variant="outline" onClick={() => {stop.current = true;setProgress(p => `${p} · stoppar efter denna omgång`);}}><Square className="mr-2 h-4 w-4"/>Stoppa</Button>}<span role="status" className="text-sm text-muted-foreground">{progress}</span></div>
      </section>
      <section className="space-y-4"><h3 className="font-semibold">Senaste synkningar</h3><div className="overflow-x-auto"><table className="w-full text-sm min-w-[780px]"><thead className="text-muted-foreground"><tr className="border-b border-border">{['Datum','Typ / filnamn','Mapp','Status','Fel',''].map((t,i) => <th key={i} className="text-left py-2 pr-3">{t}</th>)}</tr></thead><tbody>{status.recent.map(row => <tr key={row.id} className="border-b border-border align-top"><td className="py-3 pr-3 whitespace-nowrap">{date(row.updated_at)}</td><td className="py-3 pr-3 max-w-72 break-words"><div className="text-xs text-muted-foreground mb-1">{labels[row.doc_kind]}</div>{row.drive_web_link?.startsWith('https://drive.google.com/') ? <a className="text-primary underline" href={row.drive_web_link} target="_blank" rel="noopener noreferrer">{row.file_name}<ExternalLink className="inline ml-1 h-3 w-3"/></a> : row.file_name}</td><td className="py-3 pr-3 max-w-60 break-words">{row.drive_folder_path || '—'}</td><td className="py-3 pr-3"><Badge variant={row.status === 'error' ? 'destructive' : row.status === 'synced' ? 'default' : 'secondary'}>{statusLabels[row.status] || row.status}</Badge></td><td className="py-3 pr-3 max-w-64 break-words">{row.error}</td><td className="py-3">{row.status === 'error' && <Button size="sm" variant="outline" disabled={busy || testing} onClick={() => void retry(row.id)}>Försök igen</Button>}</td></tr>)}</tbody></table></div>{status.recent.length === 0 && <p className="text-sm text-muted-foreground">Inga synkningar ännu.</p>}</section>
    </>}
    <AlertDialog open={!!forceRow} onOpenChange={o => { if (!o) setForceRow(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arkivera ändå?</AlertDialogTitle>
          <AlertDialogDescription>{forceRow?.file_name} arkiveras med datumet {forceRow?.date || '—'}. Gör detta bara om du har kontrollerat att datumet och beloppet stämmer.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-12">Avbryt</AlertDialogCancel>
          <AlertDialogAction className="min-h-12" onClick={() => forceRow && void forceArchive(forceRow)}>Arkivera ändå</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}