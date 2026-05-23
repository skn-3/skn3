import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCase, createCaseEvent, fetchAllCases, type CaseRow } from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { MONTORS, SELLERS, STATUS_LABELS, SELLER_PIPELINE_COLUMNS, HOUR_RATE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CaseDetailPanel } from '@/components/shared/CaseDetailPanel';
import { formatAmount } from '@/lib/utils';
import { toast } from 'sonner';
import { Upload, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
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


// --- Duplicate detection helpers ---
const normText = (s: string | null | undefined) =>
  (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normPhone = (s: string | null | undefined) => {
  let p = (s || '').replace(/\D/g, '');
  if (p.startsWith('46')) p = '0' + p.slice(2);
  return p.replace(/^0+/, '');
};
const normOffer = (s: string | null | undefined) =>
  (s || '').trim().toLowerCase().replace(/\s+/g, '');

export type DuplicateMatch = {
  case: CaseRow;
  reasons: string[];
  strength: 'strong' | 'medium';
};

export function findPotentialDuplicates(
  form: { customer_name: string; customer_phone: string; address: string; offer_number: string },
  existingCases: CaseRow[],
): DuplicateMatch[] {
  const fName = normText(form.customer_name);
  const fPhone = normPhone(form.customer_phone);
  const fAddr = normText(form.address);
  const fOffer = normOffer(form.offer_number);
  const addrTokens = fAddr.split(/[\s,]+/).filter((t) => t.length >= 3);

  const matches = new Map<string, DuplicateMatch>();
  const add = (c: CaseRow, reason: string, strong: boolean) => {
    const cur = matches.get(c.id);
    if (cur) {
      if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
      if (strong) cur.strength = 'strong';
    } else {
      matches.set(c.id, { case: c, reasons: [reason], strength: strong ? 'strong' : 'medium' });
    }
  };

  for (const c of existingCases) {
    const cOffer = normOffer(c.offer_number);
    const cPhone = normPhone(c.customer_phone);
    const cAddr = normText(c.address);
    const cName = normText(c.customer_name);

    if (fOffer && cOffer && fOffer === cOffer) add(c, 'Samma offertnummer', true);
    if (fPhone && cPhone && fPhone === cPhone) add(c, 'Samma telefonnummer', true);
    if (fAddr && cAddr && fAddr === cAddr) add(c, 'Samma adress', false);
    if (fName && cName && fName === cName && addrTokens.length > 0) {
      const cAddrTokens = cAddr.split(/[\s,]+/);
      if (addrTokens.some((t) => cAddrTokens.includes(t))) {
        add(c, 'Samma kund + del av adress', false);
      }
    }
  }

  return Array.from(matches.values()).sort((a, b) =>
    a.strength === b.strength ? 0 : a.strength === 'strong' ? -1 : 1,
  );
}

export function ImportCaseForm({ sellerName }: ImportCaseFormProps) {
  const queryClient = useQueryClient();
  const [importCount, setImportCount] = useState(0);
  const [pasteText, setPasteText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [aiSuccessCount, setAiSuccessCount] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const { data: existingCases = [] } = useQuery({
    queryKey: ['cases_all_for_dup'],
    queryFn: fetchAllCases,
    staleTime: 60_000,
  });

  const [dupCandidates, setDupCandidates] = useState<DuplicateMatch[]>([]);
  const [viewCase, setViewCase] = useState<CaseRow | null>(null);
  const [dupConfirmOpen, setDupConfirmOpen] = useState(false);

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
        // Autofill city from address if empty
        if (parsed.address && (!next.city || !next.city.trim())) {
          const idx = String(parsed.address).lastIndexOf(',');
          if (idx !== -1) {
            const c = String(parsed.address).substring(idx + 1).trim();
            if (c) { next.city = c; filled.add('city'); }
          }
        }
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
    city: '',
    offer_number: '',
    order_value: '',
    tb_percent: '',
    extra_hours_sold: '0',
    extra_hours_requested: '0',
    extra_hours_approved: '0',
    team: '',
    km_team: '',
    seller: sellerName,
    status: 'ny',
    created_at: '',
    km_date: '',
    km_time: '',
    montage_date: '',
    montage_time: '',
    delivery_mode: 'date' as 'date' | 'week',
    delivery_date: '',
    delivery_time: '',
    delivery_week: '',
    delivery_year: String(new Date().getFullYear()),
    google_drive_link: '',
    notes: 'Importerat manuellt, befintligt ärende',
    media_consent: false,
    carry_help_needed: false,
    scheduled_delivery: false,
  });


  const mutation = useMutation({
    mutationFn: async (vars: { dupReasons?: string[] } = {}) => {
      const caseData: any = {
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email || null,
        address: form.address,
        city: form.city,
        offer_number: form.offer_number || null,
        order_value: parseSwedishNumber(form.order_value) ? Number(parseSwedishNumber(form.order_value)) : null,
        tb_percent: parseSwedishNumber(form.tb_percent) ? Number(parseSwedishNumber(form.tb_percent)) : null,
        extra_hours_sold: Number(form.extra_hours_sold) || 0,
        extra_hours_requested: Number(form.extra_hours_requested) || 0,
        extra_hours_approved: Number(form.extra_hours_approved) || 0,
        team: form.team || null,
        km_team: form.km_team || null,
        seller: form.seller,
        status: form.status,
        google_drive_link: form.google_drive_link || null,
        notes: form.notes || null,
        km_date: form.km_date && isValidDate(form.km_date) ? form.km_date : null,
        km_time: form.km_time || null,
        montage_date: form.montage_date && isValidDate(form.montage_date) ? form.montage_date : null,
        montage_time: form.montage_time || null,
        delivery_date: form.delivery_mode === 'date' && form.delivery_date && isValidDate(form.delivery_date) ? form.delivery_date : null,
        delivery_time: form.delivery_mode === 'date' && form.delivery_time ? form.delivery_time : null,
        delivery_week: form.delivery_mode === 'week' && form.delivery_week ? Number(form.delivery_week) : null,
        delivery_year: form.delivery_mode === 'week' && form.delivery_week ? Number(form.delivery_year) : null,
        imported: true,
        media_consent: form.media_consent,
        carry_help_needed: form.carry_help_needed,
        scheduled_delivery: form.scheduled_delivery,
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

      if (vars.dupReasons && vars.dupReasons.length > 0) {
        await createCaseEvent({
          case_id: newCase.id,
          event_type: 'import',
          description: `Importerat trots möjlig dubblett (matchade: ${vars.dupReasons.join(', ')})`,
          created_by: 'Admin (import)',
        });
      }

      return newCase;
    },
    onSuccess: (newCase) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['cases_all'] });
      queryClient.invalidateQueries({ queryKey: ['cases_all_for_dup'] });
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
        city: '',
        offer_number: '',
        order_value: '',
        tb_percent: '',
        extra_hours_sold: '0',
        extra_hours_requested: '0',
        extra_hours_approved: '0',
        status: 'ny',
        created_at: '',
        km_date: '',
        km_time: '',
        montage_date: '',
        montage_time: '',
        delivery_mode: 'date',
        delivery_date: '',
        delivery_time: '',
        delivery_week: '',
        delivery_year: String(new Date().getFullYear()),

        google_drive_link: '',
        notes: 'Importerat manuellt, befintligt ärende',
        seller: keepSeller,
        team: keepTeam,
        media_consent: false,
        carry_help_needed: false,
        scheduled_delivery: false,
      }));
    },
    onError: (err: Error) => {
      toast.error('Kunde inte importera ärende: ' + err.message);
    },
  });

  const update = (key: string, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value } as any));
    if (typeof value === 'string' && aiFilled.has(key)) {
      setAiFilled((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const tbStr = parseSwedishNumber(form.tb_percent);
  const tbNum = tbStr === '' ? null : Number(tbStr);
  const tbInvalid = tbNum != null && (isNaN(tbNum) || tbNum < 0 || tbNum > 100);
  const ovStr = parseSwedishNumber(form.order_value);
  const ovNum = ovStr === '' ? 0 : Number(ovStr);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Debounced duplicate detection
  useEffect(() => {
    const handle = setTimeout(() => {
      const hasInput =
        form.customer_name.trim() ||
        form.customer_phone.trim() ||
        form.address.trim() ||
        form.offer_number.trim();
      if (!hasInput || existingCases.length === 0) {
        setDupCandidates([]);
        return;
      }
      setDupCandidates(findPotentialDuplicates(form, existingCases));
    }, 300);
    return () => clearTimeout(handle);
  }, [form.customer_name, form.customer_phone, form.address, form.offer_number, existingCases]);

  const strongMatches = useMemo(
    () => dupCandidates.filter((m) => m.strength === 'strong'),
    [dupCandidates],
  );

  const runImport = (acknowledgedDup: boolean) => {
    const dupReasons = acknowledgedDup
      ? Array.from(new Set(strongMatches.flatMap((m) => m.reasons)))
      : undefined;
    mutation.mutate({ dupReasons });
  };

  const handleSubmit = () => {
    if (!form.seller || !(SELLERS as readonly string[]).includes(form.seller)) {
      toast.error(`Säljare måste vara en av: ${SELLERS.join(', ')}`);
      return;
    }
    if (form.scheduled_delivery && !form.delivery_time) {
      toast.error('Tidslossning kräver klockslag');
      return;
    }
    if (form.delivery_mode === 'week' && form.delivery_week && !form.delivery_year) {
      toast.error('Vecka kräver också år');
      return;
    }
    if (form.delivery_mode === 'week' && form.delivery_week) {
      const w = Number(form.delivery_week);
      if (isNaN(w) || w < 1 || w > 53) {
        toast.error('Vecka måste vara mellan 1 och 53');
        return;
      }
    }
    if (ovNum > 500_000) {
      setConfirmOpen(true);
      return;
    }
    if (strongMatches.length > 0) {
      setDupConfirmOpen(true);
      return;
    }
    runImport(false);
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
          <Input
            className={cn(aiClass('address'))}
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
              if (aiFilled.has('address')) {
                setAiFilled((prev) => { const n = new Set(prev); n.delete('address'); return n; });
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ort *</Label>
          <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
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
          <div className="flex gap-2">
            <Input className={cn(aiClass('km_date'), 'flex-1')} type="date" value={form.km_date} onChange={(e) => update('km_date', e.target.value)} />
            <Input type="time" className="w-28" value={form.km_time} onChange={(e) => update('km_time', e.target.value)} placeholder="Tid" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Montagedatum</Label>
          <div className="flex gap-2">
            <Input className={cn(aiClass('montage_date'), 'flex-1')} type="date" value={form.montage_date} onChange={(e) => update('montage_date', e.target.value)} />
            <Input type="time" className="w-28" value={form.montage_time} onChange={(e) => update('montage_time', e.target.value)} placeholder="Tid" />
          </div>
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Leverans</Label>
          <RadioGroup
            value={form.scheduled_delivery ? 'date' : form.delivery_mode}
            onValueChange={(v) => update('delivery_mode', v)}
            className="flex gap-4"
            disabled={form.scheduled_delivery}
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="date" /> Exakt datum
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="week" disabled={form.scheduled_delivery} /> Vecka
            </label>
          </RadioGroup>
          {form.scheduled_delivery && (
            <p className="text-xs text-muted-foreground">Tidslossning kräver exakt datum och tid</p>
          )}
          {(form.scheduled_delivery || form.delivery_mode === 'date') ? (
            <div className="flex gap-2">
              <Input type="date" className="flex-1" value={form.delivery_date} onChange={(e) => update('delivery_date', e.target.value)} />
              <Input
                type="time"
                className="w-28"
                value={form.delivery_time}
                onChange={(e) => update('delivery_time', e.target.value)}
                placeholder={form.scheduled_delivery ? 'Tid *' : 'Tid'}
              />
            </div>
          ) : (
            <div className="flex gap-2">
              <Input type="number" min={1} max={53} placeholder="Vecka" className="flex-1" value={form.delivery_week} onChange={(e) => update('delivery_week', e.target.value)} />
              <Input type="number" className="w-28" placeholder="År" value={form.delivery_year} onChange={(e) => update('delivery_year', e.target.value)} />
            </div>
          )}
        </div>


        <div className="space-y-1.5">
          <Label>Offertnummer</Label>
          <Input className={cn(aiClass('offer_number'))} value={form.offer_number} onChange={(e) => update('offer_number', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Ordervärde (kr) <span className="text-muted-foreground text-xs ml-1">ex moms</span></Label>
          <Input className={cn(aiClass('order_value'))} type="number" value={form.order_value} onChange={(e) => update('order_value', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>TB (%)</Label>
          <Input className={cn(aiClass('tb_percent'))} type="number" min={0} max={100} value={form.tb_percent} onChange={(e) => update('tb_percent', e.target.value)} />
          {tbInvalid && (
            <p className="text-xs text-destructive">TB% måste vara mellan 0 och 100. Skrev du 160 istället för 16?</p>
          )}
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

      <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Att tänka på vid montage</h3>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.media_consent} onCheckedChange={(c) => update('media_consent', c === true)} />
          Foto/film överenskommet med kund
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.carry_help_needed} onCheckedChange={(c) => update('carry_help_needed', c === true)} />
          Behövs bärhjälp?
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.scheduled_delivery} onCheckedChange={(c) => update('scheduled_delivery', c === true)} />
          Tidsstyrd leverans (tidslossning)
        </label>
      </div>


      {dupCandidates.length > 0 && (
        <div className={cn(
          "rounded-lg border p-3 space-y-2",
          strongMatches.length > 0
            ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700"
            : "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-700",
        )}>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4" />
            Möjlig dubblett — {dupCandidates.length} liknande ärende{dupCandidates.length !== 1 ? 'n' : ''} finns redan
          </div>
          <ul className="space-y-1.5">
            {dupCandidates.slice(0, 5).map((m) => (
              <li key={m.case.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">{m.case.address}</span>
                <span className="text-muted-foreground">· {m.case.customer_name}</span>
                <span className="text-muted-foreground">· {m.case.seller}</span>
                <span className="text-muted-foreground">· {new Date(m.case.created_at).toLocaleDateString('sv-SE')}</span>
                {m.reasons.map((r) => (
                  <Badge
                    key={r}
                    variant={m.strength === 'strong' ? 'destructive' : 'secondary'}
                    className="text-[10px]"
                  >
                    {r}
                  </Badge>
                ))}
                <button
                  type="button"
                  onClick={() => setViewCase(m.case)}
                  className="ml-auto text-primary underline underline-offset-2 hover:no-underline"
                >
                  Visa ärende
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!form.customer_name || !form.customer_phone || !form.address || !form.city || tbInvalid || mutation.isPending}
        className="w-full sm:w-auto"
      >
        <Upload className="h-4 w-4 mr-2" />
        {mutation.isPending ? 'Importerar...' : 'Importera ärende'}
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
            <AlertDialogAction onClick={() => {
              setConfirmOpen(false);
              if (strongMatches.length > 0) { setDupConfirmOpen(true); return; }
              runImport(false);
            }}>
              Ja, värdet stämmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dupConfirmOpen} onOpenChange={setDupConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Detta ärende finns kanske redan</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>En starkt matchande träff hittades:</p>
                {strongMatches[0] && (
                  <div className="rounded-md border bg-muted/40 p-2 text-sm text-foreground">
                    <div className="font-medium">{strongMatches[0].case.address}</div>
                    <div className="text-xs text-muted-foreground">
                      {strongMatches[0].case.customer_name}
                      {strongMatches[0].case.offer_number ? ` · Offert ${strongMatches[0].case.offer_number}` : ''}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {strongMatches[0].reasons.map((r) => (
                        <Badge key={r} variant="destructive" className="text-[10px]">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <p>Vill du importera ändå?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDupConfirmOpen(false); runImport(true); }}>
              Importera ändå
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewCase && (
        <CaseDetailPanel
          caseData={viewCase}
          currentUser={sellerName}
          isSeller={true}
          onClose={() => setViewCase(null)}
        />
      )}
    </div>
  );
}
