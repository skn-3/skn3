import { useEffect,useState } from 'react';
import { Check,ListChecks,AlertTriangle,StickyNote,Calendar,CheckCircle2,Wrench,Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiReceipt } from '@/components/shared/AiReceipt';
import type { AiAction } from '@/hooks/useAiChat';
import { ACTION_TTL_MS } from '../../../supabase/functions/n3-ai/actions/logic';
const labels:Record<string,string>={confirmed:'Bekräftad',cancelled:'Avbruten',expired:'Utgången',failed:'Misslyckades'};
const icons:Record<string,typeof Check>={add_cost:Receipt,report_problem:AlertTriangle,add_note:StickyNote,partial_report:ListChecks,complete_montage:CheckCircle2,start_montage:Wrench,book_km:Calendar,book_montage:Calendar,reschedule_montage:Calendar};
export function AiActionCard({action,onDecide}:{action:AiAction;onDecide:(id:string,decision:'confirm'|'cancel')=>Promise<void>}){
 const [busy,setBusy]=useState(false);const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),10000);return()=>clearInterval(timer);},[]);
 const status=action.status==='pending'&&now-Date.parse(action.created_at)>=ACTION_TTL_MS?'expired':action.status;const pending=status==='pending'&&!action.decided_at;
 async function decide(decision:'confirm'|'cancel'){if(busy)return;setBusy(true);try{await onDecide(action.id,decision);}finally{setBusy(false);}}
  const Icon=icons[action.kind]??ListChecks;
  const rows=action.payload.rows??[{label:'Ärende',value:[action.payload.address,action.payload.city].filter(Boolean).join(', ')},{label:'Belopp',value:(action.payload.amount??0).toLocaleString('sv-SE')+' kr ex moms'},{label:'Beskrivning',value:action.payload.description??''}];
  const photo=action.payload.receipt_path??action.payload.photo_path;
  return <section className="rounded-lg border border-border bg-card text-card-foreground p-3 space-y-3" aria-label="Åtgärdsförslag"><h3 className="font-display font-bold flex items-center gap-2"><Icon className="h-5 w-5 shrink-0"/>{action.payload.title??'Lägg till kostnad'}</h3><dl className="text-sm space-y-2">{rows.map((row,i)=><div key={i}><dt className="text-muted-foreground">{row.label}</dt><dd className="break-words whitespace-pre-wrap">{row.value}</dd></div>)}</dl>{photo&&<AiReceipt path={photo}/>} {pending?<div className="flex gap-2"><Button className="min-h-12 flex-1" disabled={busy} onClick={()=>void decide('confirm')}><Check className="h-4 w-4 mr-2"/>{busy?'Skickar…':'Bekräfta'}</Button><Button variant="outline" className="min-h-12" disabled={busy} onClick={()=>void decide('cancel')}>Avbryt</Button></div>:<p className="text-sm font-semibold" role="status">{labels[status]??'Behandlas…'}</p>}{action.error&&<p className="text-sm text-destructive">{action.error}</p>}</section>;
}