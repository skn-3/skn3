import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createVisit,
  updateVisit,
  createCase,
  createCaseEvent,
  sendNotificationEmail,
} from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { searchOrders } from '@/integrations/orderGateway';
import { MONTORS, EMAIL_MAP, HOUR_RATE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, RefreshCcw, XCircle, AlertTriangle } from 'lucide-react';
import { cn, formatAmount } from '@/lib/utils';
import { toast } from 'sonner';
import { celebrateSignedDeal } from '@/lib/celebrate';
import { logActivity } from '@/lib/activityLog';

type Result = 'signerat' | 'aterkoppla' | 'nej';

type AddressSuggestion = {
  source: 'case' | 'order';
  address: string;
  customer_name: string;
  customer_phone: string;
};

interface VisitFormProps {
  sellerName: string;
  // Behållen för bakåtkompatibilitet — anropas inte längre eftersom ärendet skapas i samma flöde.
  onCreateCase?: (data: { customer_name: string; address: string; order_value?: number; visit_id?: string; date?: string }) => void;
}

const todayStr = () => new Date().toISOString().split('T')[0];

const emptyForm = () => ({
  // Lager 1
  date: todayStr(),
  customer_name: '',
  address: '',
  customer_phone: '',
  // Lager 2
  result: '' as Result | '',
  // Lager 3 — återkoppla / nej
  follow_up_date: '',
  notes: '',
  // Lager 3 — signerat (ärende)
  customer_email: '',
  city: '',
  offer_number: '',
  order_value: '',
  tb_percent: '',
  extra_hours_sold: '0',
  team: '',
  km_team: '',
  google_drive_link: '',
  media_consent: false,
  carry_help_needed: false,
  scheduled_delivery: false,
});

export function VisitForm({ sellerName }: VisitFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm());

  const update = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ===== Adress-autocomplete + dubblettvarning (samma mönster som NewCaseForm) =====
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
          .select('id, address, customer_name, customer_phone')
          .ilike('address', `%${term}%`)
          .limit(5),
        searchOrders(term),
      ]);
      const list: AddressSuggestion[] = [];
      (casesRes.data || []).forEach((c: any) =>
        list.push({
          source: 'case',
          address: c.address,
          customer_name: c.customer_name,
          customer_phone: c.customer_phone || '',
        }),
      );
      (orderRows || []).slice(0, 5).forEach((o: any) =>
        list.push({
          source: 'order',
          address: o.customer_address,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone || '',
        }),
      );
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

  // ===== Validering =====
  const tbNum = form.tb_percent === '' ? null : Number(form.tb_percent);
  const tbInvalid = tbNum != null && (isNaN(tbNum) || tbNum < 0 || tbNum > 100);
  const ovNum = form.order_value === '' ? 0 : Number(form.order_value);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const baseValid = !!form.date && !!form.customer_name.trim() && !!form.address.trim();
  const canSubmit =
    baseValid &&
    !!form.result &&
    (form.result !== 'aterkoppla' || !!form.follow_up_date) &&
    (form.result !== 'signerat' || (!!form.customer_phone.trim() && !!form.city.trim() && !tbInvalid));

  // ===== Spara =====
  const mutation = useMutation({
    mutationFn: async () => {
      // === Återkoppla / Nej: bara skapa visits-raden ===
      if (form.result !== 'signerat') {
        const visit = await createVisit({
          date: form.date,
          address: form.address,
          customer_name: form.customer_name,
          seller: sellerName,
          result: form.result || 'aterkoppla',
          order_value: null,
          follow_up_date:
            form.result === 'aterkoppla' && form.follow_up_date ? form.follow_up_date : null,
          notes: form.notes || null,
        } as any);
        return { visit, newCase: null as any };
      }

      // === SIGNERAT: case-first med rollback. Antingen båda eller ingen. ===
      // 1) Skapa ÄRENDET först
      let newCase: any;
      try {
        newCase = await createCase({
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
      } catch (caseErr: any) {
        logActivity({
          action: 'visit_signed_case_failed',
          category: 'case',
          description: `Kunde inte skapa ärende från signerat besök — ${form.address}`,
          metadata: { stage: 'create_case', error: caseErr?.message || String(caseErr), address: form.address },
        });
        throw new Error(`Kunde inte skapa ärende — försök igen. (${caseErr?.message || caseErr})`);
      }

      // 2) Skapa visits-raden MED case_id direkt
      let visit: any;
      try {
        visit = await createVisit({
          date: form.date,
          address: form.address,
          customer_name: form.customer_name,
          seller: sellerName,
          result: 'signerat',
          order_value: form.order_value ? Number(form.order_value) : null,
          notes: form.notes || null,
          case_id: newCase.id,
        } as any);
      } catch (visitErr: any) {
        // Rollback: radera ärendet vi precis skapade
        try {
          const { deleteCase } = await import('@/lib/supabaseClient');
          await deleteCase(newCase.id);
        } catch (rollbackErr) {
          console.error('Rollback (deleteCase) failed:', rollbackErr);
        }
        logActivity({
          action: 'visit_signed_case_failed',
          category: 'case',
          description: `Kunde inte skapa besök efter ärendeskapande — rollback gjord. ${form.address}`,
          metadata: { stage: 'create_visit', error: visitErr?.message || String(visitErr), rolled_back_case_id: newCase.id },
        });
        throw new Error(`Kunde inte spara besöket — ärendet har rullats tillbaka. Försök igen. (${visitErr?.message || visitErr})`);
      }

      // 3) Logg-event på ärendet
      await createCaseEvent({
        case_id: newCase.id,
        event_type: 'status_change',
        description: `Ärende skapat, tilldelad montör: ${form.team || 'Ej tilldelad'}`,
        created_by: sellerName,
      });

      // 4) Montörmail
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

      return { visit, newCase };
    },
    onSuccess: ({ visit, newCase }) => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });

      if (form.result === 'signerat' && newCase) {
        logActivity({
          action: 'visit_signed_case_created',
          category: 'case',
          description: `Signerat besök + ärende skapat — ${form.address}`,
          case_id: newCase.id,
          metadata: { visit_id: (visit as any)?.id, order_value: form.order_value || null },
        });
        const ov = form.order_value ? Number(form.order_value) : undefined;
        celebrateSignedDeal(ov);
        toast.success('Besök + ärende skapat!');
      } else {
        logActivity({
          action: 'visit_registered',
          category: 'case',
          description: `Besök registrerat — ${form.address} (${form.result})`,
          metadata: { visit_id: (visit as any)?.id, result: form.result },
        });
        if (form.result === 'aterkoppla') {
          toast.success('Besök registrerat — uppföljning bokad');
        } else {
          toast.success('Besök registrerat');
        }
      }

      setForm(emptyForm());
      setExistingCaseWarning(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Kunde inte spara');
    },
  });

  const handleSubmit = () => {
    if (form.result === 'signerat' && ovNum > 500_000) {
      setConfirmOpen(true);
      return;
    }
    mutation.mutate();
  };

  // ===== UI =====
  const ResultButton = ({
    value,
    icon: Icon,
    label,
    activeClass,
  }: {
    value: Result;
    icon: typeof CheckCircle2;
    label: string;
    activeClass: string;
  }) => {
    const active = form.result === value;
    return (
      <button
        type="button"
        onClick={() => update('result', value)}
        className={cn(
          'flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 text-sm font-semibold transition-all',
          'motion-reduce:transition-none',
          active
            ? activeClass
            : 'border-border bg-card text-muted-foreground hover:bg-muted',
        )}
        aria-pressed={active}
      >
        <Icon className="h-4 w-4" />
        {label}
      </button>
    );
  };

  const showSignerat = form.result === 'signerat';
  const showAterkoppla = form.result === 'aterkoppla';
  const showNej = form.result === 'nej';

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 md:px-0">
      <div>
        <h2 className="text-xl font-bold text-foreground">Registrera besök</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Allt börjar som ett besök. Välj <strong>Signerat</strong> för att skapa ärendet i samma steg.
        </p>
      </div>

      {/* LAGER 1 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Besöksdatum *</Label>
          <Input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Säljare</Label>
          <Input value={sellerName} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Kundnamn *</Label>
          <Input
            value={form.customer_name}
            onChange={(e) => update('customer_name', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Telefon{showSignerat ? ' *' : ''}</Label>
          <Input
            value={form.customer_phone}
            onChange={(e) => update('customer_phone', e.target.value)}
          />
        </div>
        <div className="space-y-1.5 relative sm:col-span-2" ref={addressWrapperRef}>
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
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
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
                    <Badge className="bg-teal-500 hover:bg-teal-500/90 text-white shrink-0">
                      Ärende
                    </Badge>
                  ) : (
                    <Badge className="bg-orange-500 hover:bg-orange-500/90 text-white shrink-0">
                      Order
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          {existingCaseWarning && (
            <p className="text-xs text-destructive">Det finns redan ett ärende på denna adress</p>
          )}
        </div>
      </div>

      {/* LAGER 2 — Resultat */}
      <div className="space-y-2">
        <Label>Resultat *</Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <ResultButton
            value="signerat"
            icon={CheckCircle2}
            label="Signerat"
            activeClass="border-primary bg-primary/10 text-primary"
          />
          <ResultButton
            value="aterkoppla"
            icon={RefreshCcw}
            label="Återkoppla"
            activeClass="border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          />
          <ResultButton
            value="nej"
            icon={XCircle}
            label="Nej tack"
            activeClass="border-destructive bg-destructive/10 text-destructive"
          />
        </div>
      </div>

      {/* LAGER 3 — expanderbar */}
      <div
        data-open={showSignerat || showAterkoppla || showNej}
        className="grid grid-rows-[0fr] data-[open=true]:grid-rows-[1fr] transition-[grid-template-rows] duration-300 motion-reduce:transition-none"
      >
        <div className="overflow-hidden">
          {showAterkoppla && (
            <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Återkoppla datum *</Label>
                  <Input
                    type="date"
                    value={form.follow_up_date}
                    onChange={(e) => update('follow_up_date', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Anteckning</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          {showNej && (
            <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-4 space-y-4">
              <div className="space-y-1.5">
                <Label>Anledning / anteckning</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  rows={3}
                  placeholder="Varför blev det nej? (valfritt)"
                />
              </div>
            </div>
          )}

          {showSignerat && (
            <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Ärenderegistrering upplåst
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>E-post</Label>
                  <Input
                    value={form.customer_email}
                    onChange={(e) => update('customer_email', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Ort *</Label>
                  <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Offertnummer (Mockfjärds)</Label>
                  <Input
                    value={form.offer_number}
                    onChange={(e) => update('offer_number', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Ordervärde (kr){' '}
                    <span className="text-muted-foreground text-xs ml-1">ex moms</span>
                  </Label>
                  <Input
                    type="number"
                    value={form.order_value}
                    onChange={(e) => update('order_value', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>TB (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.tb_percent}
                    onChange={(e) => update('tb_percent', e.target.value)}
                  />
                  {tbInvalid && (
                    <p className="text-xs text-destructive">
                      TB% måste vara mellan 0 och 100. Skrev du 160 istället för 16?
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Extra timmar sålda till kund (á {HOUR_RATE} kr/st)</Label>
                  <Input
                    type="number"
                    value={form.extra_hours_sold}
                    onChange={(e) => update('extra_hours_sold', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>KM-montör (valfritt)</Label>
                  <Select
                    value={form.km_team || '__none__'}
                    onValueChange={(v) => update('km_team', v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ingen vald" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Ingen vald —</SelectItem>
                      {MONTORS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Montage-montör (valfritt)</Label>
                  <Select
                    value={form.team || '__none__'}
                    onValueChange={(v) => update('team', v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ingen vald" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Ingen vald —</SelectItem>
                      {MONTORS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Google Drive-länk</Label>
                  <Input
                    value={form.google_drive_link}
                    onChange={(e) => update('google_drive_link', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Anteckning</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2 rounded-lg border bg-card/60 p-3">
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
                    <span className="text-xs text-muted-foreground pl-6">
                      Tiden anges senare, veckan innan leverans
                    </span>
                  )}
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit || mutation.isPending}
        className="w-full sm:w-auto"
      >
        {mutation.isPending
          ? 'Sparar...'
          : showSignerat
            ? 'Spara besök + skapa ärende'
            : 'Spara besök'}
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
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                mutation.mutate();
              }}
            >
              Ja, värdet stämmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
