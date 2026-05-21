import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCase, createCaseEvent } from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { MONTORS, SELLERS, STATUS_LABELS, SELLER_PIPELINE_COLUMNS, HOUR_RATE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Upload, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportCaseFormProps {
  sellerName: string;
}

const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

// Rensa svenska sifferformat (t.ex. "2 785,58 kr" -> "2786")
const parseSwedishNumber = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined || val === '') return '';
  const s = String(val)
    .replace(/\s/g, '')
    .replace(/kr$/i, '')
    .replace(/,(\d{1,2})$/, '.$1')
    .replace(/,/g, '')
    .trim();
  const num = parseFloat(s);
  return isNaN(num) ? '' : String(Math.round(num));
};

export function ImportCaseForm({ sellerName }: ImportCaseFormProps) {
  const queryClient = useQueryClient();
  const [importCount, setImportCount] = useState(0);
  const [pasteText, setPasteText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [aiSuccessCount, setAiSuccessCount] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAiExtract = async () => {
    if (!pasteText.trim()) return;
    setIsParsing(true);
    setAiError(null);
    setAiSuccessCount(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const { data, error } = await supabase.functions.invoke('parse-customer-portal', {
        body: { text: pasteText },
      });
      clearTimeout(timeoutId);

      if (error) throw new Error(error.message || 'Anrop misslyckades');
      if (data?.error) throw new Error(data.error);
      const parsed = data?.data;
      if (!parsed) throw new Error('Inget data returnerades');

      parsed.order_value = parseSwedishNumber(parsed.order_value);
      parsed.tb_percent = parseSwedishNumber(parsed.tb_percent);

      // Validera datumfält — flytta ogiltiga värden till notes
      const dateFields: Array<'km_date' | 'montage_date' | 'delivery_date'> = ['km_date', 'montage_date', 'delivery_date'];
      const dateLabels: Record<string, string> = { km_date: 'KM', montage_date: 'Montage', delivery_date: 'Leverans' };
      for (const f of dateFields) {
        const val = (parsed as any)[f];
        if (val && !isValidDate(val)) {
          parsed.notes = (parsed.notes || '') + ` | ${dateLabels[f]}: ${val}`;
          (parsed as any)[f] = '';
        }
      }

      const filled = new Set<string>();
      setForm((f) => {
        const next: any = { ...f };
        const apply = (key: keyof typeof f, value: string) => {
          if (value && value.trim()) {
            next[key] = value;
            filled.add(key as string);
          }
        };
        apply('customer_name', parsed.customer_name);
        apply('customer_phone', parsed.customer_phone);
        apply('customer_email', parsed.customer_email);
        apply('address', parsed.address);
        apply('offer_number', parsed.offer_number);
        if (parsed.order_value) {
          next.order_value = parsed.order_value;
          filled.add('order_value');
        }
        if (parsed.tb_percent) {
          next.tb_percent = parsed.tb_percent;
          filled.add('tb_percent');
        }
        apply('status', parsed.status);
        apply('team', parsed.team);
        apply('km_date', parsed.km_date);
        apply('montage_date', parsed.montage_date);
        apply('notes', parsed.notes);
        return next;
      });

      setAiFilled(filled);
      setAiSuccessCount(filled.size);
      toast.success(`Data extraherad — ${filled.size} fält ifyllda. Granska innan du sparar.`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      const msg = err?.name === 'AbortError'
        ? 'Tidsgräns nådd (15s). Försök igen.'
        : (err?.message || 'Kunde inte tolka texten');
      setAiError(msg);
      toast.error(msg);
      console.error('AI parse error:', err);
    } finally {
      setIsParsing(false);
    }
  };

  const aiClass = (key: string) =>
    aiFilled.has(key) ? 'bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800' : '';

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
    media_consent: false,
    carry_help_needed: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const caseData: any = {
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email || null,
        address: form.address,
        offer_number: form.offer_number || null,
        order_value: parseSwedishNumber(form.order_value) ? Number(parseSwedishNumber(form.order_value)) : null,
        tb_percent: parseSwedishNumber(form.tb_percent) ? Number(parseSwedishNumber(form.tb_percent)) : null,
        extra_hours_sold: Number(form.extra_hours_sold) || 0,
        extra_hours_requested: Number(form.extra_hours_requested) || 0,
        extra_hours_approved: Number(form.extra_hours_approved) || 0,
        team: form.team || null,
        seller: form.seller,
        status: form.status,
        google_drive_link: form.google_drive_link || null,
        notes: form.notes || null,
        km_date: form.km_date && isValidDate(form.km_date) ? form.km_date : null,
        montage_date: form.montage_date && isValidDate(form.montage_date) ? form.montage_date : null,
        delivery_date: form.delivery_date && isValidDate(form.delivery_date) ? form.delivery_date : null,
        imported: true,
        media_consent: form.media_consent,
        carry_help_needed: form.carry_help_needed,
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
        media_consent: false,
        carry_help_needed: false,
      }));
    },
    onError: (err: Error) => {
      toast.error('Kunde inte importera ärende: ' + err.message);
    },
  });

  const update = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (aiFilled.has(key)) {
      setAiFilled((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

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

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Snabbimport från Kundportalen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Öppna kunden i Kundportalen, markera all text på sidan (Ctrl+A) och klistra in nedan. AI:n extraherar automatiskt alla fält.
          </p>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder="Klistra in text från Kundportalen här..."
            disabled={isParsing}
          />
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              onClick={handleAiExtract}
              disabled={!pasteText.trim() || isParsing}
              size="sm"
            >
              {isParsing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {isParsing ? 'Extraherar...' : 'Extrahera med AI'}
            </Button>
            {aiSuccessCount !== null && !aiError && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                ✓ {aiSuccessCount} fält extraherade — granska och justera vid behov
              </span>
            )}
            {aiError && (
              <span className="text-xs text-destructive font-medium">{aiError}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />


      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Kundnamn *</Label>
          <Input className={cn(aiClass('customer_name'))} value={form.customer_name} onChange={(e) => update('customer_name', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefon *</Label>
          <Input className={cn(aiClass('customer_phone'))} value={form.customer_phone} onChange={(e) => update('customer_phone', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>E-post</Label>
          <Input className={cn(aiClass('customer_email'))} value={form.customer_email} onChange={(e) => update('customer_email', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Adress *</Label>
          <Input className={cn(aiClass('address'))} value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Status *</Label>
          <Select value={form.status} onValueChange={(v) => update('status', v)}>
            <SelectTrigger className={cn(aiClass('status'))}><SelectValue /></SelectTrigger>
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
            <SelectTrigger className={cn(aiClass('team'))}><SelectValue placeholder="Välj montör..." /></SelectTrigger>
            <SelectContent>
              {MONTORS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>KM-datum</Label>
          <Input className={cn(aiClass('km_date'))} type="date" value={form.km_date} onChange={(e) => update('km_date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Montagedatum</Label>
          <Input className={cn(aiClass('montage_date'))} type="date" value={form.montage_date} onChange={(e) => update('montage_date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Leveransdatum</Label>
          <Input type="date" value={form.delivery_date} onChange={(e) => update('delivery_date', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Offertnummer</Label>
          <Input className={cn(aiClass('offer_number'))} value={form.offer_number} onChange={(e) => update('offer_number', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Ordervärde (kr)</Label>
          <Input className={cn(aiClass('order_value'))} type="number" value={form.order_value} onChange={(e) => update('order_value', e.target.value)} />
          {Number(parseSwedishNumber(form.order_value)) > 500000 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              ⚠ Ordervärde över 500 000 kr — dubbelkolla att det stämmer
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>TB (%)</Label>
          <Input className={cn(aiClass('tb_percent'))} type="number" value={form.tb_percent} onChange={(e) => update('tb_percent', e.target.value)} />
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
        <Textarea className={cn(aiClass('notes'))} value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} />
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
