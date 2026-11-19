import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Loader2, Settings, Share, Smartphone, SquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useMinWidth } from '@/hooks/useMinWidth';
import { usePush } from '@/hooks/usePush';
import { PUSH_TEXTS as T } from '@/lib/push/guide';
import { isIOSDevice } from '@/lib/push/platform';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Påminn mig i morgon"; stänger guiden. */
  onSnooze: () => void;
}

const STEP_ICONS = [Share, SquarePlus, Smartphone, Bell];

function blockedSteps(platform: string, ios: boolean): string[] {
  if (ios) return ['Öppna Inställningar på enheten.', 'Välj Notiser och sedan SmartKlimat N3prenad.', 'Slå på Tillåt notiser och öppna appen igen.'];
  if (platform === 'android' || /Android/i.test(navigator.userAgent)) {
    return ['Öppna Inställningar på telefonen och välj Appar.', 'Välj Chrome, eller SmartKlimat N3prenad om appen ligger på hemskärmen.', 'Välj Notiser och tillåt dem. Öppna sedan appen igen.'];
  }
  return ['Klicka på symbolen till vänster om adressen i webbläsaren.', 'Välj Notiser och sedan Tillåt.', 'Ladda om sidan och öppna Notiser i menyn igen.'];
}

/** Guiden "Notiser": bottenpanel på telefon, dialog på större skärmar (samma form som kalenderguiden). */
export function PushGuideDialog({ open, onOpenChange, onSnooze }: Props) {
  const wide = useMinWidth(768);
  const push = usePush();
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'none' | 'failed'>('idle');
  const ios = typeof navigator !== 'undefined' && isIOSDevice(navigator.userAgent, navigator.maxTouchPoints || 0);

  const { prefetch } = push;
  useEffect(() => { if (open) { setError(null); setTestState('idle'); prefetch(); } }, [open, prefetch]);

  const close = () => onOpenChange(false);
  // Körs direkt i trycket: tillståndsfrågan måste komma från användarens tryck.
  const onEnable = () => {
    setError(null);
    void push.enable().then((r) => { if (!r.ok) setError(r.message ?? 'Notiserna kunde inte slås på.'); });
  };
  const onTest = async () => {
    setTestState('sending');
    try { const r = await push.sendTest(); setTestState(r.sent > 0 ? 'sent' : r.devices > 0 ? 'failed' : 'none'); } catch { setTestState('failed'); }
  };
  const onDisable = async () => { setError(null); try { await push.disable(); } catch { setError('Notiserna kunde inte stängas av. Försök igen.'); } };

  const snooze = <Button variant="ghost" className="h-11 w-full" onClick={onSnooze}>{T.snooze}</Button>;
  const errorLine = error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null;

  const body = (() => {
    switch (push.status) {
      case 'needs-home-screen':
        return (
          <div className="space-y-4">
            <p className="text-[15px] text-muted-foreground">På iPhone och iPad fungerar notiser bara när SmartKlimat N3prenad ligger på hemskärmen.</p>
            <ol className="space-y-2">
              {T.iosSteps.map((step, i) => {
                const Icon = STEP_ICONS[i];
                return (
                  <li key={step} className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-bold text-primary-foreground">{i + 1}</span>
                    <span className="flex-1 text-[15px]">{step}</span>
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </li>
                );
              })}
            </ol>
            {snooze}
          </div>
        );
      case 'off':
        return (
          <div className="space-y-3">
            <Button className="h-12 w-full text-base" disabled={push.busy} onClick={onEnable}>
              {push.busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
              {push.busy ? 'Slår på...' : T.enable}
            </Button>
            {errorLine}
            <p className="text-sm text-muted-foreground">Enheten frågar om lov. Välj Tillåt.</p>
            {snooze}
          </div>
        );
      case 'on':
        return (
          <div className="space-y-3">
            <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-3 text-[15px] font-semibold text-primary">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />{T.on}
            </p>
            <Button className="h-12 w-full text-base" disabled={testState === 'sending'} onClick={onTest}>
              {testState === 'sending' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {T.test}
            </Button>
            <p role="status" className="min-h-5 text-sm text-muted-foreground">
              {testState === 'sent' ? 'Testnotisen är skickad. Den syns om några sekunder.'
                : testState === 'none' ? 'Enheten är inte registrerad ännu. Stäng av och slå på igen.'
                : testState === 'failed' ? 'Testnotisen kunde inte skickas. Försök igen om en stund.' : ''}
            </p>
            {errorLine}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="h-11 flex-1" disabled={push.busy} onClick={onDisable}><BellOff className="h-4 w-4" aria-hidden="true" />{T.disable}</Button>
              <Button variant="outline" className="h-11 flex-1" onClick={close}>Klar</Button>
            </div>
          </div>
        );
      case 'blocked':
        return (
          <div className="space-y-3">
            <p className="text-[15px]">Notiser är blockerade för SmartKlimat N3prenad på den här enheten. Så tillåter du dem:</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-[15px]">
              {blockedSteps(push.platform, ios).map((s) => <li key={s}>{s}</li>)}
            </ol>
            {snooze}
          </div>
        );
      default:
        return (
          <div className="space-y-3">
            <p className="text-[15px]">{T.unsupported}</p>
            <Button variant="outline" className="h-11 w-full" onClick={close}>Stäng</Button>
          </div>
        );
    }
  })();

  const content = open ? (
    <div className="space-y-4">
      <div className="flex items-start gap-3 pr-10">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          {push.status === 'blocked' ? <Settings className="h-5 w-5" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
        </span>
        <div className="space-y-1">
          <p aria-hidden="true" className="font-display text-[22px] font-bold leading-tight">{T.title}</p>
          <p className="text-[15px] text-muted-foreground">{T.intro}</p>
        </div>
      </div>
      {body}
    </div>
  ) : null;

  const closeButton = (
    <button type="button" onClick={close} aria-label="Stäng guiden" className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted">
      <X className="h-5 w-5" />
    </button>
  );

  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-hidden p-0 [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">{T.title}</DialogTitle>
          {closeButton}
          <div className="max-h-[90vh] overflow-y-auto p-6">{content}</div>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[94vh]">
        <DrawerTitle className="sr-only">{T.title}</DrawerTitle>
        <div className="relative">
          {closeButton}
          <div className="mx-auto max-h-[86vh] max-w-lg overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">{content}</div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
