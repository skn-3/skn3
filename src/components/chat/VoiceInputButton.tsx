import { Loader2, Mic, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
export function VoiceInputButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
 const {supported,state,seconds,start,stop,cancel}=useVoiceRecorder({disabled,onText:text=>{if(text)onText(text);else toast.error('Kunde inte tolka ljudet. Försök igen eller skriv.');},onError:message=>toast.error(message)});
 if(!supported)return null;
  if (state === 'recording') {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    return (
      <div className="flex items-center gap-2" role="status">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse motion-reduce:animate-none" aria-hidden />
        <span className="font-mono text-sm tabular-nums">{mm}:{ss}</span>
        <span className="text-xs text-muted-foreground">Tryck för att stoppa</span>
        <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" aria-label="Stoppa inspelningen" onClick={stop}>
          <Mic className="h-5 w-5 text-destructive" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-12 w-12 shrink-0" aria-label="Avbryt inspelningen" onClick={cancel}>
          <X className="h-5 w-5" />
        </Button>
      </div>
    );
  }
  if (state === 'transcribing') {
    return (
      <div className="flex h-12 items-center gap-2 px-2 text-xs text-muted-foreground" role="status">
        <Loader2 className="h-5 w-5 animate-spin" /> Tolkar
      </div>
    );
  }
  return (
    <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" aria-label="Spela in röstmeddelande" disabled={disabled} onClick={() => void start()}>
      <Mic className="h-5 w-5" />
    </Button>
  );
}
