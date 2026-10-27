import { useCallback, useEffect, useRef, useState } from 'react';
let sharedAudio:HTMLAudioElement|undefined;
export interface SpeechReply { speech_text?:string; audio_base64?:string; audio_mime?:string; tts_skipped?:string; tts_error?:string }
export function useSpeech(open=false){
 const [speaking,setSpeaking]=useState(false);const finish=useRef<(()=>void)|null>(null);const sequence=useRef(0);const url=useRef<string>();
 const stop=useCallback(()=>{sequence.current++;sharedAudio?.pause();if(sharedAudio)sharedAudio.removeAttribute('src');window.speechSynthesis?.cancel();if(url.current)URL.revokeObjectURL(url.current);url.current=undefined;setSpeaking(false);finish.current?.();finish.current=null;},[]);
 const unlock=useCallback(()=>{sharedAudio??=new Audio();sharedAudio.playsInline=true;sharedAudio.src='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';void sharedAudio.play().catch(()=>{});},[]);
 const speak=useCallback(async(audioBase64?:string,mime='audio/mpeg',text='')=>{
  stop();const token=sequence.current;setSpeaking(true);
  await new Promise<void>(resolve=>{finish.current=resolve;const done=()=>{if(token!==sequence.current)return;setSpeaking(false);if(url.current)URL.revokeObjectURL(url.current);url.current=undefined;finish.current=null;resolve();};
   const fallback=()=>{if(token!==sequence.current)return;if(!window.speechSynthesis||!text){done();return;}const utterance=new SpeechSynthesisUtterance(text);utterance.lang='sv-SE';utterance.voice=window.speechSynthesis.getVoices().find(v=>v.lang.startsWith('sv'))??null;utterance.onend=done;utterance.onerror=done;window.speechSynthesis.speak(utterance);};
   if(!audioBase64){fallback();return;}try{sharedAudio??=new Audio();const bytes=Uint8Array.from(atob(audioBase64),c=>c.charCodeAt(0));url.current=URL.createObjectURL(new Blob([bytes],{type:mime}));sharedAudio.src=url.current;sharedAudio.onended=done;sharedAudio.onerror=fallback;void sharedAudio.play().catch(fallback);}catch{fallback();}
  });
 },[stop]);
 useEffect(()=>{if(!open)return;let released=false;let lock:WakeLockSentinel|undefined;const acquire=async()=>{if(document.visibilityState!=='visible')return;try{const next=await navigator.wakeLock?.request('screen');if(released)await next?.release();else lock=next;}catch{/* unsupported or denied */}};void acquire();document.addEventListener('visibilitychange',acquire);return()=>{released=true;document.removeEventListener('visibilitychange',acquire);void lock?.release();stop();};},[open,stop]);
 useEffect(()=>()=>stop(),[stop]);return {speaking,speak,stop,unlock};
}
