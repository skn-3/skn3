import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { fetchAllCases, type CaseRow } from '@/lib/supabaseClient';
import { useMontorTeams } from '@/hooks/useMontorTeams';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMinWidth } from '@/hooks/useMinWidth';
import { useBookingActions, toastBookingWarnings } from '@/hooks/useBookingActions';
import { bookingOutcome, type BookingCase } from '@/lib/booking';
import {
  EMPTY_FILTER, addDaysIso, availableViews, bookingKind, bookingModeForQueue, buildBoardRows, buildQueues, buildScheduleEvents,
  conflictChip, confirmationText, defaultDays, effectiveView, filterEvents, findConflicts, isoWeekOf, monthTitle, parseIso,
  parseStoredView, placementCells, placementPrompt, queueTotal, rescheduleModeFor, smsOption, stepMonth, summaryText, toIso,
  viewStorageKey, weekChip, weekDates as datesOfWeek, weekRangeLabel, weekSummary, withScheduleFields,
  type BoardRow, type DeliveryGroup, type QueueItem, type QueueName, type ScheduleFilter, type ScheduleViewMode,
} from '@/lib/schedule';
import { ScheduleToolbar } from './ScheduleToolbar';
import { WeekBoard } from './WeekBoard';
import { QueuePanel } from './QueuePanel';
import { BookingPanel, type BookingDraft } from './BookingPanel';
import { BookingDetails, DeliveryGroupDetails } from './BookingDetails';
import { MonthView } from './MonthView';
import { ListView } from './ListView';

interface Props {
  currentUser: string;
  onSelectCase: (c: CaseRow) => void;
}

type Panel =
  | { mode: 'queue' }
  | { mode: 'booking'; draft: BookingDraft }
  | { mode: 'details'; eventId: string }
  | { mode: 'group'; group: DeliveryGroup };

const todayIso = () => toIso(new Date());

function readView(user: string): ScheduleViewMode | null {
  try { return parseStoredView(localStorage.getItem(viewStorageKey(user))); } catch { return null; }
}

export function ScheduleView({ currentUser, onSelectCase }: Props) {
  const isWide = useMinWidth(1280);
  const isPhone = useIsMobile();
  const [today, setToday] = useState(todayIso);
  useEffect(() => {
    const onFocus = () => setToday(todayIso());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const casesQuery = useQuery({ queryKey: ['cases', 'schedule'], queryFn: fetchAllCases, refetchOnWindowFocus: true });
  const cases = useMemo(() => (casesQuery.data ?? []).map(c => withScheduleFields(c)), [casesQuery.data]);
  const caseById = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  const { names, emailOf } = useMontorTeams();
  const teamNames = useMemo(() => [...names].sort((a, b) => a.localeCompare(b, 'sv')), [names]);
  const sellers = useMemo(() => [...new Set(cases.map(c => c.seller).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'sv')), [cases]);
  const events = useMemo(() => buildScheduleEvents(cases), [cases]);
  const conflicts = useMemo(() => findConflicts(events), [events]);
  const queues = useMemo(() => buildQueues(cases, today), [cases, today]);
  const total = queueTotal(queues);

  // Vy, vecka och månad
  const [storedView, setStoredView] = useState<ScheduleViewMode | null>(() => readView(currentUser));
  const view = effectiveView(storedView, isPhone);
  const chooseView = (v: ScheduleViewMode, persist = true) => {
    setStoredView(v);
    if (persist) { try { localStorage.setItem(viewStorageKey(currentUser), v); } catch { /* privat läge */ } }
  };
  const [week, setWeekState] = useState(() => isoWeekOf(todayIso()));
  const weekDays = useMemo(() => datesOfWeek(week.year, week.week), [week]);
  const [month, setMonth] = useState(() => { const d = parseIso(todayIso()); return { year: d.getFullYear(), month: d.getMonth() + 1 }; });
  const [focusDate, setFocusDate] = useState<string | null>(null);

  const [filter, setFilter] = useState<ScheduleFilter>(EMPTY_FILTER);
  const filtered = useMemo(() => filterEvents(events, filter), [events, filter]);

  const [placing, setPlacing] = useState<QueueItem | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowKey: string; date: string } | null>(null);
  const [panel, setPanel] = useState<Panel>({ mode: 'queue' });
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueTab, setQueueTab] = useState<QueueName>('km');
  const [recentId, setRecentId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const actions = useBookingActions();

  const setWeek = (w: { year: number; week: number }) => { setWeekState(w); setRecentId(null); };
  const shiftWeek = (delta: number) => setWeek(isoWeekOf(addDaysIso(weekDays[0], delta * 7)));

  const cancelPlacement = useCallback(() => {
    setPlacing(null);
    setSelectedCell(null);
    setPanel(p => (p.mode === 'booking' ? { mode: 'queue' } : p));
  }, []);

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelPlacement(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, cancelPlacement]);

  const placingKind = placing?.kind ?? null;
  const rows = useMemo(
    () => buildBoardRows({ events, weekDates: weekDays, teamNames, filter, placingKm: placingKind === 'km' }),
    [events, weekDays, teamNames, filter, placingKind],
  );
  const placingCase = placing ? caseById.get(placing.caseId) ?? null : null;
  const cells = useMemo(() => {
    if (!placing || !placingCase) return null;
    return placementCells({
      rows, weekDates: weekDays, caseData: placingCase, kind: placing.kind,
      days: placing.kind === 'montage' ? defaultDays(bookingModeForQueue(placing), placingCase) : null,
      events, today, allowPast: placing.queue === 'datum',
    });
  }, [placing, placingCase, rows, weekDays, events, today]);

  // ---------------------------------------------------------------------------
  // Handlingar

  const draftFor = (item: QueueItem, team: string | null, date: string | null): BookingDraft | null => {
    const c = caseById.get(item.caseId);
    if (!c) return null;
    const mode = bookingModeForQueue(item);
    const kind = bookingKind(mode);
    const time = kind === 'km' ? (c.km_time ?? '') : (c.montage_time ?? '');
    return { mode, caseId: c.id, team, date, time: time.slice(0, 5), days: defaultDays(mode, c), sms: smsOption(mode, c.status).defaultOn, allowPast: item.queue === 'datum' };
  };

  const pickQueueItem = (item: QueueItem) => {
    if (placing?.caseId === item.caseId) { cancelPlacement(); return; }
    setSelectedCell(null);
    setQueueOpen(false);
    if (isPhone) {
      const draft = draftFor(item, item.team, null);
      setPlacing(item);
      if (draft) setPanel({ mode: 'booking', draft });
      return;
    }
    setPlacing(item);
    setPanel({ mode: 'queue' });
    if (view !== 'vecka') chooseView('vecka', false);
  };

  const onTarget = (row: BoardRow, date: string) => {
    if (!placing) return;
    const draft = draftFor(placing, row.team, date);
    if (!draft) return;
    setSelectedCell({ rowKey: row.key, date });
    setPanel({ mode: 'booking', draft });
  };

  const openDetails = (eventId: string) => {
    if (placing) cancelPlacement();
    setPanel({ mode: 'details', eventId });
  };

  const closePanel = () => {
    if (panel.mode === 'booking' && placing && !isPhone) { setSelectedCell(null); setPanel({ mode: 'queue' }); return; }
    if (panel.mode === 'booking' && placing) cancelPlacement();
    setPanel({ mode: 'queue' });
  };

  const startReschedule = (eventId: string) => {
    const e = events.find(x => x.id === eventId);
    const c = e ? caseById.get(e.caseId) : undefined;
    const mode = e ? rescheduleModeFor(e) : null;
    if (!e || !c || !mode) return;
    setPanel({ mode: 'booking', draft: { mode, caseId: c.id, team: e.team, date: e.startDate, time: e.time ?? '', days: e.days, sms: smsOption(mode, c.status).defaultOn, allowPast: false } });
  };

  const submitBooking = async (draft: BookingDraft) => {
    const c = caseById.get(draft.caseId) as BookingCase | undefined;
    if (!c || !draft.date) return;
    const kind = bookingKind(draft.mode);
    const time = draft.time || null;
    const smsRequested = smsOption(draft.mode, c.status).show && draft.sms;
    const base = { actor: currentUser, origin: 'office' as const };
    const warnings: string[] = [];
    setSaving(true);
    try {
      switch (draft.mode) {
        case 'bookKm':
          warnings.push(...(await actions.bookKm.mutateAsync({ caseData: c, date: draft.date, time, kmTeam: draft.team, ...base })).warnings);
          break;
        case 'bookMontage':
          warnings.push(...(await actions.bookMontage.mutateAsync({ caseData: c, date: draft.date, time, days: draft.days, team: draft.team, sendCustomerSms: smsRequested, ...base })).warnings);
          break;
        case 'setMontageDate':
        case 'rescheduleMontage': {
          let current = c;
          if ((draft.team || null) !== (c.team || null)) {
            warnings.push(...(await actions.changeBookingTeam.mutateAsync({ caseData: c, kind: 'montage', team: draft.team, actor: currentUser })).warnings);
            current = { ...c, team: draft.team };
          }
          warnings.push(...(await actions.rescheduleMontage.mutateAsync({ caseData: current, date: draft.date, time, days: draft.days, sendCustomerSms: smsRequested, ...base })).warnings);
          break;
        }
        case 'rescheduleKm': {
          let current = c;
          if ((draft.team || null) !== (c.km_team || null)) {
            warnings.push(...(await actions.changeBookingTeam.mutateAsync({ caseData: c, kind: 'km', team: draft.team, actor: currentUser })).warnings);
            current = { ...c, km_team: draft.team };
          }
          warnings.push(...(await actions.rescheduleKm.mutateAsync({ caseData: current, date: draft.date, time, ...base })).warnings);
          break;
        }
      }
    } catch (e) {
      toast.error(`Kunde inte boka: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    const unique = [...new Set(warnings)];
    toastBookingWarnings(unique);
    const mailTeam = kind === 'km' ? (draft.team || c.team || null) : draft.team;
    const outcome = bookingOutcome({ warnings: unique, mailTeam, teamEmail: emailOf(mailTeam), smsRequested });
    setConfirmation(confirmationText({ mode: draft.mode, date: draft.date, team: draft.team, today, ...outcome }));
    setPlacing(null);
    setSelectedCell(null);
    setPanel({ mode: 'queue' });
    const booked = isoWeekOf(draft.date);
    if (booked.year !== week.year || booked.week !== week.week) setWeekState(booked);
    setRecentId(`${c.id}-${kind}`);
  };

  const changeTeam = async (eventId: string, team: string | null) => {
    const e = events.find(x => x.id === eventId);
    const c = e ? (caseById.get(e.caseId) as BookingCase | undefined) : undefined;
    if (!e || !c || (e.kind !== 'km' && e.kind !== 'montage')) return;
    try {
      const r = await actions.changeBookingTeam.mutateAsync({ caseData: c, kind: e.kind, team, actor: currentUser });
      toastBookingWarnings(r.warnings);
      toast.success(`Teamet är bytt till ${team ?? 'Inget team'}`);
    } catch (err) {
      toast.error(`Kunde inte byta team: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const unbook = async (eventId: string) => {
    const e = events.find(x => x.id === eventId);
    const c = e ? (caseById.get(e.caseId) as BookingCase | undefined) : undefined;
    if (!e || !c) return;
    try {
      const fn = e.kind === 'km' ? actions.unbookKm : actions.unbookMontage;
      const r = await fn.mutateAsync({ caseData: c, actor: currentUser });
      toastBookingWarnings(r.warnings);
      toast.success('Bokningen är borttagen. Ärendet ligger i kön Att boka.');
      setPanel({ mode: 'queue' });
    } catch (err) {
      toast.error(`Kunde inte ta bort bokningen: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Paneler

  const detailEvent = panel.mode === 'details' ? events.find(e => e.id === panel.eventId) ?? null : null;
  const busy = actions.changeBookingTeam.isPending || actions.unbookKm.isPending || actions.unbookMontage.isPending;

  const queueContent = (
    <QueuePanel
      queues={queues}
      tab={queueTab}
      onTab={setQueueTab}
      selectedCaseId={placing?.caseId ?? null}
      onPick={pickQueueItem}
      onClose={!isWide ? () => setQueueOpen(false) : undefined}
    />
  );

  let sideContent: React.ReactNode = null;
  if (panel.mode === 'booking') {
    const c = caseById.get(panel.draft.caseId);
    sideContent = c ? (
      <BookingPanel
        draft={panel.draft}
        onChange={patch => setPanel(p => (p.mode === 'booking' ? { mode: 'booking', draft: { ...p.draft, ...patch } } : p))}
        caseData={c}
        teamNames={teamNames}
        events={events}
        today={today}
        saving={saving}
        onCancel={closePanel}
        onSubmit={() => submitBooking(panel.draft)}
      />
    ) : null;
  } else if (panel.mode === 'details' && detailEvent) {
    const c = caseById.get(detailEvent.caseId) ?? null;
    sideContent = (
      <BookingDetails
        event={detailEvent}
        caseData={c}
        today={today}
        teamNames={teamNames}
        conflicts={conflicts}
        busy={busy}
        onClose={() => setPanel({ mode: 'queue' })}
        onReschedule={() => startReschedule(detailEvent.id)}
        onOpenCase={() => { if (c) onSelectCase(c); }}
        onChangeTeam={team => changeTeam(detailEvent.id, team)}
        onUnbook={() => unbook(detailEvent.id)}
      />
    );
  } else if (panel.mode === 'group') {
    sideContent = <DeliveryGroupDetails group={panel.group} today={today} onClose={() => setPanel({ mode: 'queue' })} onSelectEvent={openDetails} />;
  }

  // ---------------------------------------------------------------------------
  // Verktygsrad

  const isMonth = view === 'manad';
  const summary = isMonth ? null : summaryText(weekSummary(filtered, weekDays, today));
  const chip = isMonth ? null : conflictChip(conflicts, weekDays);
  const prompt = placing && view === 'vecka' ? placementPrompt(placing, weekDays, today) : null;
  const conflictIds = useMemo(() => new Set(conflicts.byEvent.keys()), [conflicts]);

  const openQueue = () => {
    if (isMonth) chooseView(isPhone ? 'lista' : 'vecka', false);
    if (!isWide) setQueueOpen(true);
    setPanel({ mode: 'queue' });
  };

  if (casesQuery.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Laddar schemat" /></div>;
  }
  if (casesQuery.error) {
    return <p className="px-4 py-10 text-center text-sm text-destructive">Schemat kunde inte laddas. Försök igen om en stund.</p>;
  }

  const main = view === 'vecka' ? (
    <WeekBoard
      rows={rows}
      weekDates={weekDays}
      today={today}
      events={filtered}
      conflicts={conflicts}
      recentId={recentId}
      placement={cells ? { cells, defaultTeam: placing?.team ?? null, selected: selectedCell, onTarget } : null}
      onSelectEvent={openDetails}
      onSelectGroup={(_id, group) => { if (placing) cancelPlacement(); setPanel({ mode: 'group', group }); }}
    />
  ) : view === 'manad' ? (
    <MonthView
      year={month.year}
      month={month.month}
      events={filtered}
      conflicts={conflicts}
      today={today}
      onOpenWeek={(year, w) => { setWeek({ year, week: w }); chooseView(isPhone ? 'lista' : 'vecka', false); }}
      onOpenDay={date => { setWeek(isoWeekOf(date)); setFocusDate(date); chooseView('lista', false); }}
    />
  ) : (
    <ListView
      events={filtered}
      weekDates={weekDays}
      today={today}
      focusDate={focusDate}
      recentId={recentId}
      conflictIds={conflictIds}
      onSelectEvent={openDetails}
    />
  );

  return (
    <div className="space-y-4 px-3 md:px-0">
      <ScheduleToolbar
        view={view}
        views={availableViews(isPhone)}
        onView={v => { chooseView(v); setFocusDate(null); }}
        weekChip={isMonth ? null : weekChip(week.week)}
        rangeLabel={isMonth ? monthTitle(month.year, month.month) : weekRangeLabel(weekDays)}
        onPrev={() => (isMonth ? setMonth(m => stepMonth(m.year, m.month, -1)) : shiftWeek(-1))}
        onNext={() => (isMonth ? setMonth(m => stepMonth(m.year, m.month, 1)) : shiftWeek(1))}
        onToday={() => {
          const t = todayIso();
          setToday(t);
          if (isMonth) { const d = parseIso(t); setMonth({ year: d.getFullYear(), month: d.getMonth() + 1 }); } else setWeek(isoWeekOf(t));
        }}
        filter={filter}
        onFilter={setFilter}
        teamNames={teamNames}
        sellers={sellers}
        queueButton={!isWide || isMonth ? { total, onClick: openQueue } : null}
        summary={summary}
        conflict={chip ? { text: chip.text, onClick: () => { const e = events.find(x => x.id === chip.eventId); if (e) openDetails(e.id); } } : null}
      />

      {confirmation && (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
          <p className="flex-1 py-1.5">{confirmation}</p>
          <Button variant="onDark" size="icon" className="h-11 w-11 shrink-0 border-0" onClick={() => setConfirmation(null)} aria-label="Stäng bekräftelsen">
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      {prompt && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gold bg-gold-soft px-4 py-2 text-sm text-foreground">
          <p className="flex-1"><span className="font-semibold">{prompt.lead}</span> {prompt.hint}</p>
          <Button variant="outline" className="h-11" onClick={cancelPlacement}>Avbryt</Button>
        </div>
      )}

      <div className={isWide ? 'grid grid-cols-[minmax(0,1fr)_380px] items-start gap-4' : undefined}>
        <div className="min-w-0">{main}</div>
        {isWide && (
          <aside className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col overflow-y-auto rounded-[14px] border border-border bg-card p-4 pb-16" aria-label="Att boka och bokningar">
            {panel.mode === 'queue' || !sideContent ? queueContent : sideContent}
          </aside>
        )}
      </div>

      {!isWide && (
        <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
          <SheetContent side="right" className="flex w-full flex-col p-4 sm:max-w-[400px]" disableDefaultClose>
            <SheetTitle className="sr-only">Att boka</SheetTitle>
            {queueContent}
          </SheetContent>
        </Sheet>
      )}

      {!isWide && (
        <Drawer open={panel.mode !== 'queue' && !!sideContent} onOpenChange={open => { if (!open) closePanel(); }} shouldScaleBackground={false}>
          <DrawerContent className="max-h-[92vh]">
            <DrawerTitle className="sr-only">{panel.mode === 'booking' ? 'Bokning' : 'Bokningens detaljer'}</DrawerTitle>
            <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2"><div className="mx-auto w-full max-w-xl">{sideContent}</div></div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
