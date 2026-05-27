import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCase, createCaseEvent, sendNotificationEmail, createVisit, updateVisit } from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { searchOrders } from '@/integrations/orderGateway';
import { MONTORS, EMAIL_MAP, HOUR_RATE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatAmount } from '@/lib/utils';
import { toast } from 'sonner';

type AddressSuggestion = {
  source: 'case' | 'order';
  address: string;
  customer_name: string;
  customer_phone: string;
};

interface NewCaseFormProps {
  sellerName: string;
  onCreated: () => void;
  prefill?: { customer_name?: string; address?: string; order_value?: string; visit_id?: string; visit_date?: string };
}

export function NewCaseForm({ sellerName, onCreated, prefill }: NewCaseFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    customer_name: prefill?.customer_name || '',
    customer_phone: '',
    customer_email: '',
    address: prefill?.address || '',
    city: '',
    offer_number: '',
    order_value: prefill?.order_value || '',
    tb_percent: '',
    extra_hours_sold: '0',
    team: '',
    km_team: '',
    google_drive_link: '',
    notes: '',
    media_consent: false,
    carry_help_needed: false,
    scheduled_delivery: false,
    visit_date: prefill?.visit_date || new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (prefill) {
      setForm((f) => ({
        ...f,
        customer_name: prefill.customer_name || f.customer_name,
        address: prefill.address || f.address,
        order_value: prefill.order_value || f.order_value,
        visit_date: prefill.visit_date || f.visit_date,
      }));
    }
  }, [prefill]);

  // Address autocomplete
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [existingCaseWarning, setExistingCaseWarning] = useState(false);
  const addressWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = form.address.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const [casesRes, orderRows] = await Promise.all([
        supabase
          .from('cases')
          .select('id, address, customer_name, customer_phone, order_value')
          .ilike('address', `%${term}%`)
          .limit(5),
        searchOrders(term),
      ]);
      const list: AddressSuggestion[] = [];
      (casesRes.data || []).forEach((c: any) => list.push({
        source: 'case',
        address: c.address,
        customer_name: c.customer_name,
        customer_phone: c.customer_phone || '',
      }));
      (orderRows || []).slice(0, 5).forEach((o: any) => list.push({
        source: 'order',
        address: o.customer_address,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone || '',
      }));
      setSuggestions(list);
      setShowSuggestions(list.length > 0);
    }, 300);
    return () => clearTimeout(t);
  }, [form.address]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (addressWrapperRef.current && !addressWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSuggestions(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const pickSuggestion = (s: AddressSuggestion) => {
    setForm((f) => {
      let nextCity = f.city;
      if (!nextCity.trim()) {
        const idx = s.address.lastIndexOf(',');
        if (idx !== -1) nextCity = s.address.substring(idx + 1).trim();
      }
      return {
        ...f,
        address: s.address,
        city: nextCity,
        customer_name: s.customer_name || f.customer_name,
        customer_phone: s.customer_phone || f.customer_phone,
      };
    });
    setExistingCaseWarning(s.source === 'case');
    setShowSuggestions(false);
  };


  const mutation = useMutation({
    mutationFn: async () => {
      const newCase = await createCase({
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email || null,
        address: form.address,
        city: form.city,
        offer_number: form.offer_number || null,
        order_value: form.order_value ? Number(form.order_value) : null,
        tb_percent: form.tb_percent ? Number(form.tb_percent) : null,
        extra_hours_sold: Number(form.extra_hours_sold) || 0,
        team: form.team || null,
        km_team: form.km_team || null,
        google_drive_link: form.google_drive_link || null,
        notes: form.notes || null,
        seller: sellerName,
        status: 'vantar_km',
        media_consent: form.media_consent,
        carry_help_needed: form.carry_help_needed,
        scheduled_delivery: form.scheduled_delivery,
      } as any);
      await createCaseEvent({
        case_id: newCase.id,
        event_type: 'status_change',
        description: `Ärende skapat, tilldelad montör: ${form.team || 'Ej tilldelad'}`,
        created_by: sellerName,
      });

      // Säkerställ att en visits-rad finns för försäljningsstatistiken
      try {
        if (prefill?.visit_id) {
          // Koppla den befintliga besöksraden (från "Registrera besök → signerat") till ärendet
          await updateVisit(prefill.visit_id, { case_id: newCase.id });
        } else {
          await createVisit({
            date: form.visit_date || new Date().toISOString().split('T')[0],
            address: form.address,
            customer_name: form.customer_name,
            seller: sellerName,
            result: 'signerat',
            order_value: form.order_value ? Number(form.order_value) : null,
            case_id: newCase.id,
          } as any);
        }
      } catch (visitErr) {
        console.error('Auto-create/link visit failed:', visitErr);
      }

      // Send email to assigned montör
      if (form.team && EMAIL_MAP[form.team]) {
        try {
          await sendNotificationEmail({
            to: EMAIL_MAP[form.team],
            subject: `NYTT ÄRENDE — ${form.address}`,
            body: `
              <h2>Nytt ärende tilldelat</h2>
              <table style="border-collapse:collapse;width:100%">
                <tr><td style="padding:4px 8px;font-weight:bold">Adress:</td><td style="padding:4px 8px">${form.address}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Kund:</td><td style="padding:4px 8px">${form.customer_name}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Telefon:</td><td style="padding:4px 8px">${form.customer_phone}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Säljare:</td><td style="padding:4px 8px">${sellerName}</td></tr>
                ${form.notes ? `<tr><td style="padding:4px 8px;font-weight:bold">Anteckning:</td><td style="padding:4px 8px">${form.notes}</td></tr>` : ''}
              </table>
              <p style="margin-top:16px"><strong>Vänligen boka kontrollmätning.</strong></p>
            `,
          });
          await createCaseEvent({
            case_id: newCase.id,
            event_type: 'notification',
            description: `Mail skickat till ${EMAIL_MAP[form.team]} (nytt ärende)`,
            created_by: sellerName,
          });
        } catch (emailErr) {
          console.error('Email notification failed:', emailErr);
          toast.warning('Ärendet skapades men mailet kunde inte skickas');
        }
      }

      return newCase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Ärende skapat!');
      onCreated();
    },
    onError: (err: Error) => {
      toast.error('Kunde inte skapa ärende: ' + err.message);
    },
  });

  const update = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const tbNum = form.tb_percent === '' ? null : Number(form.tb_percent);
  const tbInvalid = tbNum != null && (isNaN(tbNum) || tbNum < 0 || tbNum > 100);
  const ovNum = form.order_value === '' ? 0 : Number(form.order_value);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSubmit = () => {
    if (ovNum > 500_000) {
      setConfirmOpen(true);
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 md:px-0">
      <h2 className="text-xl font-bold text-foreground">Nytt ärende</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Kundnamn *</Label>
          <Input value={form.customer_name} onChange={(e) => update('customer_name', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefon *</Label>
          <Input value={form.customer_phone} onChange={(e) => update('customer_phone', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>E-post</Label>
          <Input value={form.customer_email} onChange={(e) => update('customer_email', e.target.value)} />
        </div>
        <div className="space-y-1.5 relative" ref={addressWrapperRef}>
          <Label>Adress *</Label>
          <Input
            value={form.address}
            onChange={(e) => {
              const newAddr = e.target.value;
              setForm((f) => {
                let nextCity = f.city;
                if (!nextCity.trim()) {
                  const idx = newAddr.lastIndexOf(',');
                  if (idx !== -1) nextCity = newAddr.substring(idx + 1).trim();
                }
                return { ...f, address: newAddr, city: nextCity };
              });
              setExistingCaseWarning(false);
            }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-card border rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  onClick={() => pickSuggestion(s)}
                  className="px-3 py-2 hover:bg-muted cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{s.address}</span>
                    {s.customer_name && (
                      <span className="text-muted-foreground ml-2 text-sm">{s.customer_name}</span>
                    )}
                  </div>
                  {s.source === 'case' ? (
                    <Badge className="bg-teal-500 hover:bg-teal-500/90 text-white shrink-0">Ärende</Badge>
                  ) : (
                    <Badge className="bg-orange-500 hover:bg-orange-500/90 text-white shrink-0">Order</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          {existingCaseWarning && (
            <p className="text-xs text-destructive">Det finns redan ett ärende på denna adress</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Ort *</Label>
          <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Offertnummer (Mockfjärds)</Label>
          <Input value={form.offer_number} onChange={(e) => update('offer_number', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Ordervärde (kr) <span className="text-muted-foreground text-xs ml-1">ex moms</span></Label>
          <Input type="number" value={form.order_value} onChange={(e) => update('order_value', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>TB (%)</Label>
          <Input type="number" min={0} max={100} value={form.tb_percent} onChange={(e) => update('tb_percent', e.target.value)} />
          {tbInvalid && (
            <p className="text-xs text-destructive">TB% måste vara mellan 0 och 100. Skrev du 160 istället för 16?</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Extra timmar sålda till kund (á {HOUR_RATE} kr/st)</Label>
          <Input type="number" value={form.extra_hours_sold} onChange={(e) => update('extra_hours_sold', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Besöksdatum <span className="text-muted-foreground text-xs ml-1">för statistik</span></Label>
          <Input type="date" value={form.visit_date} onChange={(e) => update('visit_date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>KM-montör (valfritt)</Label>
          <Select value={form.km_team || '__none__'} onValueChange={(v) => update('km_team', v === '__none__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Ingen vald" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Ingen vald —</SelectItem>
              {MONTORS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Montage-montör (valfritt)</Label>
          <Select value={form.team || '__none__'} onValueChange={(v) => update('team', v === '__none__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Ingen vald" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Ingen vald —</SelectItem>
              {MONTORS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Google Drive-länk</Label>
          <Input value={form.google_drive_link} onChange={(e) => update('google_drive_link', e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Anteckning</Label>
        <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} />
      </div>

      <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Att tänka på vid montage</h3>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.media_consent}
            onCheckedChange={(c) => update('media_consent', c === true)}
          />
          Foto/film överenskommet med kund
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.carry_help_needed}
            onCheckedChange={(c) => update('carry_help_needed', c === true)}
          />
          Behövs bärhjälp?
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2">
            <Checkbox
              checked={form.scheduled_delivery}
              onCheckedChange={(c) => update('scheduled_delivery', c === true)}
            />
            Tidsstyrd leverans (tidslossning)
          </span>
          {form.scheduled_delivery && (
            <span className="text-xs text-muted-foreground pl-6">Tiden anges senare, veckan innan leverans</span>
          )}
        </label>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!form.customer_name || !form.customer_phone || !form.address || !form.city || tbInvalid || mutation.isPending}
        className="w-full sm:w-auto"
      >
        {mutation.isPending ? 'Sparar...' : 'Skapa ärende'}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekräfta ordervärde</AlertDialogTitle>
            <AlertDialogDescription>
              Du har angett {formatAmount(ovNum)} — stämmer det? Detta är ovanligt högt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt, rätta värdet</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); mutation.mutate(); }}>
              Ja, värdet stämmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
