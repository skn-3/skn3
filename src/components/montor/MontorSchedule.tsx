import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBookingActions, toastBookingWarnings } from '@/hooks/useBookingActions';
import type { CaseRow } from '@/lib/supabaseClient';
import type { BookingCase } from '@/lib/booking';
import {
  MONTOR_SCHEDULE_TEXTS as T, dayCards, dayGroupTitle, dayLabel, isoWeekOf, montorScheduleEvents, montorToBook, placeLabel,
  stepWeek, toIso, upcomingRows, weekChip, weekStrip, withScheduleFields, type ToBookRow,
} from '@/lib/schedule';
import { eventClasses, KIND_DOT } from '@/components/schedule/eventStyle';
import { MontorBookSheet, type MontorBookingValues } from './MontorBookSheet';

interface Props {
  cases: CaseRow[];
  /** Inloggat team; null = alla (admin utan filter). */
  team: string | null;
  currentUser: string;
  banner?: React.ReactNode;
  onOpenCase: (c: CaseRow) => void;
}

const mapsUrl = (address: string, city: string | null) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(placeLabel(address, city))}`;
const H2 = 'font-display text-lg font-semibold';

/** Montörens Schema: vald dag, veckoremsa, Kommande och Att boka. */
export function MontorSchedule({ cases, team, currentUser, banner, onOpenCase }: Props) {
  const today = toIso(new Date());
  const [selected, setSelected] = useState(today);
  const [booking, setBooking] = useState<ToBookRow | null>(null);
  const actions = useBookingActions();

  const withFields = useMemo(() => cases.map((c) => withScheduleFields(c)), [cases]);
  const byId = useMemo(() => new Map(withFields.map((c) => [c.id, c])), [withFields]);
  const events = useMemo(() => montorScheduleEvents(withFields, team), [withFields, team]);
  const strip = useMemo(() => weekStrip(selected, events, today), [selected, events, today]);
  const cards = useMemo(() => dayCards(selected, events, today), [selected, events, today]);
  const upcoming = useMemo(() => upcomingRows(events, selected), [events, selected]);
  const toBook = useMemo(() => montorToBook(withFields, team, today), [withFields, team, today]);
  const week = isoWeekOf(selected);

  const open = (caseId: string) => {
    const c = byId.get(caseId);
    if (c) onOpenCase(c);
  };

  const saving = actions.bookKm.isPending || actions.bookMontage.isPending;
  const submit = async ({ date, time, days }: MontorBookingValues) => {
    if (!booking) return;
    const caseData = booking.caseData as BookingCase;
    try {
      const r = booking.kind === 'km'
        ? await actions.bookKm.mutateAsync({ caseData, date, time: time || null, actor: currentUser, origin: 'montor' })
        : await actions.bookMontage.mutateAsync({ caseData, date, time: time || null, days, team: team ?? null, actor: currentUser, origin: 'montor' });
      toastBookingWarnings(r.warnings);
      toast.success(`${booking.kind === 'km' ? 'KM bokad' : 'Montage bokat'} ${dayLabel(date, today)}`);
      setBooking(null);
      setSelected(date);
    } catch (e) {
      toast.error(`Kunde inte boka: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-4">
      {banner}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-start">
        <section aria-labelledby="montor-schema-dag" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="montor-schema-dag" className="font-display text-xl font-bold first-letter:uppercase">{dayGroupTitle(selected)}</h2>
            <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-xs font-semibold">{weekChip(week.week)}</span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Föregående vecka" onClick={() => setSelected(stepWeek(selected, -1))}><ChevronLeft className="h-5 w-5" /></Button>
              <Button variant="outline" className="h-11 px-4" onClick={() => setSelected(today)}>Idag</Button>
              <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Nästa vecka" onClick={() => setSelected(stepWeek(selected, 1))}><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 rounded-[14px] border border-border bg-card p-1.5" role="group" aria-label="Veckans dagar">
            {strip.map((d) => {
              const active = d.date === selected;
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={active}
                  aria-label={d.ariaLabel}
                  aria-current={d.isToday ? 'date' : undefined}
                  onClick={() => setSelected(d.date)}
                  className={cn(
                    'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[10px] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors',
                    active ? 'bg-primary text-primary-foreground' : d.isToday ? 'bg-gold-soft text-foreground ring-1 ring-inset ring-gold' : 'text-foreground',
                  )}
                >
                  <span className={cn('text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{d.short}</span>
                  <span className="font-mono text-base font-semibold leading-none">{d.number}</span>
                  <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                    {d.dots.map((k, i) => (
                      <span key={i} className={cn('h-1.5 w-1.5 rounded-full', active ? (k === 'montage' ? 'bg-primary-foreground' : 'bg-primary-foreground/60') : KIND_DOT[k])} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {cards.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-border px-4 py-8 text-center text-muted-foreground">{T.emptyDay}</p>
          ) : (
            <ul className="space-y-3">
              {cards.map(({ event: e, chip, timeLine, sub }) => (
                <li key={e.id} className="space-y-3 rounded-[14px] border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold', eventClasses(e))}>
                      {e.state === 'pagar' && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />}
                      {chip}
                    </span>
                    <span className="font-mono text-sm">{timeLine}</span>
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold leading-snug">{e.address}</h3>
                    {sub && <p className="text-[15px] text-muted-foreground">{sub}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {e.customerPhone && (
                      <Button asChild variant="outline" size="icon" className="h-11 w-11">
                        <a href={`tel:${e.customerPhone.replace(/[^\d+]/g, '')}`} aria-label={`Ring ${e.customerName || 'kunden'}`}><Phone className="h-4 w-4" /></a>
                      </Button>
                    )}
                    <Button asChild variant="outline" className="h-11">
                      <a href={mapsUrl(e.address, e.city)} target="_blank" rel="noopener noreferrer"><MapPin className="h-4 w-4" />Vägbeskrivning</a>
                    </Button>
                    <Button className="h-11 flex-1 sm:flex-none" onClick={() => open(e.caseId)}>Öppna ärendet</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-5">
          <section aria-labelledby="montor-kommande" className="rounded-[14px] border border-border bg-card">
            <h2 id="montor-kommande" className={cn(H2, 'border-b border-border px-4 py-2.5')}>{T.upcomingTitle}</h2>
            {upcoming.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">{T.upcomingEmpty}</p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((r) => (
                  <li key={r.event.id}>
                    <button type="button" onClick={() => open(r.event.caseId)} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <span className="w-[72px] shrink-0 font-mono text-xs leading-tight">
                        <span className="block font-semibold">{r.day}</span>
                        <span className="text-muted-foreground">{r.time}</span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{r.place}</span>
                      <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-semibold', eventClasses(r.event))}>{r.chip}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="montor-att-boka" className="rounded-[14px] border border-border bg-card">
            <h2 id="montor-att-boka" className={cn(H2, 'flex items-center gap-2 border-b border-border px-4 py-2.5')}>
              {T.toBookTitle}
              <span className="rounded-full bg-gold-soft px-2 py-0.5 font-mono text-xs font-semibold text-foreground">{toBook.length}</span>
            </h2>
            {toBook.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Inget att boka just nu.</p>
            ) : (
              <ul className="divide-y divide-border">
                {toBook.map((r) => (
                  <li key={r.caseData.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 text-sm">{r.text}</span>
                    <Button variant="outline" className="h-11 shrink-0 border-gold" onClick={() => setBooking(r)}>{T.bookButton}</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <MontorBookSheet item={booking} team={team} events={events} today={today} saving={saving} onClose={() => setBooking(null)} onSubmit={submit} />
    </div>
  );
}
