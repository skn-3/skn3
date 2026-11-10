import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createVisit,
  updateVisit,
  createCase,
  createCaseEvent,
} from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { sendKlimatEvent } from '@/lib/klimat';
import { KlimatQrInline } from '@/components/shared/KlimatQrDialog';
import { searchOrders } from '@/integrations/orderGateway';
import { STATUS_LABELS, detectGotland } from '@/lib/constants';
import { GotlandBadge } from '@/components/shared/GotlandBadge';
import {
  buildSignedCaseRecord,
  emptySignedCaseFields,
  isEmailInvalid,
  isValidUnits,
  signedCaseFieldsValid,
  type SignedCaseFieldValues,
} from '@/lib/signedCase';
import { SignedCaseFields } from '@/components/seller/SignedCaseFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, RefreshCcw, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { celebrateSignedDeal } from '@/lib/celebrate';
import { logActivity } from '@/lib/activityLog';
import { useDuplicateCaseGuard } from '@/components/shared/DuplicateCaseGuard';

type Result = 'signerat' | 'aterkoppla' | 'nej';

type AddressSuggestion = {
  source: 'case' | 'order';
  address: string;
  customer_name: string;
  customer_phone: string;
  status?: string;
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
  // Lager 2
  customer_phone: '',
  result: '' as Result | '',
  // Lager 3 — återkoppla / nej
  follow_up_date: '',
  notes: '',
  // Lager 3 — signerat (ärende); fälten delas med SignedCaseDialog
  customer_email: '',
  ...emptySignedCaseFields(),
});

export function VisitForm({ sellerName }: VisitFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  // Affärsförslagsnumret är obligatoriskt vid Signerat; felet visas först när fältet rörts.
  const [offerNumberTouched, setOfferNumberTouched] = useState(false);

  const update = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ===== Adress-autocomplete + dubblettvarning (samma mönster som NewCaseForm) =====
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [existingCase, setExistingCase] = useState<{ address: string; customer_name: string; status: string } | null>(null);
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
          .select('id, address, customer_name, customer_phone, status')
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
          status: c.status,
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
    setExistingCase(
      s.source === 'case' && s.status
        ? { address: s.address, customer_name: s.customer_name, status: s.status }
        : null,
    );
    setShowSuggestions(false);
  };

  // ===== Gotland-detektion (live på ort + adress) =====
  const isGotland = detectGotland(form.city, form.address);

  // Tidig trädclaim: besöks-id genereras i förväg så att claimen (event_ref = besöks-id)
  // återanvänds när besöket sparas — servern deduplicerar och drar av besöksträdet vid signering.
  const [preVisitId, setPreVisitId] = useState<string>(() => crypto.randomUUID());
  const [earlyClaim, setEarlyClaim] = useState<{ url: string; visitId: string } | null>(null);
  const [klimatLoading, setKlimatLoading] = useState(false);
  const claimInFlight = useRef<string | null>(null);

  const unitsNum = form.units === '' ? NaN : Number(form.units);
  const unitsValid = isValidUnits(form.units);

  const wantsClaim =
    form.result === 'aterkoppla' || (form.result === 'signerat' && unitsValid);
  useEffect(() => {
    if (!wantsClaim) return;
    if (earlyClaim?.visitId === preVisitId) return;
    if (claimInFlight.current === preVisitId) return;
    const vid = preVisitId;
    claimInFlight.current = vid;
    setKlimatLoading(true);
    sendKlimatEvent({
      eventType: 'visit',
      visitId: vid,
      treeCount: 1,
      seller: sellerName,
      eventRef: vid,
    })
      .then((res) => {
        if (res?.claim_url) setEarlyClaim({ url: res.claim_url, visitId: vid });
        else claimInFlight.current = null;
      })
      .finally(() => setKlimatLoading(false));
  }, [wantsClaim, preVisitId, earlyClaim, sellerName]);
  const emailInvalid = isEmailInvalid(form.customer_email);
  const baseValid = !!form.date && !!form.customer_name.trim() && !!form.address.trim() && !emailInvalid;
  const canSubmit =
    baseValid &&
    !!form.result &&
    (form.result !== 'aterkoppla' || !!form.follow_up_date) &&
    (form.result !== 'signerat' || signedCaseFieldsValid(form));

  // ===== Spara =====
  const mutation = useMutation({
    mutationFn: async () => {
      // === Återkoppla / Nej: bara skapa visits-raden ===
      if (form.result !== 'signerat') {
        const visit = await createVisit({
          id: preVisitId,
          email: form.customer_email.trim() || null,
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
        // Anonym trädhändelse (besök) — samma event_ref som den tidiga claimen, så inga dubbletter.
        // Nej tack skickar ingen händelse.
        if (form.result === 'aterkoppla' && earlyClaim?.visitId !== preVisitId) {
          await sendKlimatEvent({
            eventType: 'visit',
            visitId: preVisitId,
            treeCount: 1,
            seller: sellerName,
            eventRef: preVisitId,
          });
        }
        return { visit, newCase: null as any };
      }

      // === SIGNERAT: case-first med rollback. Antingen båda eller ingen. ===
      // 1) Skapa ÄRENDET först
      const caseRecord = buildSignedCaseRecord(form, sellerName);
      let newCase: any;
      try {
        newCase = await createCase(caseRecord as any);
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
          id: preVisitId,
          email: form.customer_email.trim() || null,
          date: form.date,
          address: form.address,
          customer_name: form.customer_name,
          seller: sellerName,
          result: 'signerat',
          order_value: null,
          notes: null,
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
        description: `Ärende skapat, tilldelad montör: ${caseRecord.team || 'Ej tilldelad'}`,
        created_by: sellerName,
      });

      // 3b) Återkontakt — kund vill utföra ett annat jobb (blockerar inte sparandet)
      if (form.future_job && form.future_job_description.trim() && form.future_job_date) {
        const { error: fjErr } = await supabase.from('future_jobs').insert({
          case_id: newCase.id,
          customer_name: form.customer_name,
          address: form.address || null,
          phone: form.customer_phone || null,
          seller: sellerName,
          description: form.future_job_description.trim(),
          contact_date: form.future_job_date,
          created_by: sellerName,
        });
        if (fjErr) console.error('future_jobs insert failed:', fjErr);
      }
      // Montörmailet skickas när montage-montör tilldelas i "Komplettera ärendet" (efter KM).

      // Anonyma trädhändelser — besök(1) + signering(enheter − 1; servern drar av besöksträdet och hoppar över vid 0)
      // Besökshändelsen är idempotent på event_ref = besöks-id (redan skickad om QR:en visats).
      await sendKlimatEvent({
        eventType: 'visit',
        caseId: newCase.id,
        visitId: preVisitId,
        treeCount: 1,
        seller: sellerName,
        eventRef: preVisitId,
      });
      await sendKlimatEvent({
        eventType: 'signing',
        caseId: newCase.id,
        visitId: preVisitId,
        treeCount: Math.max(1, Math.floor(Number(form.units) || 1)),
        seller: sellerName,
        eventRef: `signing-${newCase.id}`,
      });

      return { visit, newCase };
    },
    onSuccess: ({ visit, newCase }) => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['climate_events'] });

      if (form.result === 'signerat' && newCase) {
        logActivity({
          action: 'visit_signed_case_created',
          category: 'case',
          description: `Signerat besök + ärende skapat — ${form.address}`,
          case_id: newCase.id,
          metadata: { visit_id: (visit as any)?.id },
        });
        celebrateSignedDeal();
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
      setExistingCase(null);
      setEarlyClaim(null);
      setOfferNumberTouched(false);
      claimInFlight.current = null;
      setPreVisitId(crypto.randomUUID());
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Kunde inte spara');
    },
  });

  const dupGuard = useDuplicateCaseGuard();
  const handleSubmit = () => {
    // Signerat skapar ett ärende: varna först om gata + husnummer redan finns.
    if (form.result === 'signerat') { void dupGuard.guard(form.address, () => mutation.mutate()); return; }
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
          <Label>E-post</Label>
          <Input
            type="email"
            value={form.customer_email}
            onChange={(e) => update('customer_email', e.target.value)}
            aria-invalid={emailInvalid}
          />
          {emailInvalid && (
            <p className="text-xs text-destructive">Ange en giltig e-postadress.</p>
          )}
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
              setExistingCase(null);
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
          {isGotland && (
            <div className="mt-2">
              <GotlandBadge />
            </div>
          )}
          {existingCase && (
            <Alert variant="warning" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Möjlig dubblett</AlertTitle>
              <AlertDescription className="space-y-1">
                <div>
                  {existingCase.address} · {existingCase.customer_name} ·{' '}
                  {STATUS_LABELS[existingCase.status] || existingCase.status}
                </div>
                <div className="text-xs text-muted-foreground">
                  Det går bra att skapa ändå om det är en ny, separat order.
                </div>
              </AlertDescription>
            </Alert>
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
            activeClass="border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:text-amber-400"
          />
          <ResultButton
            value="nej"
            icon={XCircle}
            label="Nej tack"
            activeClass="border-destructive bg-destructive/10 text-destructive"
          />
        </div>
        {showAterkoppla && earlyClaim?.url && (
          <KlimatQrInline claimUrl={earlyClaim.url} treeTotal={1} />
        )}
        {showAterkoppla && !earlyClaim?.url && klimatLoading && (
          <p className="text-xs text-muted-foreground">Planterar träd…</p>
        )}
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

              <SignedCaseFields
                values={form}
                onChange={(key, value) => update(key, value)}
                offerNumberTouched={offerNumberTouched}
                onOfferNumberTouched={() => setOfferNumberTouched(true)}
                afterUnits={
                  <>
                    {unitsValid && earlyClaim?.url && (
                      <KlimatQrInline claimUrl={earlyClaim.url} treeTotal={unitsNum} />
                    )}
                    {unitsValid && !earlyClaim?.url && klimatLoading && (
                      <p className="text-xs text-muted-foreground">Planterar träd…</p>
                    )}
                  </>
                }
              />
            </div>
          )}
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit || mutation.isPending || dupGuard.checking}
        className="w-full sm:w-auto"
      >
        {mutation.isPending
          ? 'Sparar...'
          : showSignerat
            ? 'Spara besök + skapa ärende'
            : 'Spara besök'}
      </Button>

      {dupGuard.dialog}
    </div>
  );
}
