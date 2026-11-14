import { useMemo, useState } from 'react';
import { sv } from 'date-fns/locale';
import { AlertTriangle, CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DaysStepper } from './DaysStepper';
import {
  BOOKING_FOOTNOTE, BOOKING_TITLES, bookingKind, checkPlacement, dayLabel,
  deliveryLabelOf, parseIso, smsOption, submitLabel, teamChangeNotice, toIso,
  type BookingMode, type ScheduleCase, type ScheduleEvent,
} from '@/lib/schedule';

export interface BookingDraft {
  mode: BookingMode;
  caseId: string;
  team: string | null;
  date: string | null;
  /** HH:MM eller tom (hela dagen). */
  time: string;
  days: number;
  sms: boolean;
  allowPast: boolean;
}

interface Props {
  draft: BookingDraft;
  onChange: (patch: Partial<BookingDraft>) => void;
  caseData: ScheduleCase & { units?: number | null };
  teamNames: string[];
  /** Alla händelser, för kontrollen av placeringen. */
  events: ScheduleEvent[];
  today: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

const NO_TEAM = '__inget__';

export function BookingPanel({ draft, onChange, caseData, teamNames, events, today, saving, onCancel, onSubmit }: Props) {
  const kind = bookingKind(draft.mode);
  const [dateOpen, setDateOpen] = useState(false);
  const sms = smsOption(draft.mode, caseData.status);
  const currentTeam = (kind === 'km' ? caseData.km_team : caseData.team) || null;
  const notice = teamChangeNotice(currentTeam, draft.team);
  const delivery = deliveryLabelOf(caseData, today);
  const meta = [caseData.city, caseData.units != null ? `${caseData.units} enheter` : null, delivery].filter(Boolean).join(' · ');
  const teams = useMemo(() => {
    const list = [...teamNames];
    if (draft.team && !list.includes(draft.team)) list.push(draft.team);
    return list.sort((a, b) => a.localeCompare(b, 'sv'));
  }, [teamNames, draft.team]);

  const check = useMemo(() => (draft.date
    ? checkPlacement({ caseData, kind, date: draft.date, days: kind === 'montage' ? draft.days : null, team: draft.team, events, today, allowPast: draft.allowPast })
    : null), [caseData, kind, draft.date, draft.days, draft.team, draft.allowPast, events, today]);
  const blocked = check?.level === 'blocked';
  const canSubmit = !!draft.date && !blocked && !saving && (kind === 'km' || !!draft.team);

  return (
    <section aria-labelledby="schedule-booking-title" className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <h2 id="schedule-booking-title" className="font-display text-lg font-semibold">{BOOKING_TITLES[draft.mode]}</h2>
        <Button variant="ghost" size="icon" className="ml-auto h-11 w-11 shrink-0" onClick={onCancel} aria-label="Avbryt bokningen">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div>
        <p className="font-semibold">{caseData.address}</p>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="schedule-booking-team">Team</Label>
        <Select value={draft.team ?? NO_TEAM} onValueChange={v => onChange({ team: v === NO_TEAM ? null : v })}>
          <SelectTrigger id="schedule-booking-team" className="h-11 text-base"><SelectValue placeholder="Välj team" /></SelectTrigger>
          <SelectContent>
            {kind === 'km' && <SelectItem value={NO_TEAM} className="min-h-11">Inget team</SelectItem>}
            {teams.map(t => <SelectItem key={t} value={t} className="min-h-11">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="schedule-booking-day">Dag</Label>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button id="schedule-booking-day" variant="outline" className={cn('h-11 justify-start text-base font-normal', !draft.date && 'text-muted-foreground')}>
              <CalendarIcon className="mr-1 h-4 w-4" aria-hidden="true" />
              {draft.date ? dayLabel(draft.date, today) : 'Välj dag'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={sv}
              weekStartsOn={1}
              selected={draft.date ? parseIso(draft.date) : undefined}
              defaultMonth={draft.date ? parseIso(draft.date) : parseIso(today)}
              onSelect={d => { if (d) { onChange({ date: toIso(d) }); setDateOpen(false); } }}
              initialFocus
              className="pointer-events-auto p-3"
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="schedule-booking-time">Tid</Label>
        <Input id="schedule-booking-time" type="time" value={draft.time} onChange={e => onChange({ time: e.target.value })} className="h-11 text-base" />
        <p className="text-xs text-muted-foreground">Töm fältet om det gäller hela dagen.</p>
      </div>

      {kind === 'montage' && (
        <DaysStepper id="schedule-booking-days" days={draft.days} date={draft.date} units={caseData.units} today={today} onChange={days => onChange({ days })} />
      )}

      {sms.show && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox checked={draft.sms} onCheckedChange={v => onChange({ sms: v === true })} className="h-5 w-5" />
          {sms.label}
        </label>
      )}

      {notice && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>}

      {check && check.level !== 'ok' && (
        <div className="flex gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-foreground" role={blocked ? 'alert' : 'status'}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <ul className="space-y-0.5">{check.reasons.map(r => <li key={r}>{r}</li>)}</ul>
            {!blocked && <p className="mt-1 font-semibold">Du kan boka ändå.</p>}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{BOOKING_FOOTNOTE}</p>

      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 flex-1" onClick={onSubmit} disabled={!canSubmit}>
          {saving ? 'Sparar...' : submitLabel(draft.mode, draft.date, today)}
        </Button>
        <Button variant="outline" className="min-h-11" onClick={onCancel}>Avbryt</Button>
      </div>
    </section>
  );
}
