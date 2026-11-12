import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rotRoom } from '@/lib/offerCalc';
import type { KalkylData, OfferMeta } from '@/lib/kalkyl';
import { focusRing, motion } from './ui';
import { kr } from './format';

const HOUSE: Record<string, string> = { villa: 'Villa', radhus: 'Radhus', bostadsratt: 'Bostadsrätt', fritidshus: 'Fritidshus', annat: 'Annat' };

function Fact({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-xs text-muted-foreground leading-none">{label}</div>
      <div className="mt-1 text-sm font-semibold truncate">{value}</div>
    </div>
  );
}

export function FactStrip({ meta, data, onEdit, readOnly }: { meta: OfferMeta; data: KalkylData; onEdit: () => void; readOnly: boolean }) {
  const p = data.premises;
  const house = [p.house_type ? HOUSE[p.house_type] : null, p.floors ? `${p.floors} plan` : null, p.build_year ? `byggt ${p.build_year}` : null].filter(Boolean).join(', ');
  const rotOn = meta.customer_type === 'privat' && meta.vat_mode === 'vanlig' && meta.rot_enabled;
  const rot = rotOn
    ? `${meta.rot_persons} ${meta.rot_persons === 1 ? 'person' : 'personer'}, ${kr(rotRoom(meta))} kvar`
    : meta.customer_type === 'foretag' ? 'Företag, inget ROT' : 'Av';
  const valid = meta.valid_until ? new Date(`${meta.valid_until}T00:00:00`).toLocaleDateString('sv-SE') : '–';
  return (
    <div className="min-h-[60px] shrink-0 bg-card border-b border-border flex items-center gap-4 px-3 sm:px-4 py-2">
      <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-x-4 gap-y-2">
        <Fact label="Kund" value={[meta.customer_name || 'Namn saknas', meta.customer_address].filter(Boolean).join(', ')} />
        <Fact label="Hus" value={house || 'Ej angivet'} className="hidden md:block" />
        <Fact label="ROT" value={rot} />
        <Fact label="Giltig till" value={valid} className="hidden md:block" />
      </div>
      <button type="button" onClick={onEdit}
        className={cn('min-h-[44px] shrink-0 inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold active:bg-muted', motion, focusRing)}>
        <Pencil className="h-4 w-4" aria-hidden="true" /> {readOnly ? 'Visa' : 'Ändra'}
      </button>
    </div>
  );
}
