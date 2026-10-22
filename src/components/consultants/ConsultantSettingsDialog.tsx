// Inställningar för en konsult: alla fält, provisionstrappa, standardavdrag,
// samt knapp för att lägga till en helt ny konsult.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DEFAULT_TIERS, type CommissionTier } from '@/lib/consultantPay';

interface StdDeduction { label: string; amount: number; defaultOn: boolean }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  consultant: any | null;
  onSaved: () => void;
}

const emptyForm = () => ({
  id: null as string | null,
  name: '', company_name: '', org_nr: '', vat_nr: '', email: '', address: '',
  bank_name: '', bank_account: '',
  payer_name: '', payer_org_nr: '', payer_vat_nr: '', payer_address: '', payer_email: '', cc_email: '',
  next_invoice_number: 1,
  commission_tiers: DEFAULT_TIERS.map(t => ({ ...t })) as CommissionTier[],
  standard_deductions: [] as StdDeduction[],
  vat_rate: 25,
  drive_folder_id: '', drive_payer_root_id: '', payer_fiscal_start_month: 9,
  is_active: true,
});

export function ConsultantSettingsDialog({ open, onOpenChange, consultant, onSaved }: Props) {
  const [form, setForm] = useState<any>(emptyForm());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (consultant) {
      setForm({
        ...emptyForm(),
        ...consultant,
        commission_tiers: Array.isArray(consultant.commission_tiers) && consultant.commission_tiers.length
          ? consultant.commission_tiers.map((t: any) => ({ upTo: t.upTo ?? null, pct: Number(t.pct) || 0 }))
          : DEFAULT_TIERS.map(t => ({ ...t })),
        standard_deductions: Array.isArray(consultant.standard_deductions)
          ? consultant.standard_deductions.map((d: any) => ({ label: d.label ?? '', amount: Number(d.amount) || 0, defaultOn: d.defaultOn !== false }))
          : [],
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, consultant]);

  const set = (key: string, value: unknown) => setForm((f: any) => ({ ...f, [key]: value }));
  const setTier = (i: number, patch: Partial<CommissionTier>) =>
    setForm((f: any) => ({ ...f, commission_tiers: f.commission_tiers.map((t: CommissionTier, j: number) => (j === i ? { ...t, ...patch } : t)) }));
  const setDed = (i: number, patch: Partial<StdDeduction>) =>
    setForm((f: any) => ({ ...f, standard_deductions: f.standard_deductions.map((d: StdDeduction, j: number) => (j === i ? { ...d, ...patch } : d)) }));

  const save = async () => {
    if (!form.name.trim() || !form.company_name.trim() || !form.payer_name.trim()) {
      toast.error('Namn, bolag och betalare måste fyllas i');
      return;
    }
    setBusy(true);
    try {
      const row = {
        name: form.name.trim(), company_name: form.company_name.trim(),
        org_nr: form.org_nr || null, vat_nr: form.vat_nr || null, email: form.email || null, address: form.address || null,
        bank_name: form.bank_name || null, bank_account: form.bank_account || null,
        payer_name: form.payer_name.trim(), payer_org_nr: form.payer_org_nr || null, payer_vat_nr: form.payer_vat_nr || null,
        payer_address: form.payer_address || null, payer_email: form.payer_email || null,
        cc_email: String(form.cc_email ?? '').trim() || null,
        next_invoice_number: Number(form.next_invoice_number) || 1,
        commission_tiers: form.commission_tiers,
        standard_deductions: form.standard_deductions,
        vat_rate: Number(form.vat_rate) || 25,
        drive_folder_id: form.drive_folder_id || null, drive_payer_root_id: form.drive_payer_root_id || null,
        payer_fiscal_start_month: Number(form.payer_fiscal_start_month) || 9,
        is_active: Boolean(form.is_active),
      };
      if (form.id) {
        const { error } = await supabase.from('consultants').update(row).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('consultants').insert(row);
        if (error) throw error;
      }
      toast.success(form.id ? 'Inställningarna sparades' : 'Konsulten skapades');
      onOpenChange(false);
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const field = (key: string, label: string, opts: { type?: string; span?: boolean } = {}) => (
    <div className={`space-y-1.5 ${opts.span ? 'sm:col-span-2' : ''}`}>
      <Label>{label}</Label>
      <Input type={opts.type ?? 'text'} value={form[key] ?? ''} onChange={e => set(key, e.target.value)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? `Inställningar – ${form.name}` : 'Ny konsult'}</DialogTitle>
          <DialogDescription>Konsultens uppgifter, betalare, provisionstrappa och standardavdrag.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="grid sm:grid-cols-2 gap-3">
            {field('name', 'Namn')}
            {field('company_name', 'Bolag')}
            {field('org_nr', 'Org.nr')}
            {field('vat_nr', 'Momsnr')}
            {field('email', 'E-post')}
            {field('address', 'Adress')}
            {field('bank_name', 'Bank')}
            {field('bank_account', 'Konto')}
          </section>

          <section>
            <h3 className="font-medium text-sm mb-2">Betalare</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {field('payer_name', 'Namn')}
              {field('payer_org_nr', 'Org.nr')}
              {field('payer_vat_nr', 'Momsnr')}
              {field('payer_email', 'E-post')}
              {field('payer_address', 'Adress', { span: true })}
              {field('cc_email', 'Kopia på utskick (e-post)', { span: true })}
            </div>
          </section>

          <section className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nästa fakturanummer</Label>
              <Input type="number" value={form.next_invoice_number} onChange={e => set('next_invoice_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Moms %</Label>
              <Input type="number" value={form.vat_rate} onChange={e => set('vat_rate', e.target.value)} />
            </div>
            {field('drive_folder_id', 'Drive-mapp-id (Löner)')}
            {field('drive_payer_root_id', 'Betalarens bokföringsrot (Drive-id)')}
            <div className="space-y-1.5">
              <Label>Räkenskapsårets startmånad</Label>
              <Input type="number" min={1} max={12} value={form.payer_fiscal_start_month} onChange={e => set('payer_fiscal_start_month', e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={Boolean(form.is_active)} onCheckedChange={v => set('is_active', v)} id="consultant-active" />
              <Label htmlFor="consultant-active">Aktiv</Label>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-sm">Provisionstrappa</h3>
            {form.commission_tiers.map((t: CommissionTier, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">TB upp till</span>
                <Input
                  type="number" className="w-32" placeholder="Resten"
                  value={t.upTo ?? ''}
                  onChange={e => setTier(i, { upTo: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <span className="text-xs text-muted-foreground">%</span>
                <Input type="number" className="w-20" value={t.pct} onChange={e => setTier(i, { pct: Number(e.target.value) || 0 })} />
                <Button variant="ghost" size="icon" onClick={() => setForm((f: any) => ({ ...f, commission_tiers: f.commission_tiers.filter((_: unknown, j: number) => j !== i) }))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm((f: any) => ({ ...f, commission_tiers: [...f.commission_tiers, { upTo: null, pct: 0 }] }))}>
              <Plus className="h-3.5 w-3.5 mr-1" />Lägg till steg
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-sm">Standardavdrag</h3>
            {form.standard_deductions.map((d: StdDeduction, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="flex-1" placeholder="Etikett" value={d.label} onChange={e => setDed(i, { label: e.target.value })} />
                <Input type="number" className="w-28 text-right" placeholder="Belopp" value={d.amount} onChange={e => setDed(i, { amount: Number(e.target.value) || 0 })} />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  <Checkbox checked={d.defaultOn} onCheckedChange={v => setDed(i, { defaultOn: v === true })} />
                  Förbockad
                </label>
                <Button variant="ghost" size="icon" onClick={() => setForm((f: any) => ({ ...f, standard_deductions: f.standard_deductions.filter((_: unknown, j: number) => j !== i) }))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm((f: any) => ({ ...f, standard_deductions: [...f.standard_deductions, { label: '', amount: 0, defaultOn: true }] }))}>
              <Plus className="h-3.5 w-3.5 mr-1" />Lägg till avdrag
            </Button>
          </section>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {form.id && (
            <Button variant="outline" className="mr-auto" onClick={() => setForm(emptyForm())} disabled={busy}>
              <Plus className="h-3.5 w-3.5 mr-1" />Ny konsult
            </Button>
          )}
          {!form.id && <span className="text-xs text-muted-foreground mr-auto">Ny konsult skapas med de uppgifter du fyllt i.</span>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
