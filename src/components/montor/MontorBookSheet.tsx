import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { DaysStepper } from '@/components/schedule/DaysStepper';
import { checkPlacement, dayLabel, placeLabel, suggestedMontageDays, type ScheduleCase, type ScheduleEvent } from '@/lib/schedule';

export interface MontorBookingValues { date: string; time: string; days: number }

interface Props {
  item: { caseData: ScheduleCase; kind: 'km' | 'montage' } | null;
  team: string | null;
  events: readonly ScheduleEvent[];
  today: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: MontorBookingValues) => void;
}

/** Bottenpanel "Boka dag" i montörens Schema: Dag, Tid (valfri) och för montage Antal arbetsdagar. */
export function MontorBookSheet({ item, team, events, today, saving, onClose, onSubmit }: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [days, setDays] = useState(1);
  const c = item?.caseData;

  useEffect(() => {
    setDate('');
    setTime('');
    setDays(item?.kind === 'montage' ? suggestedMontageDays(item.caseData.units) : 1);
  }, [item]);

  const check = useMemo(() => {
    if (!item || !date) return null;
    return checkPlacement({ caseData: item.caseData, kind: item.kind, date, days: item.kind === 'montage' ? days : 1, team: item.kind === 'montage' ? (item.caseData.team || team) : (item.caseData.km_team || item.caseData.team || team), events, today });
  }, [item, date, days, team, events, today]);
  const blocked = check?.level === 'blocked';
  const title = item?.kind === 'km' ? 'Boka KM' : 'Boka montage';

  return (
    <Drawer open={!!item} onOpenChange={(o) => { if (!o) onClose(); }} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        {item && c && (
          <form
            className="mx-auto w-full max-w-xl space-y-4 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2"
            onSubmit={(e) => { e.preventDefault(); if (date && !blocked) onSubmit({ date, time, days }); }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-bold">{title}</h2>
                <p className="truncate text-[15px] font-semibold">{placeLabel(c.address ?? '', c.city)}</p>
                {c.customer_name && <p className="text-sm text-muted-foreground">{c.customer_name}</p>}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Avbryt bokningen" onClick={onClose}><X className="h-5 w-5" /></Button>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="montor-book-date">Dag</Label>
              <Input id="montor-book-date" type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-12 text-base" />
              {date && <p className="text-sm text-muted-foreground">{dayLabel(date, today)}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="montor-book-time">Tid (valfri)</Label>
              <Input id="montor-book-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 text-base" />
              <p className="text-xs text-muted-foreground">Töm fältet om det gäller hela dagen.</p>
            </div>

            {item.kind === 'montage' && (
              <DaysStepper id="montor-book-days" days={days} date={date || null} units={c.units} today={today} onChange={setDays} />
            )}

            {check && check.reasons.length > 0 && (
              <div role="status" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-3 py-2.5 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <p>{check.reasons.join(' · ')}{!blocked && '. Du kan boka ändå.'}</p>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="submit" className="h-12 text-base font-semibold" disabled={!date || blocked || saving}>
                {saving ? 'Sparar...' : date ? `${title} ${dayLabel(date, today)}` : title}
              </Button>
              <Button type="button" variant="outline" className="h-12" onClick={onClose}>Avbryt</Button>
            </div>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
