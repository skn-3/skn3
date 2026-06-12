import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, Loader2, Download, Send, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { generateAutoLines, sumLines, type AOrderLine, type FacadeType } from '@/lib/aOrderLines';
import { buildAOrderPdf, loadAOrderLogo } from '@/lib/aOrderPdf';
import { SignedImage } from '@/components/shared/SignedImage';

type AOrder = any;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order?: AOrder | null;
  prefill?: {
    customer_name?: string;
    customer_address?: string;
    customer_phone?: string;
    case_id?: string | null;
    team_id?: string | null;
  } | null;
  currentUser: string;
  onSaved?: () => void;
}

function newId() { return 'al_' + Math.random().toString(36).slice(2, 10); }
function fmt(n: number) { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }

export function AOrderForm({ open, onOpenChange, order, prefill, currentUser, onSaved }: Props) {
  const isEdit = !!order?.id;
  const [saving, setSaving] = useState(false);

  // Header
  const [date, setDate] = useState<string>(order?.date || new Date().toISOString().slice(0, 10));
  const [customerName, setCustomerName] = useState<string>(order?.customer_name ?? prefill?.customer_name ?? '');
  const [customerAddress, setCustomerAddress] = useState<string>(order?.customer_address ?? prefill?.customer_address ?? '');
  const [customerPhone, setCustomerPhone] = useState<string>(order?.customer_phone ?? prefill?.customer_phone ?? '');
  const [facadeType, setFacadeType] = useState<FacadeType>((order?.facade_type as FacadeType) || 'tra');
  const [windowCount, setWindowCount] = useState<number>(order?.window_count ?? 0);
  const [doorCount, setDoorCount] = useState<number>(order?.door_count ?? 0);
  const [roofWindowCount, setRoofWindowCount] = useState<number>(order?.roof_window_count ?? 0);
  const [kmDistance, setKmDistance] = useState<number>(order?.km_distance ?? 0);
  const [scheduledDelivery, setScheduledDelivery] = useState<boolean>(order?.scheduled_delivery ?? false);
  const [deliveryTime, setDeliveryTime] = useState<string>(order?.delivery_time?.toString().slice(0, 5) ?? '');
  const [description, setDescription] = useState<string>(order?.description ?? '');
  const [teamId, setTeamId] = useState<string>(order?.team_id ?? prefill?.team_id ?? '__none__');
  const [internalExtraHours, setInternalExtraHours] = useState<number>(order?.internal_extra_hours ?? 0);
  const [internalHourRate, setInternalHourRate] = useState<number>(order?.internal_hour_rate ?? 0);
  const [internalExtraAmount, setInternalExtraAmount] = useState<number>(order?.internal_extra_amount ?? 0);

  const [lines, setLines] = useState<AOrderLine[]>(order?.line_items?.length ? order.line_items : []);
  const [autoLocked, setAutoLocked] = useState<boolean>(!!order?.id); // when editing existing, don't auto-regenerate

  // Images: existing paths in storage + pending uploads (compressed data URLs)
  const [imagePaths, setImagePaths] = useState<string[]>(Array.isArray(order?.images) ? order.images : []);
  const [pendingImages, setPendingImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Regenerate lines live when not edited / not locked
  useEffect(() => {
    if (autoLocked) return;
    setLines(generateAutoLines({ windowCount, doorCount, roofWindowCount, facadeType, kmDistance }));
  }, [windowCount, doorCount, roofWindowCount, facadeType, kmDistance, autoLocked]);

  // Products for "Lägg till rad"
  const { data: products = [] } = useQuery({
    queryKey: ['a_order_products'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('a_order_products').select('*').eq('is_active', true).order('category').order('sort_order');
      if (error) throw error;
      return data as any[];
    },
    enabled: open,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['montor_teams'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('montor_teams').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data as any[];
    },
    enabled: open,
  });

  const productsByCat = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of products) {
      const k = p.category || 'Övrigt';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return Array.from(m.entries());
  }, [products]);

  const totalAmount = useMemo(() => sumLines(lines), [lines]);
  const internalValue = useMemo(() => {
    return Math.round((Number(internalExtraHours) || 0) * (Number(internalHourRate) || 0) + (Number(internalExtraAmount) || 0));
  }, [internalExtraHours, internalHourRate, internalExtraAmount]);

  function updateLine(id: string, patch: Partial<AOrderLine>) {
    setAutoLocked(true);
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const merged = { ...l, ...patch } as AOrderLine;
      merged.amount = Math.round((Number(merged.unit_price) || 0) * (Number(merged.qty) || 0));
      return merged;
    }));
  }

  function removeLine(id: string) {
    setAutoLocked(true);
    setLines(prev => prev.filter(l => l.id !== id));
  }

  function addProductLine(productId: string) {
    if (!productId) return;
    setAutoLocked(true);
    if (productId === '__free__') {
      setLines(prev => [...prev, { id: newId(), name: '', unit_price: 0, qty: 1, amount: 0 }]);
      return;
    }
    const p = products.find((x: any) => x.id === productId);
    if (!p) return;
    setLines(prev => [...prev, { id: newId(), name: p.name, unit_price: Number(p.price), qty: 1, amount: Math.round(Number(p.price)) }]);
  }

  async function save() {
    if (!customerAddress.trim()) { toast.error('Adress krävs'); return; }
    setSaving(true);
    try {
      const payload: any = {
        date,
        customer_name: customerName || null,
        customer_address: customerAddress,
        customer_phone: customerPhone || null,
        facade_type: facadeType,
        window_count: windowCount,
        door_count: doorCount,
        roof_window_count: roofWindowCount,
        km_distance: kmDistance,
        line_items: lines,
        description,
        total_amount: totalAmount,
        scheduled_delivery: scheduledDelivery,
        delivery_time: scheduledDelivery && deliveryTime ? deliveryTime : null,
        team_id: teamId && teamId !== '__none__' ? teamId : null,
        case_id: prefill?.case_id ?? order?.case_id ?? null,
        internal_extra_hours: internalExtraHours || 0,
        internal_hour_rate: internalHourRate || 0,
        internal_extra_amount: internalExtraAmount || 0,
      };
      if (isEdit) {
        const { error } = await (supabase as any).from('a_orders').update(payload).eq('id', order.id);
        if (error) throw error;
        toast.success('A-order uppdaterad');
      } else {
        const { error } = await (supabase as any).from('a_orders').insert(payload);
        if (error) throw error;
        toast.success(teamId && teamId !== '__none__' ? 'A-order sparad' : 'A-order sparad som utestående');
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle>{isEdit ? `A-order #${order?.order_number ?? ''}` : 'Ny A-order'}</SheetTitle>
        </SheetHeader>

        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label>Datum</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Kundnamn</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Label>Adress *</Label>
              <Input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} required />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            </div>
            <div>
              <Label>Fasadtyp</Label>
              <Select value={facadeType} onValueChange={(v: any) => { setAutoLocked(false); setFacadeType(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tra">Trä</SelectItem>
                  <SelectItem value="sten">Sten/Betong</SelectItem>
                  <SelectItem value="puts">Puts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>KM-avstånd</Label>
              <Input type="number" min={0} value={kmDistance} onChange={e => { setAutoLocked(false); setKmDistance(Number(e.target.value) || 0); }} />
            </div>
            <div>
              <Label>Antal fönster</Label>
              <Input type="number" min={0} value={windowCount} onChange={e => { setAutoLocked(false); setWindowCount(Number(e.target.value) || 0); }} />
            </div>
            <div>
              <Label>Antal dörrar</Label>
              <Input type="number" min={0} value={doorCount} onChange={e => { setAutoLocked(false); setDoorCount(Number(e.target.value) || 0); }} />
            </div>
            <div>
              <Label>Antal takfönster</Label>
              <Input type="number" min={0} value={roofWindowCount} onChange={e => { setAutoLocked(false); setRoofWindowCount(Number(e.target.value) || 0); }} />
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={scheduledDelivery} onCheckedChange={setScheduledDelivery} id="sched" />
              <Label htmlFor="sched">Schemalagd leverans</Label>
            </div>
            {scheduledDelivery && (
              <div>
                <Label>Tid</Label>
                <Input type="time" value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} />
              </div>
            )}
            {autoLocked && (
              <Button variant="ghost" size="sm" onClick={() => {
                setLines(generateAutoLines({ windowCount, doorCount, roofWindowCount, facadeType, kmDistance }));
                setAutoLocked(false);
              }}>Återställ auto-rader</Button>
            )}
          </div>

          {/* Lines */}
          <div className="border rounded-md">
            <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
              <span className="text-sm font-medium">Rader</span>
              <div className="flex items-center gap-2">
                <Select onValueChange={addProductLine} value="">
                  <SelectTrigger className="h-8 text-xs w-[260px]">
                    <SelectValue placeholder="+ Lägg till rad..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__free__">— Fri rad —</SelectItem>
                    {productsByCat.map(([cat, list]) => (
                      <SelectGroup key={cat}>
                        <SelectLabel>{cat}</SelectLabel>
                        {list.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({Number(p.price).toLocaleString('sv-SE')} kr)
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="divide-y">
              {lines.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground">Inga rader. Fyll i antal eller lägg till en rad.</div>
              )}
              {lines.map(l => (
                <div key={l.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2">
                  <Input className="col-span-6 h-8" value={l.name} onChange={e => updateLine(l.id, { name: e.target.value })} placeholder="Beskrivning" />
                  <Input className="col-span-2 h-8" type="number" step="0.01" value={l.unit_price} onChange={e => updateLine(l.id, { unit_price: Number(e.target.value) || 0 })} />
                  <Input className="col-span-1 h-8" type="number" step="0.01" value={l.qty} onChange={e => updateLine(l.id, { qty: Number(e.target.value) || 0 })} />
                  <div className="col-span-2 text-right text-sm font-medium">{fmt(l.amount)}</div>
                  <button className="col-span-1 justify-self-end text-muted-foreground hover:text-destructive" onClick={() => removeLine(l.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t flex items-center justify-between bg-muted/30">
              <span className="text-sm text-muted-foreground">Totalt (montörsvärde)</span>
              <span className="text-base font-semibold">{fmt(totalAmount)}</span>
            </div>
          </div>

          <div>
            <Label>Beskrivning</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>

          {/* Internal block */}
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
            <div className="text-xs font-semibold text-amber-900 uppercase">Internt — visas EJ för montör</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Extra timmar</Label>
                <Input type="number" step="0.25" value={internalExtraHours} onChange={e => setInternalExtraHours(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">Timpris (kr/h)</Label>
                <Input type="number" step="1" value={internalHourRate} onChange={e => setInternalHourRate(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">Extra belopp (kr)</Label>
                <Input type="number" step="1" value={internalExtraAmount} onChange={e => setInternalExtraAmount(Number(e.target.value) || 0)} />
              </div>
            </div>
            <div className="text-sm text-amber-900">Internt värde: <span className="font-semibold">{fmt(internalValue)}</span></div>
          </div>

          {/* Team */}
          <div>
            <Label>Montör</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Ej tilldelad (utestående) —</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}{t.company_name ? ` (${t.company_name})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pb-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {teamId && teamId !== '__none__' ? 'Spara' : 'Spara som utestående'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
