import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { pickAudioMimeType, MAX_AUDIO_SECONDS } from '@/lib/aiChat';
export const SILENCE_THRESHOLD = 0.025;
export function useVoiceRecorder({ onText, onError, disabled }: { onText: (text: string) => void; onError: (message: string) => void; disabled?: boolean }) {
 const [supported] = useState(() => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!pickAudioMimeType(t => MediaRecorder.isTypeSupported(t)));
 const [state,setState]=useState<'idle'|'recording'|'transcribing'>('idle');const [seconds,setSeconds]=useState(0);
 const refs=useRef({onText,onError,disabled});refs.current={onText,onError,disabled};
 const recorder=useRef<MediaRecorder|null>(null);const stream=useRef<MediaStream|null>(null);const context=useRef<AudioContext|null>(null);const interval=useRef<ReturnType<typeof setInterval>|null>(null);const alive=useRef(true);const generation=useRef(0);const starting=useRef(false);
 const cleanup=useCallback(()=>{if(interval.current)clearInterval(interval.current);interval.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;void context.current?.close().catch(()=>{});context.current=null;recorder.current=null;},[]);
 const cancel=useCallback(()=>{generation.current++;const rec=recorder.current;if(rec&&rec.state!=='inactive')rec.stop();cleanup();if(alive.current){setState('idle');setSeconds(0);}},[cleanup]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;cancel();};},[cancel]);
 const stop=useCallback(()=>{const rec=recorder.current;if(rec&&rec.state==='recording')rec.stop();},[]);
 const start=useCallback(async(automatic=false)=>{
  if(!supported||refs.current.disabled||recorder.current||starting.current)return;starting.current=true;const token=++generation.current;
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:true});if(!alive.current||token!==generation.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;
   const mime=pickAudioMimeType(t=>MediaRecorder.isTypeSupported(t));if(!mime){cleanup();return;}
   const chunks:Blob[]=[];const rec=new MediaRecorder(media,{mimeType:mime});recorder.current=rec;const began=Date.now();let lastSound=began;let heard=false;
   let analyser:AnalyserNode|undefined;let levels:Uint8Array<ArrayBuffer>|undefined;
   if(automatic){const ctx=new AudioContext();context.current=ctx;await ctx.resume();analyser=ctx.createAnalyser();analyser.fftSize=512;ctx.createMediaStreamSource(media).connect(analyser);levels=new Uint8Array(analyser.fftSize);}
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   rec.onstop=()=>{const duration=Math.min(MAX_AUDIO_SECONDS,Math.max(1,Math.round((Date.now()-began)/1000)));const blob=new Blob(chunks,{type:mime});cleanup();if(token!==generation.current||!alive.current)return;if(automatic&&!heard){setState('idle');setSeconds(0);refs.current.onText('');return;}setState('transcribing');void(async()=>{
    try{const audio_base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]??'');reader.onerror=reject;reader.readAsDataURL(blob);});
     const {data,error}=await supabase.functions.invoke<{text?:string;reply?:string;error_code?:string}>('n3-ai',{body:{action:'transcribe',audio_base64,mime_type:mime,duration_seconds:duration}});if(error)throw error;if(data?.error_code)throw new Error(data.reply);if(token===generation.current&&alive.current)refs.current.onText((data?.text??'').trim());
    }catch(e){if(token===generation.current&&alive.current)refs.current.onError(e instanceof Error?e.message:'Kunde inte tolka ljudet. Försök igen eller skriv.');}
    finally{if(token===generation.current&&alive.current){setState('idle');setSeconds(0);}}
   })();};
   setState('recording');setSeconds(0);rec.start(250);
   interval.current=setInterval(()=>{const elapsed=Date.now()-began;setSeconds(Math.floor(elapsed/1000));if(analyser&&levels){analyser.getByteTimeDomainData(levels);const rms=Math.sqrt(levels.reduce((sum,v)=>sum+((v-128)/128)**2,0)/levels.length);if(rms>SILENCE_THRESHOLD){heard=true;lastSound=Date.now();}if((heard&&Date.now()-lastSound>=2000)||(!heard&&elapsed>=8000))stop();}if(elapsed>=(automatic?20:MAX_AUDIO_SECONDS)*1000)stop();},100);
  }catch{cleanup();if(alive.current&&token===generation.current){setState('idle');refs.current.onError('Mikrofonen är blockerad. Tillåt den i webbläsarens inställningar.');}}finally{starting.current=false;}
 },[supported,cleanup,stop]);
 return {supported,state,seconds,start,stop,cancel};
}
