import { useState } from 'react';
import { Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** Fälten när hämtning begärs. Samma i montörens drawer och i ärendepanelen. */
export function WasteRequestFields({ idPrefix, note, setNote, earliest, setEarliest }: {
  idPrefix: string; note: string; setNote: (v: string) => void; earliest: string; setEarliest: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-note`}>Var står skräpet och ungefär hur mycket?</Label>
        <Textarea id={`${idPrefix}-note`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="t.ex. 8 fönster och emballage på uppfarten" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-earliest`}>Tidigast hämtning</Label>
        <Input id={`${idPrefix}-earliest`} type="date" value={earliest} onChange={(e) => setEarliest(e.target.value)} className="min-h-[48px]" />
      </div>
    </div>
  );
}

/** Kontorets bokning: hämtdag (obligatorisk) och valfri notering. */
export function WasteBookForm({ idPrefix, pending, onSave, onCancel }: {
  idPrefix: string; pending: boolean; onSave: (date: string, note: string) => void; onCancel?: () => void;
}) {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-date`}>Hämtdag *</Label>
        <Input id={`${idPrefix}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[48px]" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-note`}>Notering (valfritt)</Label>
        <Textarea id={`${idPrefix}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="t.ex. bokningsnummer eller tid" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-12 gap-2" disabled={!date || pending} onClick={() => onSave(date, note)}>
          <Truck className="h-4 w-4" /> {pending ? 'Sparar...' : 'Spara bokning'}
        </Button>
        {onCancel && <Button variant="ghost" className="min-h-12" onClick={onCancel}>Avbryt</Button>}
      </div>
    </div>
  );
}
