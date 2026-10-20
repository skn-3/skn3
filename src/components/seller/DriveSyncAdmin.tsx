import { useCallback, useEffect, useRef, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Square, Link, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const labels: Record<string,string> = {
  a_order_invoice:'A-orderfakturor och krediter', montor_invoice:'Montörsfakturor', mockfjards_payout:'Mockfjärdsutbetalningar',
  uppdrag_handpenning:'Handpenningsfakturor', uppdrag_slutfaktura:'Slutfakturor', signed_offer:'Signerade avtal',
};
interface SyncRow { id:string; updated_at:string; doc_kind:string; file_name:string; drive_web_link:string|null; drive_folder_path:string|null; status:string; error:string|null }
interface Status {
  client_email:string|null; credential_error:string|null; automatic_ready:boolean;
  settings:{enabled:boolean; root_folder_id:string; kunder_folder_id:string; last_run_at:string|null; last_error:string|null};
  counts:{doc_kind:string;remaining:number;errors:number}[]; recent:SyncRow[]; remaining:number;
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
  const stop = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const data = await invoke<Status>({action:'status'});
      if (!mounted.current) return;
      setStatus(data); setError('');
      setFolders({root_folder_id:data.settings.root_folder_id,kunder_folder_id:data.settings.kunder_folder_id});
      return data;
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : String(e)); }
  },[]);
  useEffect(() => { mounted.current = true; void refresh(); return () => {mounted.current = false;stop.current = true;}; },[refresh]);
  async function saveSettings(values: {enabled?:boolean;root_folder_id?:string;kunder_folder_id?:string}) {
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
    try {await invoke({action:'retry',id}); await refresh(); toast.success('Dokumentet har behandlats igen');}
    catch (e) {toast.error(e instanceof Error ? e.message : String(e));}
    finally {setBusy(false);}
  }
  const date = (value:string|null) => value ? new Date(value).toLocaleString('sv-SE') : '—';
  return <div className="space-y-8 pb-8">
    <header className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">Drive-synk</h2><Button variant="outline" size="icon" title="Uppdatera status" disabled={busy || testing} onClick={() => void refresh()}><RefreshCw className="h-4 w-4"/></Button></header>
    {error && <p role="alert" className="text-destructive break-words">{error}</p>}
    {!status && !error && <Loader2 className="h-5 w-5 animate-spin" aria-label="Hämtar status"/>}
    {status && <>
      <section className="space-y-4 border-b border-border pb-6">
        <div className="flex items-center justify-between gap-4"><h3 className="font-semibold">Koppling</h3><div className="flex items-center gap-3"><Label htmlFor="drive-enabled">Automatisk synkning</Label><Switch id="drive-enabled" checked={status.settings.enabled} disabled={busy || testing} onCheckedChange={enabled => void saveSettings({enabled})}/></div></div>
        {status.client_email ? <><p className="font-mono text-sm break-all">{status.client_email}</p><p className="text-sm text-muted-foreground">Dela mappen Allt från Case-flow med den här adressen som Redigerare. Dela även mappen Kunder.</p></> : <p className="text-destructive" role="alert">{status.credential_error || 'GOOGLE_SERVICE_ACCOUNT_JSON saknas'}</p>}
        <div className="grid gap-4 md:grid-cols-2">{(['root_folder_id','kunder_folder_id'] as const).map(key => <div key={key} className="space-y-2"><Label htmlFor={key}>{key === 'root_folder_id' ? 'Rotmappens id' : 'Kunder-mappens id'}</Label><Input id={key} value={folders[key]} disabled={busy || testing} onChange={e => setFolders({...folders,[key]:e.target.value})}/></div>)}</div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || testing || !folders.root_folder_id.trim() || !folders.kunder_folder_id.trim()} onClick={() => void saveSettings({root_folder_id:folders.root_folder_id.trim(),kunder_folder_id:folders.kunder_folder_id.trim()})}>Spara mappar</Button><Button variant="outline" disabled={busy || testing} onClick={() => void test()}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Link className="mr-2 h-4 w-4"/>}Testa koppling</Button></div>
        {testResult && <p role="status" className="text-sm break-words">{testResult}</p>}
        <p className="text-sm text-muted-foreground">{status.automatic_ready ? 'Automatiken är ansluten.' : 'Automatiken väntar på ett lyckat kopplingstest.'} Senaste körning: {date(status.settings.last_run_at)}</p>
        {status.settings.last_error && <p className="text-sm text-destructive break-words">{status.settings.last_error}</p>}
      </section>
      <section className="space-y-4">
        <h3 className="font-semibold">Att synka</h3>
        <table className="w-full text-sm"><thead className="text-muted-foreground"><tr className="border-b border-border"><th className="text-left py-2">Dokumenttyp</th><th className="text-right">Kvar</th><th className="text-right">Fel</th></tr></thead><tbody>{status.counts.map(row => <tr key={row.doc_kind} className="border-b border-border"><td className="py-3">{labels[row.doc_kind]}</td><td className="text-right font-mono">{row.remaining}</td><td className="text-right font-mono">{row.errors}</td></tr>)}</tbody></table>
        <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || testing || !status.settings.enabled} onClick={() => void run()}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`}/>Synka nu</Button>{busy && <Button variant="outline" onClick={() => {stop.current = true;setProgress(p => `${p} · stoppar efter denna omgång`);}}><Square className="mr-2 h-4 w-4"/>Stoppa</Button>}<span role="status" className="text-sm text-muted-foreground">{progress}</span></div>
      </section>
      <section className="space-y-4"><h3 className="font-semibold">Senaste synkningar</h3><div className="overflow-x-auto"><table className="w-full text-sm min-w-[780px]"><thead className="text-muted-foreground"><tr className="border-b border-border">{['Datum','Typ / filnamn','Mapp','Status','Fel',''].map((t,i) => <th key={i} className="text-left py-2 pr-3">{t}</th>)}</tr></thead><tbody>{status.recent.map(row => <tr key={row.id} className="border-b border-border align-top"><td className="py-3 pr-3 whitespace-nowrap">{date(row.updated_at)}</td><td className="py-3 pr-3 max-w-72 break-words"><div className="text-xs text-muted-foreground mb-1">{labels[row.doc_kind]}</div>{row.drive_web_link?.startsWith('https://drive.google.com/') ? <a className="text-primary underline" href={row.drive_web_link} target="_blank" rel="noopener noreferrer">{row.file_name}<ExternalLink className="inline ml-1 h-3 w-3"/></a> : row.file_name}</td><td className="py-3 pr-3 max-w-60 break-words">{row.drive_folder_path || '—'}</td><td className="py-3 pr-3"><Badge variant={row.status === 'error' ? 'destructive' : row.status === 'synced' ? 'default' : 'secondary'}>{({pending:'Väntar',synced:'Synkad',skipped:'Fanns redan',error:'Fel'} as Record<string,string>)[row.status] || row.status}</Badge></td><td className="py-3 pr-3 max-w-64 break-words">{row.error}</td><td className="py-3">{row.status === 'error' && <Button size="sm" variant="outline" disabled={busy || testing} onClick={() => void retry(row.id)}>Försök igen</Button>}</td></tr>)}</tbody></table></div>{status.recent.length === 0 && <p className="text-sm text-muted-foreground">Inga synkningar ännu.</p>}</section>
    </>}
  </div>;
}