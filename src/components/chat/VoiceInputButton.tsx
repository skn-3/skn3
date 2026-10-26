import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { pickAudioMimeType, MAX_AUDIO_SECONDS } from '@/lib/aiChat';

type VoiceState = 'idle' | 'recording' | 'transcribing';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Ljudet kunde inte läsas.'));
    reader.readAsDataURL(blob);
  });
}

export function VoiceInputButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [supported] = useState(() => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return false;
    if (!navigator.mediaDevices?.getUserMedia) return false;
    return !!pickAudioMimeType((t) => MediaRecorder.isTypeSupported(t));
  });
  const [state, setState] = useState<VoiceState>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const cancelled = useRef(false);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    if (autoStop.current) clearTimeout(autoStop.current);
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  if (!supported) return null;

  function cleanup() {
    if (timer.current) clearInterval(timer.current);
    if (autoStop.current) clearTimeout(autoStop.current);
    timer.current = null;
    autoStop.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
  }

  async function start() {
    if (state !== 'idle' || disabled) return;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('Mikrofonen är blockerad. Tillåt den i webbläsarens inställningar.');
      return;
    }
    const mimeType = pickAudioMimeType((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) return;
    chunks.current = [];
    cancelled.current = false;
    startedAt.current = Date.now();
    const rec = new MediaRecorder(stream.current, { mimeType });
    recorder.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const duration = Math.min(MAX_AUDIO_SECONDS, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
      const blob = new Blob(chunks.current, { type: mimeType });
      const wasCancelled = cancelled.current;
      cleanup();
      if (wasCancelled) { setState('idle'); setSeconds(0); return; }
      void transcribe(blob, mimeType, duration);
    };
    setSeconds(0);
    setState('recording');
    timer.current = setInterval(() => setSeconds(Math.min(MAX_AUDIO_SECONDS, Math.floor((Date.now() - startedAt.current) / 1000))), 250);
    autoStop.current = setTimeout(() => stop(), MAX_AUDIO_SECONDS * 1000);
    rec.start(250);
  }

  function stop() {
    if (state !== 'recording') return;
    recorder.current?.stop();
  }

  function cancel() {
    if (state !== 'recording') return;
    cancelled.current = true;
    recorder.current?.stop();
  }

  async function transcribe(blob: Blob, mimeType: string, duration: number) {
    setState('transcribing');
    try {
      const audio_base64 = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke<{ text?: string; reply?: string; error_code?: string }>('n3-ai', {
        body: { action: 'transcribe', audio_base64, mime_type: mimeType, duration_seconds: duration },
      });
      if (error) throw error;
      if (data?.error_code) { toast.error(data.reply ?? 'Kunde inte tolka ljudet. Försök igen eller skriv.'); return; }
      const text = (data?.text ?? '').trim();
      if (!text) { toast.error('Kunde inte tolka ljudet. Försök igen eller skriv.'); return; }
      onText(text);
    } catch {
      toast.error('Kunde inte tolka ljudet. Försök igen eller skriv.');
    } finally {
      setState('idle');
      setSeconds(0);
    }
  }

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
