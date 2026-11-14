import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Loader2, Mail, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GOOGLE_ADD_BY_URL, googleAddUrl, webcalUrl, type ConnectionRow } from '@/lib/calendarFeed';
import {
  APPLE_TEXTS, DESKTOP_TEXTS, DONE_TEXTS, GOOGLE_TEXTS, GUIDE_POLL_MAX_MS, GUIDE_POLL_MS, MOBILE_TEXTS, WAIT_TEXTS,
  alreadyAddedOk, clientLabel, doneText, fetchedSince, googleConnected, googleStep1, previewRows, relativeAgo, sentTo,
  type PreviewRow,
} from '@/lib/calendar/guide';
import type { GuidePlatform } from '@/lib/calendar/platform';

export type GuideSendResult =
  | { status: 'sent'; masked: string }
  | { status: 'local'; masked: string }
  | { status: 'no_email' }
  | { status: 'failed' };

export interface CalendarGuideProps {
  name: string;
  /** Montör eller team: "teamets mejl" och tipset om fler telefoner. */
  team: boolean;
  feedUrl: string | null;
  guideUrl: string | null;
  initialPlatform: GuidePlatform;
  preview: PreviewRow[];
  upcomingCount: number | null;
  readStatus: () => Promise<ConnectionRow | null>;
  /** Saknas på den publika sidan (kräver inloggning). */
  sendLink?: () => Promise<GuideSendResult>;
  onSnooze?: () => void;
  onPending?: () => void;
  onDone?: () => void;
  onShowSchedule?: () => void;
  /** Kallas när läget byts (för att flytta fokus/scrolla upp i behållaren). */
  onModeChange?: () => void;
}

type Mode = 'apple' | 'google' | 'mobile' | 'desktop' | 'waiting' | 'notSeen' | 'done';

const H = 'font-display text-xl font-bold leading-tight text-foreground';
const P = 'text-[15px] leading-relaxed text-muted-foreground';
const LINK = 'inline-flex min-h-11 items-center px-1 text-[15px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md';
const BIG = 'h-12 w-full text-base font-semibold';

export function CalendarGuide(props: CalendarGuideProps) {
  const { name, team, feedUrl, guideUrl, initialPlatform, preview, upcomingCount, readStatus, sendLink, onSnooze, onPending, onDone, onShowSchedule, onModeChange } = props;
  const [mode, setModeState] = useState<Mode>(initialPlatform);
  const [lastPlatform, setLastPlatform] = useState<Mode>(initialPlatform);
  const [doneRow, setDoneRow] = useState<ConnectionRow | null>(null);
  const [alreadyError, setAlreadyError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [send, setSend] = useState<{ busy: boolean; result: GuideSendResult | null }>({ busy: false, result: null });
  const tapAt = useRef(0);
  const webcal = feedUrl ? webcalUrl(feedUrl) : null;

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    if (m === 'apple' || m === 'google' || m === 'desktop') setLastPlatform(m);
    setAlreadyError(false);
    onModeChange?.();
  }, [onModeChange]);

  const finish = useCallback((row: ConnectionRow | null) => {
    setDoneRow(row);
    setMode('done');
    onDone?.();
  }, [onDone, setMode]);

  // Väntar på kalendern: läs status var fjärde sekund i högst 90 sekunder.
  useEffect(() => {
    if (mode !== 'waiting') return;
    let stopped = false;
    const started = Date.now();
    const tick = async () => {
      try {
        const row = await readStatus();
        if (stopped) return;
        if (fetchedSince(row, tapAt.current)) { finish(row); return; }
      } catch { /* försök igen vid nästa tick */ }
      if (!stopped && Date.now() - started >= GUIDE_POLL_MAX_MS) setMode('notSeen');
    };
    const id = window.setInterval(tick, GUIDE_POLL_MS);
    return () => { stopped = true; window.clearInterval(id); };
  }, [mode, readStatus, finish, setMode]);

  // Google-läget: klart när servern har sett Google hämta.
  useEffect(() => {
    if (mode !== 'google') return;
    let stopped = false;
    const tick = async () => {
      try {
        const row = await readStatus();
        if (!stopped && googleConnected(row, new Date())) finish(row);
      } catch { /* ignoreras */ }
    };
    void tick();
    const id = window.setInterval(tick, GUIDE_POLL_MS);
    return () => { stopped = true; window.clearInterval(id); };
  }, [mode, readStatus, finish]);

  const startWaiting = () => {
    tapAt.current = Date.now();
    onPending?.();
    setMode('waiting');
  };

  const copy = async () => {
    if (!feedUrl) return;
    onPending?.();
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success('Länken är kopierad');
    } catch {
      toast.error('Länken kunde inte kopieras');
    }
  };

  const checkAlready = async () => {
    setChecking(true);
    try {
      const row = await readStatus();
      if (alreadyAddedOk(row, new Date())) finish(row);
      else setAlreadyError(true);
    } catch {
      setAlreadyError(true);
    } finally {
      setChecking(false);
    }
  };

  const doSend = async () => {
    if (!sendLink) return;
    setSend({ busy: true, result: null });
    onPending?.();
    try {
      setSend({ busy: false, result: await sendLink() });
    } catch {
      setSend({ busy: false, result: { status: 'failed' } });
    }
  };

  const ready = !!feedUrl;

  if (mode === 'done') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-primary"><Check className="h-5 w-5" aria-hidden="true" /></span>
          <div className="space-y-1.5">
            <h2 className={H}>{DONE_TEXTS.title}</h2>
            <p className={P}>{doneText(name)}</p>
          </div>
        </div>
        <dl className="divide-y divide-border rounded-xl border border-border bg-card text-[15px]">
          <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-muted-foreground">{DONE_TEXTS.fetchedBy}</dt><dd className="font-semibold">{clientLabel(doneRow?.last_client)}</dd></div>
          <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-muted-foreground">{DONE_TEXTS.latest}</dt><dd className="font-semibold">{relativeAgo(doneRow?.last_fetched_at, new Date()) || 'nyss'}</dd></div>
          {upcomingCount !== null && <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-muted-foreground">{DONE_TEXTS.upcoming}</dt><dd className="font-mono font-semibold">{upcomingCount}</dd></div>}
        </dl>
        {team && <p className={P}>{DONE_TEXTS.teamTip}</p>}
        <Button className={BIG} onClick={onShowSchedule}>{DONE_TEXTS.show}</Button>
      </div>
    );
  }

  if (mode === 'waiting' || mode === 'notSeen') {
    return (
      <div className="space-y-4">
        <h2 className={H}>{APPLE_TEXTS.title}</h2>
        {mode === 'waiting' ? (
          <p role="status" className="flex min-h-12 items-center gap-3 rounded-xl border border-gold bg-gold-soft px-4 text-[15px] font-semibold text-foreground">
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {WAIT_TEXTS.waiting}
          </p>
        ) : (
          <>
            <p role="status" className="rounded-xl border border-gold bg-gold-soft px-4 py-3 text-[15px] text-foreground">{WAIT_TEXTS.notSeen}</p>
            {webcal && <Button asChild className={BIG}><a href={webcal} onClick={startWaiting}>{WAIT_TEXTS.retry}</a></Button>}
          </>
        )}
        <p className={P}>{APPLE_TEXTS.hint}</p>
        <button type="button" className={LINK} onClick={() => setMode(lastPlatform === 'waiting' || lastPlatform === 'notSeen' ? 'apple' : lastPlatform)}>Tillbaka</button>
      </div>
    );
  }

  if (mode === 'google') {
    const r = send.result;
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h2 className={H}>{GOOGLE_TEXTS.title}</h2>
          <p className={P}>{GOOGLE_TEXTS.intro}</p>
        </div>
        <ol className="space-y-3">
          <Step n={1} title={googleStep1(team)}>
            {sendLink ? (
              <>
                <Button onClick={doSend} disabled={send.busy || !ready} className="h-11 w-full sm:w-auto">
                  {send.busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                  {GOOGLE_TEXTS.sendButton}
                </Button>
                {r && (
                  <p role="status" className="text-sm text-foreground">
                    {r.status === 'sent' && sentTo(r.masked)}
                    {r.status === 'local' && `${GOOGLE_TEXTS.localSkip} ${r.masked ? `Mottagare: ${r.masked}.` : ''}`}
                    {r.status === 'no_email' && (team ? GOOGLE_TEXTS.noEmailTeam : GOOGLE_TEXTS.noEmailPerson)}
                    {r.status === 'failed' && GOOGLE_TEXTS.sendFailed}
                  </p>
                )}
              </>
            ) : (
              <Button variant="outline" onClick={copy} disabled={!ready} className="h-11 w-full sm:w-auto"><Copy className="h-4 w-4" aria-hidden="true" />{MOBILE_TEXTS.step1}</Button>
            )}
          </Step>
          <Step n={2} title={GOOGLE_TEXTS.step2}><p className="text-sm text-muted-foreground">{GOOGLE_TEXTS.step2Text}</p></Step>
          <Step n={3} title={GOOGLE_TEXTS.step3}><p className="text-sm text-muted-foreground">{GOOGLE_TEXTS.step3Text}</p></Step>
        </ol>
        <p className="text-sm text-muted-foreground">{GOOGLE_TEXTS.note}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="h-11" onClick={() => setMode('mobile')}><Smartphone className="h-4 w-4" aria-hidden="true" />{GOOGLE_TEXTS.mobile}</Button>
          {onSnooze && <Button variant="outline" className="h-11" onClick={onSnooze}>{GOOGLE_TEXTS.snooze}</Button>}
        </div>
        <button type="button" className={LINK} onClick={() => setMode('apple')}>{GOOGLE_TEXTS.toApple}</button>
      </div>
    );
  }

  if (mode === 'mobile') {
    return (
      <div className="space-y-4">
        <h2 className={H}>{GOOGLE_TEXTS.title}</h2>
        <ol className="space-y-3">
          <Step n={1} title={MOBILE_TEXTS.step1}>
            <Button onClick={copy} disabled={!ready} className="h-11 w-full sm:w-auto"><Copy className="h-4 w-4" aria-hidden="true" />{MOBILE_TEXTS.step1}</Button>
          </Step>
          <Step n={2} title={MOBILE_TEXTS.step2}>
            <a href={GOOGLE_ADD_BY_URL} target="_blank" rel="noopener noreferrer" className={LINK}>calendar.google.com</a>
          </Step>
          <Step n={3} title={MOBILE_TEXTS.step3} />
        </ol>
        <button type="button" className={LINK} onClick={() => setMode('google')}>Tillbaka</button>
      </div>
    );
  }

  if (mode === 'desktop') {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h2 className={H}>{DESKTOP_TEXTS.title}</h2>
          <p className={P}>{APPLE_TEXTS.intro}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="grid gap-2">
            {webcal && <Button asChild className="h-11"><a href={googleAddUrl(webcal)} target="_blank" rel="noopener noreferrer" onClick={() => onPending?.()}>{DESKTOP_TEXTS.google}</a></Button>}
            {webcal && <Button asChild variant="outline" className="h-11"><a href={webcal} onClick={startWaiting}>{DESKTOP_TEXTS.apple}</a></Button>}
            <Button variant="outline" className="h-11" onClick={copy} disabled={!ready}><Copy className="h-4 w-4" aria-hidden="true" />{DESKTOP_TEXTS.copy}</Button>
            <p className="text-sm text-muted-foreground">{DESKTOP_TEXTS.outlook}</p>
          </div>
          {guideUrl && (
            <figure className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3">
              <div className="rounded-md bg-background p-2"><QRCodeSVG value={guideUrl} size={132} bgColor="transparent" fgColor="currentColor" className="text-foreground" aria-label="QR-kod till guiden" /></div>
              <figcaption className="text-sm font-semibold">{DESKTOP_TEXTS.qr}</figcaption>
            </figure>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4">
          <button type="button" className={LINK} onClick={checkAlready} disabled={checking}>{APPLE_TEXTS.already}</button>
        </div>
        {alreadyError && <p role="status" className="rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm text-foreground">{WAIT_TEXTS.alreadyFail}</p>}
      </div>
    );
  }

  // Apple-läget
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h2 className={H}>{APPLE_TEXTS.title}</h2>
        <p className={P}>{APPLE_TEXTS.intro}</p>
      </div>
      <section className="rounded-xl border border-border bg-card p-3" aria-label={APPLE_TEXTS.previewTitle}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{APPLE_TEXTS.previewTitle}</p>
        <ul className="space-y-2">
          {previewRows(preview).map((r, i) => (
            <li key={i} className="flex gap-3 rounded-lg bg-muted/60 px-3 py-2">
              <span className={cn('mt-1 h-8 w-1 shrink-0 rounded-full', i === 0 ? 'bg-secondary-foreground/60' : 'bg-primary')} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{r.title}</span>
                <span className="block truncate text-sm text-muted-foreground">{r.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      {webcal ? (
        <Button asChild className={BIG}><a href={webcal} onClick={startWaiting}>{APPLE_TEXTS.primary}</a></Button>
      ) : (
        <Button className={BIG} disabled><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{APPLE_TEXTS.primary}</Button>
      )}
      <p className="text-sm text-muted-foreground">{APPLE_TEXTS.hint}</p>
      <div className="grid gap-2">
        {onSnooze && <Button variant="outline" className="h-11" onClick={onSnooze}>{APPLE_TEXTS.snooze}</Button>}
        <Button variant="outline" className="h-11" onClick={checkAlready} disabled={checking}>{APPLE_TEXTS.already}</Button>
      </div>
      {alreadyError && <p role="status" className="rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm text-foreground">{WAIT_TEXTS.alreadyFail}</p>}
      <button type="button" className={LINK} onClick={() => setMode('google')}>{APPLE_TEXTS.toGoogle}</button>
      <p className="border-t border-border pt-3 text-sm text-muted-foreground">{APPLE_TEXTS.foot}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-card p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-bold text-primary-foreground" aria-hidden="true">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-[15px] font-semibold leading-snug">{title}</p>
        {children}
      </div>
    </li>
  );
}
