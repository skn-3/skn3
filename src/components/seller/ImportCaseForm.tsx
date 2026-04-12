import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCase, createCaseEvent } from '@/lib/supabaseClient';
import { MONTORS, SELLERS, STATUS_LABELS, SELLER_PIPELINE_COLUMNS, HOUR_RATE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';

interface ImportCaseFormProps {
  sellerName: string;
}

export function ImportCaseForm({ sellerName }: ImportCaseFormProps) {
  const queryClient = useQueryClient();
  const [importCount, setImportCount] = useState(0);

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    address: '',
    offer_number: '',
    order_value: '',
    tb_percent: '',
    extra_hours_sold: '0',
    extra_hours_requested: '0',
    extra_hours_approved: '0',
    team: '',
    seller: sellerName,
    status: 'ny',
    created_at: '',
    km_date: '',
    montage_date: '',
    delivery_date: '',
    google_drive_link: '',
    notes: 'Importerat manuellt, befintligt ärende',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const caseData: any = {
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email || null,
        address: form.address,
        offer_number: form.offer_number || null,
        order_value: form.order_value ? Number(form.order_value) : null,
        tb_percent: form.tb_percent ? Number(form.tb_percent) : null,
        extra_hours_sold: Number(form.extra_hours_sold) || 0,
        extra_hours_requested: Number(form.extra_hours_requested) || 0,
        extra_hours_approved: Number(form.extra_hours_approved) || 0,
        team: form.team || null,
        seller: form.seller,
        status: form.status,
        google_drive_link: form.google_drive_link || null,
        notes: form.notes || null,
        km_date: form.km_date || null,
        montage_date: form.montage_date || null,
        delivery_date: form.delivery_date || null,
        imported: true,
      };

      // Set historical created_at if provided
      if (form.created_at) {
        caseData.created_at = new Date(form.created_at).toISOString();
      }

      const newCase = await createCase(caseData);

      // Log import event — NO emails
      await createCaseEvent({
        case_id: newCase.id,
        event_type: 'import',
        description: 'Ärende importerat manuellt',
        created_by: 'Admin (import)',
      });

      return newCase;
    },
    onSuccess: (newCase) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases_all'] });
      setImportCount((c) => c + 1);
      toast.success(`Ärende importerat — ${form.address} (status: ${STATUS_LABELS[form.status] || form.status})`);

      // Keep seller and team prefilled for bulk import
      const keepSeller = form.seller;
      const keepTeam = form.team;
      setForm((f) => ({
        ...f,
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        address: '',
        offer_number: '',
        order_value: '',
        tb_percent: '',
        extra_hours_sold: '0',
        extra_hours_requested: '0',
        extra_hours_approved: '0',
        status: 'ny',
        created_at: '',
        km_date: '',
        montage_date: '',
        delivery_date: '',
        google_drive_link: '',
        notes: 'Importerat manuellt, befintligt ärende',
        seller: keepSeller,
        team: keepTeam,
      }));
    },
    onError: (err: Error) => {
      toast.error('Kunde inte importera ärende: ' + err.message);
    },
  });

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 md:px-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Upload className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Importera ärende</h2>
        </div>
        {importCount > 0 && (
          <span className="text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
            {importCount} ärende{importCount !== 1 ? 'n' : ''} importerade denna session
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Importera befintliga/historiska ärenden. Inga mail skickas och ärendet markeras som importerat.
      </p>

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
          <Label>Status *</Label>
          <Select value={form.status} onValueChange={(v) => update('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SELLER_PIPELINE_COLUMNS.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ursprungligt skapandedatum</Label>
          <Input type="date" value={form.created_at} onChange={(e) => update('created_at', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Säljare *</Label>
          <Select value={form.seller} onValueChange={(v) => update('seller', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SELLERS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Label>KM-datum</Label>
          <Input type="date" value={form.km_date} onChange={(e) => update('km_date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Montagedatum</Label>
          <Input type="date" value={form.montage_date} onChange={(e) => update('montage_date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Leveransdatum</Label>
          <Input type="date" value={form.delivery_date} onChange={(e) => update('delivery_date', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Offertnummer</Label>
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
          <Label>Extra timmar sålda (á {HOUR_RATE} kr/st)</Label>
          <Input type="number" value={form.extra_hours_sold} onChange={(e) => update('extra_hours_sold', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Extra timmar begärda</Label>
          <Input type="number" value={form.extra_hours_requested} onChange={(e) => update('extra_hours_requested', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Extra timmar godkända</Label>
          <Input type="number" value={form.extra_hours_approved} onChange={(e) => update('extra_hours_approved', e.target.value)} />
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
        <Upload className="h-4 w-4 mr-2" />
        {mutation.isPending ? 'Importerar...' : 'Importera ärende'}
      </Button>
    </div>
  );
}
