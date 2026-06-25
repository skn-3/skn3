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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { generateAutoLines, normalizeLines, sumLines, type AOrderLine, type FacadeType } from '@/lib/aOrderLines';
import { buildAOrderPdf, loadAOrderLogo } from '@/lib/aOrderPdf';
import { SignedImage } from '@/components/shared/SignedImage';
import { HOUR_RATE } from '@/lib/constants';
import { CaseCombobox } from '@/components/shared/CaseCombobox';

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
    line_items?: Array<{ name?: string; unit_price?: number; qty?: number; amount?: number }>;
    date?: string;
    description?: string;
    internalExtraHours?: number;
    internalHourRate?: number;
    mockfjards_invoice_number?: string | null;
  } | null;
  currentUser: string;
  onSaved?: () => void;
  mode?: 'standard' | 'komplettering';
}

function newId() { return 'al_' + Math.random().toString(36).slice(2, 10); }
function fmt(n: number) { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }

export function AOrderForm({ open, onOpenChange, order, prefill, currentUser, onSaved, mode = 'standard' }: Props) {
  const isKomp = (order?.order_kind || mode) === 'komplettering';
  const isEdit = !!order?.id;
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  // Header
  const [date, setDate] = useState<string>(order?.date || prefill?.date || new Date().toISOString().slice(0, 10));
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
  const [description, setDescription] = useState<string>(order?.description ?? prefill?.description ?? '');
  const [teamId, setTeamId] = useState<string>(order?.team_id ?? prefill?.team_id ?? '__none__');
  const [internalExtraHours, setInternalExtraHours] = useState<number>(order?.internal_extra_hours ?? prefill?.internalExtraHours ?? 0);
  const [internalHourRate, setInternalHourRate] = useState<number>(order?.internal_hour_rate ?? prefill?.internalHourRate ?? 0);
  const [internalExtraAmount, setInternalExtraAmount] = useState<number>(order?.internal_extra_amount ?? 0);

  const prefillLines: AOrderLine[] | null = prefill?.line_items && prefill.line_items.length
    ? prefill.line_items.map(li => ({
        id: newId(),
        name: li.name || '',
        unit_price: Number(li.unit_price) || 0,
        qty: Number(li.qty) || 0,
        amount: li.amount != null ? Number(li.amount) : Math.round((Number(li.unit_price) || 0) * (Number(li.qty) || 0)),
      }))
    : null;

  const [lines, setLines] = useState<AOrderLine[]>(
    isKomp ? normalizeLines(order?.line_items) : (prefillLines ?? normalizeLines(order?.line_items))
  );
  const [autoLocked, setAutoLocked] = useState<boolean>(isKomp || !!order?.id || !!prefillLines); // when editing, prefilled, or komp, don't auto-regenerate

  const [kompCaseId, setKompCaseId] = useState<string>(order?.case_id ?? prefill?.case_id ?? '');

  // Effective case_id: existing order.case_id or prefill.case_id (or komp selection)
  const effectiveCaseId: string | null = (isKomp ? (kompCaseId || null) : null) ?? (order?.case_id ?? prefill?.case_id) ?? null;

  // Fetch case extra_hours for prefilling (new order with case_id).
  const { data: caseExtra } = useQuery({
    queryKey: ['a_order_case_hours', effectiveCaseId],
    queryFn: async () => {
      if (!effectiveCaseId) return null;
      const { data, error } = await (supabase as any)
        .from('cases')
        .select('extra_hours_sold, extra_hours_approved')
        .eq('id', effectiveCaseId)
        .maybeSingle();
      if (error) throw error;
      return data as { extra_hours_sold: number | null; extra_hours_approved: number | null } | null;
    },
    enabled: open && !!effectiveCaseId,
  });

  // Apply extra-hours prefill EXACTLY ONCE per opening for a new order.
  const extraHoursAppliedRef = useRef(false);
  function applyCaseExtraHours(extra: { extra_hours_sold: number | null; extra_hours_approved: number | null } | null | undefined, opts?: { force?: boolean }) {
    if (!extra) return;
    const sold = Number(extra.extra_hours_sold ?? 0) || 0;
    const approved = Number(extra.extra_hours_approved ?? 0) || 0;
    setInternalExtraHours(Math.max(sold - approved, 0));
    setInternalHourRate(HOUR_RATE);
    if (approved > 0) {
      setAutoLocked(true);
      setLines(prev => {
        // Ta bort tidigare "Extra Montagetimme"-rad (om vi byter värden) innan vi lägger till
        const cleaned = prev.filter(l => (l.name || '').trim() !== 'Extra Montagetimme');
        const newLine: AOrderLine = {
          id: 'al_' + Math.random().toString(36).slice(2, 10),
          name: 'Extra Montagetimme',
          unit_price: HOUR_RATE,
          qty: approved,
          amount: Math.round(HOUR_RATE * approved),
        };
        return [...cleaned, newLine];
      });
    } else if (opts?.force) {
      setLines(prev => prev.filter(l => (l.name || '').trim() !== 'Extra Montagetimme'));
    }
  }

  useEffect(() => {
    if (!open) { extraHoursAppliedRef.current = false; return; }
    if (isEdit) return;
    if (extraHoursAppliedRef.current) return;
    if (!caseExtra) return;
    extraHoursAppliedRef.current = true;
    // Om prefill redan satt interna timmar (t.ex. från Mockfjärds-flödet), skriv inte över.
    if (prefill?.internalExtraHours != null || prefill?.line_items?.length) return;
    applyCaseExtraHours(caseExtra);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, caseExtra]);


  // Images: existing paths in storage + pending uploads (compressed data URLs)
  const [imagePaths, setImagePaths] = useState<string[]>(Array.isArray(order?.images) ? order.images : []);
  const [pendingImages, setPendingImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Regenerate lines live when not edited / not locked / not komplettering
  useEffect(() => {
    if (autoLocked || isKomp) return;
    setLines(generateAutoLines({ windowCount, doorCount, roofWindowCount, facadeType, kmDistance }));
  }, [windowCount, doorCount, roofWindowCount, facadeType, kmDistance, autoLocked, isKomp]);

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

  const { data: kompCases = [] } = useQuery({
    queryKey: ['cases_for_komp'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('cases').select('id, address, customer_name').order('address');
      if (error) throw error;
      return data as any[];
    },
    enabled: open && isKomp,
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

  async function compressImage(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const maxW = 1200;
    const scale = img.width > maxW ? maxW / img.width : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.75);
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    for (const f of arr) {
      try {
        const dataUrl = await compressImage(f);
        setPendingImages(prev => [...prev, { id: 'p_' + Math.random().toString(36).slice(2, 9), name: f.name, dataUrl }]);
      } catch (e) {
        console.error(e);
        toast.error(`Kunde inte läsa ${f.name}`);
      }
    }
  }

  function dataUrlToBlob(dataUrl: string): Blob {
    const [meta, b64] = dataUrl.split(',');
    const mime = /data:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function uploadPendingImages(orderId: string): Promise<string[]> {
    const newPaths: string[] = [];
    for (let i = 0; i < pendingImages.length; i++) {
      const img = pendingImages[i];
      const path = `a-orders/${orderId}/img-${Date.now()}-${i}.jpg`;
      const blob = dataUrlToBlob(img.dataUrl);
      const { error } = await supabase.storage.from('case-documents').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) { toast.error(`Bilduppladdning misslyckades: ${error.message}`); continue; }
      newPaths.push(path);
    }
    return newPaths;
  }

  async function save(opts?: { silent?: boolean }): Promise<string | null> {
    if (!isKomp && !customerAddress.trim()) { toast.error('Adress krävs'); return null; }
    if (isKomp && (!teamId || teamId === '__none__')) { toast.error('Montör krävs för kompletteringsfaktura'); return null; }
    if (isKomp && lines.length === 0) { toast.error('Lägg till minst en rad'); return null; }
    setSaving(true);
    try {
      const basePayload: any = {
        date,
        customer_name: customerName || null,
        customer_address: customerAddress || (isKomp ? 'Komplettering' : ''),
        customer_phone: customerPhone || null,
        facade_type: facadeType,
        window_count: isKomp ? 0 : windowCount,
        door_count: isKomp ? 0 : doorCount,
        roof_window_count: isKomp ? 0 : roofWindowCount,
        km_distance: isKomp ? 0 : kmDistance,
        line_items: lines,
        description,
        total_amount: totalAmount,
        scheduled_delivery: isKomp ? false : scheduledDelivery,
        delivery_time: !isKomp && scheduledDelivery && deliveryTime ? deliveryTime : null,
        team_id: teamId && teamId !== '__none__' ? teamId : null,
        case_id: isKomp ? (kompCaseId || null) : (prefill?.case_id ?? order?.case_id ?? null),
        internal_extra_hours: internalExtraHours || 0,
        internal_hour_rate: internalHourRate || 0,
        internal_extra_amount: internalExtraAmount || 0,
        order_kind: isKomp ? 'komplettering' : (order?.order_kind || 'standard'),
        status: order?.status || 'order',
        ...(prefill?.mockfjards_invoice_number !== undefined
          ? { mockfjards_invoice_number: prefill.mockfjards_invoice_number }
          : {}),
      };
      let orderId = order?.id as string | undefined;
      if (isEdit && orderId) {
        const { error } = await (supabase as any).from('a_orders').update({ ...basePayload, images: imagePaths }).eq('id', orderId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from('a_orders').insert({ ...basePayload, images: imagePaths }).select('id').single();
        if (error) throw error;
        orderId = data.id;
      }
      // Upload pending images and update images column
      if (pendingImages.length && orderId) {
        const newPaths = await uploadPendingImages(orderId);
        if (newPaths.length) {
          const merged = [...imagePaths, ...newPaths];
          await (supabase as any).from('a_orders').update({ images: merged }).eq('id', orderId);
          setImagePaths(merged);
          setPendingImages([]);
        }
      }
      if (!opts?.silent) {
        toast.success(isEdit ? 'A-order uppdaterad' : (teamId && teamId !== '__none__' ? 'A-order sparad' : 'A-order sparad som utestående'));
      }
      onSaved?.();
      return orderId || null;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte spara');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function fetchSavedOrder(orderId: string) {
    const { data, error } = await (supabase as any).from('a_orders').select('*, montor_teams(*)').eq('id', orderId).maybeSingle();
    if (error || !data) throw error || new Error('Kunde inte hämta ordern');
    return data;
  }

  async function downloadPdf() {
    if (!teamId || teamId === '__none__') { toast.error('Tilldela montör först'); return; }
    const orderId = await save({ silent: true });
    if (!orderId) return;
    const o = await fetchSavedOrder(orderId);
    const logo = await loadAOrderLogo();
    const doc = buildAOrderPdf({
      date: o.date,
      orderNumber: o.order_number,
      customerAddress: o.customer_address || '',
      customerName: o.customer_name,
      lines: o.line_items || [],
      description: o.description,
      team: o.montor_teams,
      logoDataUrl: logo,
    });
    const addrSafe = String(o.customer_address || 'adress').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
    doc.save(`A-ORDER-${o.order_number}-${addrSafe}.pdf`);
  }

  async function doSend() {
    setSending(true);
    try {
      const orderId = await save({ silent: true });
      if (!orderId) return;
      const o = await fetchSavedOrder(orderId);
      if (!o.team_id || !o.montor_teams?.email) {
        toast.error('Tilldela montör med e-post först');
        return;
      }
      const logo = await loadAOrderLogo();
      const doc = buildAOrderPdf({
        date: o.date,
        orderNumber: o.order_number,
        customerAddress: o.customer_address || '',
        customerName: o.customer_name,
        lines: o.line_items || [],
        description: o.description,
        team: o.montor_teams,
        logoDataUrl: logo,
      });
      // datauristring -> base64
      const dataUri = doc.output('datauristring');
      const pdf_base64 = dataUri.split(',')[1] || '';
      const { error } = await supabase.functions.invoke('send-a-order', {
        body: { a_order_id: orderId, pdf_base64 },
      });
      if (error) throw error;
      toast.success('A-order skickad till montör');
      setConfirmSend(false);
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte skicka');
    } finally {
      setSending(false);
    }
  }

  const hasTeam = teamId && teamId !== '__none__';
  const selectedTeam = teams.find(t => t.id === teamId);
  const teamEmail = selectedTeam?.email || null;
  const totalImages = imagePaths.length + pendingImages.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle>
            {isEdit
              ? (isKomp ? `Kompletteringsfaktura #${order?.order_number ?? ''}` : `A-order #${order?.order_number ?? ''}`)
              : (isKomp ? 'Ny kompletteringsfaktura' : 'Ny A-order')}
          </SheetTitle>
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
              <Label>{isKomp ? 'Mottagare / notering (valfritt)' : 'Adress *'}</Label>
              <Input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} required={!isKomp} />
            </div>
            {!isKomp && (
              <div>
                <Label>Telefon</Label>
                <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
              </div>
            )}
            {!isKomp && (
              <>
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
              </>
            )}
          </div>

          {isKomp && (
            <div>
              <Label>Koppla till ärende (valfritt)</Label>
              <CaseCombobox cases={kompCases} value={kompCaseId} onChange={setKompCaseId} />
            </div>
          )}

          {!isKomp && (
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
          )}

          {/* Lines */}
          <div className="border rounded-md">
            <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
              <span className="text-sm font-medium">Rader</span>
              <div className="flex items-center gap-2">
                <Popover open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) setAddSearch(''); }}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs w-[260px] justify-between font-normal">
                      + Lägg till rad...
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="end">
                    <Command
                      filter={(value, search) => {
                        const term = search.trim().toLowerCase();
                        if (!term) return 1;
                        return value.toLowerCase().includes(term) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Sök artikel..." value={addSearch} onValueChange={setAddSearch} autoFocus />
                      <CommandList className="max-h-[320px]">
                        <CommandEmpty>Ingen artikel matchar</CommandEmpty>
                        <CommandItem
                          value="— Fri rad —"
                          onSelect={() => {
                            addProductLine('__free__');
                            setAddOpen(false);
                            setAddSearch('');
                          }}
                        >
                          — Fri rad —
                        </CommandItem>
                        {productsByCat.map(([cat, list]) => (
                          <CommandGroup key={cat} heading={cat}>
                            {list.map(p => (
                              <CommandItem
                                key={p.id}
                                value={p.name}
                                onSelect={() => {
                                  addProductLine(p.id);
                                  setAddOpen(false);
                                  setAddSearch('');
                                }}
                              >
                                <span className="flex-1 truncate">{p.name}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {Number(p.price).toLocaleString('sv-SE')} kr
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="divide-y">
              {lines.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground">Inga rader. Fyll i antal eller lägg till en rad.</div>
              )}
              {lines.map(l => (
                <div key={l.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2">
                  <Input className="col-span-5 h-8" value={l.name} onChange={e => updateLine(l.id, { name: e.target.value })} placeholder="Beskrivning" />
                  <Input className="col-span-2 h-8" type="number" step="0.01" value={l.unit_price} onChange={e => updateLine(l.id, { unit_price: Number(e.target.value) || 0 })} />
                  <Input className="col-span-2 h-8" type="number" step="0.01" value={l.qty} onChange={e => updateLine(l.id, { qty: Number(e.target.value) || 0 })} />
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
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-amber-900 uppercase">Internt — visas EJ för montör</div>
              {effectiveCaseId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={async () => {
                    const { data, error } = await (supabase as any)
                      .from('cases')
                      .select('extra_hours_sold, extra_hours_approved')
                      .eq('id', effectiveCaseId)
                      .maybeSingle();
                    if (error) { toast.error('Kunde inte hämta ärendet'); return; }
                    applyCaseExtraHours(data as any, { force: true });
                    toast.success('Extra timmar uppdaterade från ärendet');
                  }}
                >
                  Hämta från ärendet
                </Button>
              )}
            </div>
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
            <Label>Montör{isKomp ? ' *' : ''}</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger><SelectValue placeholder={isKomp ? 'Välj montör...' : undefined} /></SelectTrigger>
              <SelectContent>
                {!isKomp && <SelectItem value="__none__">— Ej tilldelad (utestående) —</SelectItem>}
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}{t.company_name ? ` (${t.company_name})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Images */}
          <div className="space-y-2">
            <Label>Bilder ({totalImages})</Label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-md p-4 text-center text-sm cursor-pointer ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-muted-foreground/60'}`}
            >
              <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              Klicka eller dra hit bilder (JPG/PNG)
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {totalImages > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {imagePaths.map(p => (
                  <div key={p} className="relative group rounded-md overflow-hidden border">
                    <SignedImage value={p} bucket="case-documents" className="w-full h-24 object-cover" />
                    <button type="button" onClick={() => setImagePaths(prev => prev.filter(x => x !== p))} className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {pendingImages.map(p => (
                  <div key={p.id} className="relative group rounded-md overflow-hidden border">
                    <img src={p.dataUrl} alt={p.name} className="w-full h-24 object-cover" />
                    <span className="absolute bottom-1 left-1 bg-amber-500 text-white text-[10px] px-1 rounded">ny</span>
                    <button type="button" onClick={() => setPendingImages(prev => prev.filter(x => x.id !== p.id))} className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Bilderna bifogas mejlet som separata bilagor (bäddas inte in i PDF:en).</p>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pb-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button variant="outline" onClick={downloadPdf} disabled={!hasTeam || saving} className="gap-2" title={!hasTeam ? 'Tilldela montör först' : undefined}>
              <Download className="h-4 w-4" /> Ladda ner PDF
            </Button>
            <Button variant="default" onClick={() => setConfirmSend(true)} disabled={!hasTeam || !teamEmail || saving || sending} className="gap-2 bg-green-600 hover:bg-green-700" title={!hasTeam ? 'Tilldela montör först' : (!teamEmail ? 'Montörsteamet saknar e-post' : undefined)}>
              <Send className="h-4 w-4" /> Skicka till montör
            </Button>
            <Button onClick={() => save()} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {hasTeam ? 'Spara' : 'Spara som utestående'}
            </Button>
          </div>

          <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Skicka A-order?</AlertDialogTitle>
                <AlertDialogDescription>
                  Mottagare: <strong>{teamEmail || '—'}</strong><br />
                  Bifogas: PDF + {totalImages} {totalImages === 1 ? 'bild' : 'bilder'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={sending}>Avbryt</AlertDialogCancel>
                <AlertDialogAction onClick={(e) => { e.preventDefault(); doSend(); }} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Skicka'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SheetContent>
    </Sheet>
  );
}
