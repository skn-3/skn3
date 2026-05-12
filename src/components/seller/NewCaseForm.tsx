import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCase, createCaseEvent, sendNotificationEmail } from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { orderDb } from '@/integrations/supabase/orderClient';
import { MONTORS, EMAIL_MAP, HOUR_RATE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  prefill?: { customer_name?: string; address?: string; order_value?: string };
}

export function NewCaseForm({ sellerName, onCreated, prefill }: NewCaseFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    customer_name: prefill?.customer_name || '',
    customer_phone: '',
    customer_email: '',
    address: prefill?.address || '',
    offer_number: '',
    order_value: prefill?.order_value || '',
    tb_percent: '',
    extra_hours_sold: '0',
    team: '',
    google_drive_link: '',
    notes: '',
  });

  useEffect(() => {
    if (prefill) {
      setForm((f) => ({
        ...f,
        customer_name: prefill.customer_name || f.customer_name,
        address: prefill.address || f.address,
        order_value: prefill.order_value || f.order_value,
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
      const [casesRes, ordersRes] = await Promise.all([
        supabase
          .from('cases')
          .select('id, address, customer_name, customer_phone, order_value')
          .ilike('address', `%${term}%`)
          .limit(5),
        orderDb
          .from('orders')
          .select('id, customer_address, customer_name, customer_phone')
          .ilike('customer_address', `%${term}%`)
          .limit(5),
      ]);
      const list: AddressSuggestion[] = [];
      (casesRes.data || []).forEach((c: any) => list.push({
        source: 'case',
        address: c.address,
        customer_name: c.customer_name,
        customer_phone: c.customer_phone || '',
      }));
      (ordersRes.data || []).forEach((o: any) => list.push({
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
    setForm((f) => ({
      ...f,
      address: s.address,
      customer_name: s.customer_name || f.customer_name,
      customer_phone: s.customer_phone || f.customer_phone,
    }));
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
        offer_number: form.offer_number || null,
        order_value: form.order_value ? Number(form.order_value) : null,
        tb_percent: form.tb_percent ? Number(form.tb_percent) : null,
        extra_hours_sold: Number(form.extra_hours_sold) || 0,
        team: form.team || null,
        google_drive_link: form.google_drive_link || null,
        notes: form.notes || null,
        seller: sellerName,
        status: 'vantar_km',
      });
      await createCaseEvent({
        case_id: newCase.id,
        event_type: 'status_change',
        description: `Ärende skapat, tilldelad montör: ${form.team || 'Ej tilldelad'}`,
        created_by: sellerName,
      });

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

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

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
        <div className="space-y-1.5">
          <Label>Adress *</Label>
          <Input value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Offertnummer (Mockfjärds)</Label>
          <Input value={form.offer_number} onChange={(e) => update('offer_number', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Ordervärde (kr)</Label>
          <Input type="number" value={form.order_value} onChange={(e) => update('order_value', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>TB (%)</Label>
          <Input type="number" value={form.tb_percent} onChange={(e) => update('tb_percent', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Extra timmar sålda till kund (á {HOUR_RATE} kr/st)</Label>
          <Input type="number" value={form.extra_hours_sold} onChange={(e) => update('extra_hours_sold', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Montör</Label>
          <Select value={form.team} onValueChange={(v) => update('team', v)}>
            <SelectTrigger><SelectValue placeholder="Välj montör..." /></SelectTrigger>
            <SelectContent>
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

      <Button
        onClick={() => mutation.mutate()}
        disabled={!form.customer_name || !form.customer_phone || !form.address || mutation.isPending}
        className="w-full sm:w-auto"
      >
        {mutation.isPending ? 'Sparar...' : 'Skapa ärende'}
      </Button>
    </div>
  );
}
