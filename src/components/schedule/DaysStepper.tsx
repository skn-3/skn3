import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MAX_MONTAGE_DAYS, clampDays, dateRangeLabel, daysHint, montageDates } from '@/lib/schedule';

interface Props {
  id: string;
  days: number;
  date: string | null;
  units: number | null | undefined;
  today: string;
  onChange: (days: number) => void;
}

/** "Antal arbetsdagar" med minus/plus, resultatet och förslaget. Delas av kontorets och montörens bokningspanel. */
export function DaysStepper({ id, days, date, units, today, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <Label id={`${id}-label`}>Antal arbetsdagar</Label>
      <div className="flex items-center gap-2" role="group" aria-labelledby={`${id}-label`}>
        <Button variant="outline" size="icon" className="h-11 w-11" aria-label="En dag färre" disabled={days <= 1} onClick={() => onChange(clampDays(days - 1))}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-8 text-center font-mono text-base" aria-live="polite">{days}</span>
        <Button variant="outline" size="icon" className="h-11 w-11" aria-label="En dag till" disabled={days >= MAX_MONTAGE_DAYS} onClick={() => onChange(clampDays(days + 1))}>
          <Plus className="h-4 w-4" />
        </Button>
        {date && <span className="ml-auto text-sm font-semibold">{dateRangeLabel(montageDates(date, days), today)}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{daysHint(units)}</p>
    </div>
  );
}
