import { useEffect, useRef, useState } from 'react';
import { Mic, Square, VolumeX, Loader2, X, AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useSpeech, type SpeechReply } from '@/hooks/useSpeech';
import { useAiChat, type AiReply } from '@/hooks/useAiChat';
import { useChatCases } from '@/hooks/useChatCases';
import { parseAiReply } from '@/lib/aiChat';
import { AiActionCard } from './AiActionCard';
import { ChatCaseCard } from './ChatCaseCard';
import { useNavigate } from 'react-router-dom';
type Ai = ReturnType<typeof useAiChat>;
export function VoiceModeSheet({open,onOpenChange,ai,onOpenCase}:{open:boolean;onOpenChange:(open:boolean)=>void;ai:Ai;onOpenCase:(id:string)=>void}){
 const mobile=useIsMobile();const navigate=useNavigate();const speech=useSpeech(open);const [automatic,setAutomatic]=useState(true);const [status,setStatus]=useState('');const [thinking,setThinking]=useState(false);const [utterance,setUtterance]=useState('');const [answer,setAnswer]=useState<AiReply|null>(null);const empty=useRef(0);const active=useRef(open);active.current=open;const automaticRef=useRef(automatic);automaticRef.current=automatic;const turn=useRef(0);
 const recorder=useVoiceRecorder({disabled:thinking||speech.speaking||ai.busy,onText:text=>void submit(text),onError:message=>{setAutomatic(false);setStatus(message);void speech.speak(undefined,undefined,'Något gick fel, försök igen.');}});
 const cases=useChatCases(answer?.case_ids??[]);
 useEffect(()=>{if(!open){turn.current++;recorder.cancel();speech.stop();setThinking(false);}else{setStatus('');setAutomatic(true);empty.current=0;}},[open]);
 function listenNext(){setTimeout(()=>{if(active.current&&automaticRef.current)void recorder.start(true);},150);}
 async function play(data:SpeechReply){if(data.tts_error)setStatus(data.tts_error);await speech.speak(data.audio_base64,data.audio_mime,data.speech_text??'');if(active.current&&automaticRef.current){setStatus('');listenNext();}}
 async function submit(text:string){
  if(!active.current)return;
  if(!text){empty.current++;if(empty.current>=2){setAutomatic(false);setStatus('Jag hör inget – tryck på knappen när du vill prata.');}else if(automaticRef.current)listenNext();return;}
  empty.current=0;setUtterance(text);setThinking(true);setStatus('');const token=++turn.current;
  const data=await ai.send(text,undefined,'voice');if(token!==turn.current||!active.current)return;setThinking(false);
  if(!data||data===true){setAutomatic(false);setStatus('Något gick fel, försök igen.');await speech.speak(undefined,undefined,'Något gick fel, försök igen.');return;}
  setAnswer(data);await play(data);
 }
 const stored=ai.messages.find(m=>m.id===answer?.message_id);const actionId=answer?.action_id??stored?.action_id;const action=ai.actions.find(a=>a.id===actionId);const parsed=parseAiReply(answer?.reply??'');
 const label=status||(thinking||recorder.state==='transcribing'?'Tänker…':speech.speaking?'Talar…':recorder.state==='recording'?`Lyssnar… ${String(Math.floor(recorder.seconds/60)).padStart(2,'0')}:${String(recorder.seconds%60).padStart(2,'0')}`:'Tryck för att prata');
 function close(){recorder.cancel();speech.stop();onOpenChange(false);}
 return <Sheet open={open} onOpenChange={value=>{if(!value)close();else onOpenChange(true);}}><SheetContent side={mobile?'bottom':'right'} className={`safe-bottom flex flex-col gap-5 p-6 [&>button]:hidden ${mobile?'h-[100dvh]':'w-[420px] sm:max-w-[420px]'}`} onOpenAutoFocus={e=>e.preventDefault()}>
 <div className="flex items-center justify-between gap-2"><SheetTitle className="font-display">Samtalsläge</SheetTitle><Button variant="ghost" size="icon" className="h-12 w-12" aria-label="Stäng Samtalsläge" onClick={close}><X className="h-5 w-5"/></Button></div>
 <SheetDescription className="sr-only">Prata med N3prenad-AI och bekräfta åtgärder med rösten.</SheetDescription>
 <div className="text-center space-y-3" role="status"><p className={`font-display text-xl ${status?'text-destructive':'text-foreground'}`}>{label}</p><AudioLines aria-hidden className={`mx-auto h-8 w-8 text-primary ${speech.speaking||recorder.state==='recording'?'animate-pulse motion-reduce:animate-none':''}`}/></div>
 <div className="flex-1 min-h-0 overflow-y-auto space-y-4">{utterance&&<p className="text-muted-foreground text-sm whitespace-pre-wrap">{utterance}</p>}{answer&&<p className="text-[17px] text-foreground whitespace-pre-wrap break-words">{parsed.reply}</p>}{action&&<AiActionCard action={action} onDecide={async(id,decision)=>{recorder.cancel();speech.stop();const data=await ai.decide(id,decision);if(data&&active.current){setAnswer(data);await play({speech_text:parseAiReply(data.reply).reply});}}}/>}{(answer?.case_ids??[]).map(id=><ChatCaseCard key={id} caseData={cases.data?.find(c=>c.id===id)} loading={cases.isLoading} onOpen={()=>{close();onOpenCase(id);}}/>)}{parsed.links.map(link=><Button key={link.path} variant="outline" className="min-h-12 h-auto whitespace-normal" onClick={()=>{close();navigate(link.path);}}>{link.label}</Button>)}</div>
 <div className="flex justify-center"><Button size="icon" variant={recorder.state==='recording'?'destructive':'default'} className="h-24 w-24 rounded-full shrink-0" disabled={!recorder.supported||thinking||recorder.state==='transcribing'||ai.busy} aria-label={speech.speaking?'Stoppa uppläsning':recorder.state==='recording'?'Stopp':'Prata'} onClick={()=>{if(speech.speaking){speech.stop();setAutomatic(false);}else if(recorder.state==='recording')recorder.stop();else{speech.unlock();void recorder.start();}}}>{thinking||recorder.state==='transcribing'?<Loader2 className="h-9 w-9 animate-spin motion-reduce:animate-none"/>:speech.speaking?<VolumeX className="h-9 w-9"/>:recorder.state==='recording'?<Square className="h-9 w-9"/>:<Mic className="h-9 w-9"/>}</Button></div>
 {!recorder.supported&&<p className="text-sm text-destructive">Röstinspelning stöds inte i den här webbläsaren.</p>}
 <div className="flex items-center justify-between gap-3 min-h-12"><Label htmlFor="voice-auto" className="leading-5">Lyssna automatiskt efter svar</Label><Switch id="voice-auto" checked={automatic} onCheckedChange={value=>{setAutomatic(value);if(!value)recorder.cancel();}}/></div>
 <Button variant="outline" className="min-h-12" onClick={close}>Avsluta</Button><p className="text-xs text-center text-muted-foreground">Allt du säger sparas i chatten.</p>
 </SheetContent></Sheet>;
}
