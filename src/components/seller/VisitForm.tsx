import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createVisit } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { celebrateSignedDeal } from '@/lib/celebrate';

interface VisitFormProps {
  sellerName: string;
  onCreateCase: (data: { customer_name: string; address: string; order_value?: number }) => void;
}

export function VisitForm({ sellerName, onCreateCase }: VisitFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    address: '',
    customer_name: '',
    result: 'signerat' as string,
    order_value: '',
    follow_up_date: '',
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: () =>
      createVisit({
        date: form.date,
        address: form.address,
        customer_name: form.customer_name,
        seller: sellerName,
        result: form.result,
        order_value: form.order_value ? Number(form.order_value) : null,
        follow_up_date: form.result === 'aterkoppla' && form.follow_up_date ? form.follow_up_date : null,
        notes: form.notes || null,
      }),
    onSuccess: (visit) => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });

      if (form.result === 'signerat') {
        const ov = form.order_value ? Number(form.order_value) : undefined;
        celebrateSignedDeal(ov);
        onCreateCase({
          customer_name: form.customer_name,
          address: form.address,
          order_value: ov,
        });
      } else {
        toast.success('Besök registrerat!');
      }

      setForm({
        date: new Date().toISOString().split('T')[0],
        address: '',
        customer_name: '',
        result: 'signerat',
        order_value: '',
        follow_up_date: '',
        notes: '',
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 md:px-0">
      <h2 className="text-xl font-bold text-foreground">Registrera besök</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Datum *</Label>
          <Input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Adress *</Label>
          <Input value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Kundnamn *</Label>
          <Input value={form.customer_name} onChange={(e) => update('customer_name', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Säljare</Label>
          <Input value={sellerName} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Ordervärde (kr)</Label>
          <Input type="number" value={form.order_value} onChange={(e) => update('order_value', e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Resultat *</Label>
        <RadioGroup value={form.result} onValueChange={(v) => update('result', v)} className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="signerat" id="r-signerat" />
            <Label htmlFor="r-signerat" className="font-normal">Signerat avtal</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="nej" id="r-nej" />
            <Label htmlFor="r-nej" className="font-normal">Nej</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="aterkoppla" id="r-aterkoppla" />
            <Label htmlFor="r-aterkoppla" className="font-normal">Återkoppla</Label>
          </div>
        </RadioGroup>
      </div>

      {form.result === 'aterkoppla' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Återkoppla datum</Label>
            <Input type="date" value={form.follow_up_date} onChange={(e) => update('follow_up_date', e.target.value)} />
          </div>
        </div>
      )}

      {form.result === 'signerat' && (
        <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3">
          💡 Efter att besöket sparats öppnas formuläret för att skapa ett nytt ärende med ifylld kundinfo.
        </p>
      )}

      <div className="space-y-1.5">
        <Label>Anteckning</Label>
        <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} />
      </div>

      <Button
        onClick={() => mutation.mutate()}
        disabled={!form.date || !form.address || !form.customer_name || mutation.isPending}
        className="w-full sm:w-auto"
      >
        {mutation.isPending ? 'Sparar...' : 'Spara besök'}
      </Button>
    </div>
  );
}
