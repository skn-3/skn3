import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCase, createCaseEvent } from '@/lib/supabaseClient';
import { MONTORS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface NewCaseFormProps {
  sellerName: string;
  onCreated: () => void;
}

export function NewCaseForm({ sellerName, onCreated }: NewCaseFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    address: '',
    offer_number: '',
    order_value: '',
    tb_percent: '',
    extra_hours_sold: '0',
    team: '',
    google_drive_link: '',
    notes: '',
  });

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
        description: 'Ärende skapat, status: Väntar KM',
        created_by: sellerName,
      });
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
          <Label>Extra timmar sålda</Label>
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
