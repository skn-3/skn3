import { useState } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { useSpeech, SpeechReply } from '@/hooks/useSpeech';
export function ReadAloudButton({messageId,text,speech}:{messageId:string;text:string;speech:ReturnType<typeof useSpeech>}){
 const [busy,setBusy]=useState(false);const [own,setOwn]=useState(false);
 return <Button variant="ghost" className="min-h-12 gap-2 text-muted-foreground" disabled={busy&&!speech.speaking} onClick={async()=>{if(own&&speech.speaking){speech.stop();setOwn(false);return;}speech.unlock();setBusy(true);try{const {data,error}=await supabase.functions.invoke<SpeechReply>('n3-ai',{body:{action:'speak',message_id:messageId}});if(error)throw error;if(data?.tts_error)toast.error(data.tts_error);setOwn(true);await speech.speak(data?.audio_base64,data?.audio_mime,data?.speech_text??text);}catch{toast.error('Uppläsningen kunde inte hämtas.');await speech.speak(undefined,undefined,text);}finally{setBusy(false);setOwn(false);}}}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:own&&speech.speaking?<Square className="h-4 w-4"/>:<Volume2 className="h-4 w-4"/>}{own&&speech.speaking?'Stoppa':'Läs upp'}</Button>;
}
