import { useEffect, useState } from 'react';
import { Layers, PaintRoller, ListPlus, ArrowLeft, Building2, Home, Fence, Shovel, Zap, Bath, CookingPot, Hammer } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { GREN_TRADES, TRADE_LABEL, isGrenTrade, type GrenTrade, type KalkylRoom, type RoomDims } from '@/lib/kalkyl';
import { DimField, focusRing, motion } from './ui';

export type AddKind = 'golv' | 'malning' | 'fri' | GrenTrade;
export interface AddRequest { kind: AddKind; roomId: string | null; newRoom?: { name: string; dims: RoomDims }; friTitle?: string }

const SUGGESTIONS = ['Vardagsrum', 'Kök', 'Hall', 'Sovrum', 'Badrum'];
const GREN_ICON: Record<GrenTrade, typeof Layers> = { fasad: Building2, tak: Home, altan: Fence, mark: Shovel, el: Zap, badrum: Bath, kok: CookingPot, renovering: Hammer };
const KINDS: { value: AddKind; label: string; text: string; Icon: typeof Layers }[] = [
  { value: 'golv', label: 'Golv', text: 'Golvmaterial, läggning och tillbehör', Icon: Layers },
  { value: 'malning', label: 'Målning', text: 'Väggar, tak och snickerier med kulörer', Icon: PaintRoller },
  ...GREN_TRADES.map(g => ({ value: g, label: TRADE_LABEL[g], text: 'Mängdlista från prislistan', Icon: GREN_ICON[g] })),
  { value: 'fri', label: 'Fri rad', text: 'Egna rader utan gren', Icon: ListPlus },
];
const GREN_LABELS: string[] = GREN_TRADES.map(g => TRADE_LABEL[g]);
/** Fri rad och grenrader: rum är valfritt och raden har en benämning. */
const isFreeKind = (k: AddKind) => k !== 'golv' && k !== 'malning';
const START: RoomDims = { length: 4, width: 3, height: 2.4, doors: 1, windows: 1 };

export function AddRowSheet({ open, onOpenChange, rooms, onAdd }: { open: boolean; onOpenChange: (v: boolean) => void; rooms: KalkylRoom[]; onAdd: (r: AddRequest) => void }) {
  const isMobile = useIsMobile();
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<AddKind>('golv');
  const [roomId, setRoomId] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');
  const [dims, setDims] = useState<RoomDims>(START);
  const [friTitle, setFriTitle] = useState('');
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1); setKind('golv'); setRoomId(rooms.length ? rooms[rooms.length - 1].id : 'new'); setName(''); setDims(START); setFriTitle(''); setNameError(false);
  }, [open, rooms]);

  // Benämningen förifylls med grenens etikett; en egen benämning skrivs aldrig över.
  const pickKind = (k: AddKind) => {
    setKind(k);
    setFriTitle(t => (!t.trim() || GREN_LABELS.includes(t) ? (isGrenTrade(k) ? TRADE_LABEL[k] : '') : t));
  };

  const submit = () => {
    if (roomId === 'new' || roomId == null) {
      if (!isFreeKind(kind) && !name.trim()) { setNameError(true); return; }
      if (isFreeKind(kind) && !name.trim()) { onAdd({ kind, roomId: null, friTitle }); return; }
      onAdd({ kind, roomId: null, newRoom: { name: name.trim(), dims }, friTitle });
      return;
    }
    onAdd({ kind, roomId, friTitle });
  };

  const tile = (active: boolean) => cn('w-full min-h-[64px] rounded-xl border px-4 py-3 text-left flex items-center gap-3', motion, focusRing,
    active ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border bg-card active:bg-muted');
  const chip = (active: boolean) => cn('min-h-[44px] rounded-full border px-4 text-sm font-semibold', motion, focusRing,
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background active:bg-muted');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={cn('overflow-y-auto', isMobile ? 'max-h-[92dvh]' : 'w-full sm:max-w-lg')}>
        <SheetHeader>
          <SheetTitle className="font-display text-xl">{step === 1 ? 'Vad ska räknas?' : 'Var?'}</SheetTitle>
          <SheetDescription>Steg {step} av 2</SheetDescription>
        </SheetHeader>
        {step === 1 ? (
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" role="radiogroup" aria-label="Vad">
            {KINDS.map(k => (
              <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} className={tile(kind === k.value)} onClick={() => pickKind(k.value)}>
                <k.Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                <span><span className="block text-[15px] font-semibold">{k.label}</span><span className="block text-sm text-muted-foreground">{k.text}</span></span>
              </button>
            ))}
            </div>
            <Button type="button" className="w-full min-h-[48px] mt-2" onClick={() => setStep(2)}>Fortsätt</Button>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {isFreeKind(kind) && (
              <div className="space-y-1.5">
                <label htmlFor="fri-title" className="text-sm font-medium">Benämning</label>
                <Input id="fri-title" className="h-11 text-base" value={friTitle} onChange={e => setFriTitle(e.target.value)} placeholder={kind === 'fri' ? 't.ex. Kakel i badrum' : undefined} />
              </div>
            )}
            <div className="space-y-2">
              <div className="text-sm font-medium">Rum</div>
              <div className="flex flex-wrap gap-2">
                {rooms.map(r => <button key={r.id} type="button" className={chip(roomId === r.id)} aria-pressed={roomId === r.id} onClick={() => setRoomId(r.id)}>{r.name}</button>)}
                <button type="button" className={chip(roomId === 'new')} aria-pressed={roomId === 'new'} onClick={() => setRoomId('new')}>Nytt rum</button>
              </div>
            </div>
            {roomId === 'new' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="room-name" className="text-sm font-medium">Namn på rummet{isFreeKind(kind) ? ' (valfritt)' : ''}</label>
                  <Input id="room-name" className="h-11 text-base" value={name} aria-invalid={nameError} onChange={e => { setName(e.target.value); setNameError(false); }} />
                  {nameError && <p className="text-xs text-destructive" role="alert">Ge rummet ett namn, t.ex. Vardagsrum.</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {SUGGESTIONS.map(s => <button key={s} type="button" className={chip(name === s)} onClick={() => { setName(s); setNameError(false); }}>{s}</button>)}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DimField label="Längd" value={dims.length} onChange={v => setDims(d => ({ ...d, length: v }))} />
                  <DimField label="Bredd" value={dims.width} onChange={v => setDims(d => ({ ...d, width: v }))} />
                  <DimField label="Takhöjd" value={dims.height} onChange={v => setDims(d => ({ ...d, height: v }))} />
                  <DimField label="Dörrar" value={dims.doors} onChange={v => setDims(d => ({ ...d, doors: v }))} step={1} integer unit="st" max={20} />
                  <DimField label="Fönster" value={dims.windows} onChange={v => setDims(d => ({ ...d, windows: v }))} step={1} integer unit="st" max={30} />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="min-h-[48px] gap-2" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Tillbaka</Button>
              <Button type="button" className="flex-1 min-h-[48px]" onClick={submit}>Lägg till och konfigurera</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
