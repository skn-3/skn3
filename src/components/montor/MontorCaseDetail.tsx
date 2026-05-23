import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCaseEvents, fetchDeviations, fetchCaseById, fetchCaseCosts, createCaseCost, uploadReceiptImage, updateCase, createCaseEvent, createDeviation, uploadDeviationImages, updateDeviation, sendNotificationEmail } from '@/lib/supabaseClient';
import type { CaseRow } from '@/lib/supabaseClient';
import { STATUS_LABELS, DEVIATION_TYPES, DEVIATION_RESPONSIBLE, COORDINATOR_EMAIL, COORDINATOR_CC, EMAIL_MAP } from '@/lib/constants';
import { canEnterStatus } from '@/lib/statusRules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Phone, AlertTriangle, Clock, Camera, CheckCircle2, X, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SheetMetalOrdersSection } from '@/components/sheet-metal/SheetMetalOrdersSection';

interface Props {
  caseData: CaseRow;
  currentUser: string;
  hasUnresolvedDeviation: boolean;
  onBack: () => void;
}

export function MontorCaseDetail({ caseData: initialCaseData, currentUser, onBack }: Props) {
  const queryClient = useQueryClient();

  const { data: liveCaseData } = useQuery({
    queryKey: ['case', initialCaseData.id],
    queryFn: () => fetchCaseById(initialCaseData.id),
    initialData: initialCaseData,
  });
  const caseData = liveCaseData ?? initialCaseData;

  const [showProblem, setShowProblem] = useState(false);
  const [showKlar, setShowKlar] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [klarComment, setKlarComment] = useState('');
  const [kmDate, setKmDate] = useState('');
  const [extraHoursReq, setExtraHoursReq] = useState('0');
  const [kmNote, setKmNote] = useState('');
  const [note, setNote] = useState('');
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);

  // Problem form state (unified)
  const [probType, setProbType] = useState('');
  const [probDesc, setProbDesc] = useState('');
  const [probPriority, setProbPriority] = useState<'hog' | 'medium' | 'lag'>('medium');
  const [probResponsible, setProbResponsible] = useState('');
  const [respManuallySet, setRespManuallySet] = useState(false);

  useEffect(() => {
    if (respManuallySet) return;
    const suggestion: Record<string, string> = {
      felmatning: 'montor',
      fabriksfel: 'fabrik',
      extra_material: 'fabrik',
    };
    const s = suggestion[probType];
    if (s && probResponsible !== s) setProbResponsible(s);
  }, [probType, respManuallySet]);
  const [probFiles, setProbFiles] = useState<File[]>([]);
  const [probCost, setProbCost] = useState('');

  // Cost form state
  const [costDesc, setCostDesc] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costFile, setCostFile] = useState<File | null>(null);

  const { data: events } = useQuery({
    queryKey: ['case_events', caseData.id],
    queryFn: () => fetchCaseEvents(caseData.id),
  });

  const { data: deviations } = useQuery({
    queryKey: ['deviations', caseData.id],
    queryFn: () => fetchDeviations(caseData.id),
  });

  const { data: costs } = useQuery({
    queryKey: ['case_costs', caseData.id],
    queryFn: () => fetchCaseCosts(caseData.id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['case', initialCaseData.id] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['case_events', caseData.id] });
    queryClient.invalidateQueries({ queryKey: ['deviations', caseData.id] });
    queryClient.invalidateQueries({ queryKey: ['deviations_bulk'] });
    queryClient.invalidateQueries({ queryKey: ['case_costs', caseData.id] });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, setter: (files: File[]) => void, current: File[]) => {
    const files = Array.from(e.target.files || []);
    const allowed = files.filter(f => /\.(jpe?g|png|heic)$/i.test(f.name));
    const combined = [...current, ...allowed].slice(0, 5);
    setter(combined);
    e.target.value = '';
  };

  const removeFile = (index: number, setter: (files: File[]) => void, current: File[]) => {
    setter(current.filter((_, i) => i !== index));
  };

  const buildProblemRows = (type: string, desc: string, priority?: string) => {
    const rows: Array<{ label: string; value: string; badge?: { color: string; bg: string } }> = [
      { label: 'Adress', value: caseData.address },
      { label: 'Kund', value: caseData.customer_name },
      { label: 'Montör', value: currentUser },
      { label: 'Typ', value: type },
    ];
    if (priority) {
      const badgeMap: Record<string, { color: string; bg: string }> = {
        hog: { color: '#991B1B', bg: '#FEE2E2' },
        medium: { color: '#92400E', bg: '#FEF3C7' },
        lag: { color: '#374151', bg: '#F3F4F6' },
      };
      const label = priority === 'hog' ? 'Hög' : priority === 'medium' ? 'Medium' : 'Låg';
      rows.push({ label: 'Prioritet', value: label, badge: badgeMap[priority] });
    }
    rows.push({ label: 'Beskrivning', value: desc });
    return rows;
  };

  // Unified problem mutation (replaces separate reklamation + deviation)
  const problemMutation = useMutation({
    mutationFn: async () => {
      const isReklam = probType === 'reklamation';
      const descWithPriority = isReklam ? `[${probPriority.toUpperCase()}] ${probDesc}` : probDesc;

      if (!probResponsible) {
        throw new Error('Välj ansvarig innan du sparar');
      }
      const deviation = await createDeviation({
        case_id: caseData.id,
        type: probType,
        description: descWithPriority,
        responsible: probResponsible,
        created_by: currentUser,
      });

      if (probCost && Number(probCost) > 0) {
        await updateDeviation(deviation.id, { cost: Number(probCost) });
      }

      let imageUrls: string[] = [];
      if (probFiles.length > 0) {
        imageUrls = await uploadDeviationImages(caseData.id, deviation.id, probFiles);
        await updateDeviation(deviation.id, { image_urls: imageUrls });
      }

      const typLabel = DEVIATION_TYPES.find(d => d.value === probType)?.label || probType;
      const eventDesc = isReklam
        ? `Reklamation skapad: ${probDesc}`
        : `Avvikelse skapad: ${typLabel} — ${probDesc}`;

      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'deviation',
        description: eventDesc,
        created_by: currentUser,
      });

      if (isReklam) {
        await updateCase(caseData.id, { status: 'pausad' });
        await createCaseEvent({
          case_id: caseData.id,
          event_type: 'status_change',
          description: 'Status ändrad till Pausad (reklamation)',
          created_by: currentUser,
        });
      }

      // Send notification email
      try {
        const rows = buildProblemRows(typLabel, probDesc, isReklam ? probPriority : undefined);
        if (imageUrls.length > 0) {
          rows.push({ label: 'Bilder', value: `${imageUrls.length} bild(er) bifogade` });
        }
        await sendNotificationEmail({
          to: COORDINATOR_EMAIL,
          cc: COORDINATOR_CC,
          subject: `${isReklam ? 'NY REKLAMATION' : 'NY AVVIKELSE'} — ${caseData.address}`,
          heading: isReklam ? 'Ny reklamation' : 'Ny avvikelse',
          rows,
          callToAction: 'Vänligen granska ärendet.',
        });
        await createCaseEvent({
          case_id: caseData.id,
          event_type: 'notification',
          description: `Mail skickat till ${COORDINATOR_EMAIL} (${isReklam ? 'reklamation' : 'avvikelse'})`,
          created_by: currentUser,
        });
      } catch (emailErr) {
        console.error('Email notification failed:', emailErr);
      }
    },
    onSuccess: () => {
      setShowProblem(false);
      setProbType('');
      setProbDesc('');
      setProbPriority('medium');
      setProbResponsible('');
      setProbFiles([]);
      setProbCost('');
      invalidate();
      toast.success('Problem rapporterat');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const klarMutation = useMutation({
    mutationFn: async () => {
      const check = canEnterStatus('montage_klart', caseData);
      if (!check.ok) throw new Error(check.reason || 'Förutsättning saknas');
      await updateCase(caseData.id, { status: 'montage_klart' });
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'status_change',
        description: klarComment ? `Montage klart. ${klarComment}` : 'Montage klart.',
        created_by: currentUser,
      });
      try {
        await sendNotificationEmail({
          to: COORDINATOR_EMAIL,
          subject: `MONTAGE KLART — ${caseData.address}`,
          body: `
            <h2>Montage klart</h2>
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:4px 8px;font-weight:bold">Adress:</td><td style="padding:4px 8px">${caseData.address}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Kund:</td><td style="padding:4px 8px">${caseData.customer_name}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Montör:</td><td style="padding:4px 8px">${currentUser}</td></tr>
              ${klarComment ? `<tr><td style="padding:4px 8px;font-weight:bold">Kommentar:</td><td style="padding:4px 8px">${klarComment}</td></tr>` : ''}
            </table>
          `,
        });
        await createCaseEvent({
          case_id: caseData.id,
          event_type: 'notification',
          description: `Mail skickat till ${COORDINATOR_EMAIL} (montage klart)`,
          created_by: currentUser,
        });
      } catch (emailErr) {
        console.error('Email notification failed:', emailErr);
      }
    },
    onSuccess: () => {
      setShowKlar(false);
      invalidate();
      toast.success('Montage markerat som klart');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const kmBookMutation = useMutation({
    mutationFn: async () => {
      await updateCase(caseData.id, { status: 'km_bokad', km_date: kmDate });
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'status_change',
        description: `KM bokad: ${kmDate}`,
        created_by: currentUser,
      });
    },
    onSuccess: () => { invalidate(); toast.success('KM bokad'); },
  });

  const kmReportMutation = useMutation({
    mutationFn: async () => {
      const hrs = Number(extraHoursReq);
      const newStatus = hrs > 0 ? 'vantar_godkannande' : 'km_klar';
      await updateCase(caseData.id, { status: newStatus, extra_hours_requested: hrs });
      await createCaseEvent({
        case_id: caseData.id,
        event_type: hrs > 0 ? 'hours_request' : 'km_report',
        description: hrs > 0 ? `KM klar. Extra timmar begärda: ${hrs}` : `KM klar. Inga extra timmar.${kmNote ? ' ' + kmNote : ''}`,
        created_by: currentUser,
      });
      try {
        const sellerEmail = EMAIL_MAP[caseData.seller];
        if (sellerEmail) {
          await sendNotificationEmail({
            to: sellerEmail,
            subject: `KM KLAR — ${caseData.address}`,
            body: `
              <h2>Kontrollmätning klar</h2>
              <table style="border-collapse:collapse;width:100%">
                <tr><td style="padding:4px 8px;font-weight:bold">Adress:</td><td style="padding:4px 8px">${caseData.address}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Kund:</td><td style="padding:4px 8px">${caseData.customer_name}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Montör:</td><td style="padding:4px 8px">${currentUser}</td></tr>
                ${hrs > 0 ? `<tr><td style="padding:4px 8px;font-weight:bold;color:red">Extra timmar begärda:</td><td style="padding:4px 8px;color:red;font-weight:bold">${hrs} st</td></tr>` : ''}
                ${kmNote ? `<tr><td style="padding:4px 8px;font-weight:bold">Anteckning:</td><td style="padding:4px 8px">${kmNote}</td></tr>` : ''}
              </table>
            `,
          });
          await createCaseEvent({
            case_id: caseData.id,
            event_type: 'notification',
            description: `Mail skickat till ${sellerEmail} (KM klar)`,
            created_by: currentUser,
          });
        }
      } catch (emailErr) {
        console.error('Email notification failed:', emailErr);
      }
    },
    onSuccess: () => { invalidate(); toast.success('KM rapporterad'); },
  });

  const costMutation = useMutation({
    mutationFn: async () => {
      const cost = await createCaseCost({
        case_id: caseData.id,
        description: costDesc,
        amount: Number(costAmount),
        created_by: currentUser,
      });
      if (costFile) {
        const url = await uploadReceiptImage(caseData.id, cost.id, costFile);
        // Update the cost with receipt URL - use supabase directly
        const { supabase } = await import('@/integrations/supabase/client');
        await supabase.from('case_costs').update({ receipt_url: url }).eq('id', cost.id);
      }
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'cost',
        description: `Kostnad tillagd: ${costDesc} — ${Number(costAmount).toLocaleString('sv-SE')} kr`,
        created_by: currentUser,
      });
    },
    onSuccess: () => {
      setShowCost(false);
      setCostDesc('');
      setCostAmount('');
      setCostFile(null);
      invalidate();
      toast.success('Kostnad sparad');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveMutation = useMutation({
    mutationFn: async (deviation: any) => {
      await updateDeviation(deviation.id, { resolved: true });
      const typLabel = DEVIATION_TYPES.find(d => d.value === deviation.type)?.label || deviation.type;
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'deviation_resolved',
        description: `Avvikelse löst: ${typLabel} — ${deviation.description.substring(0, 60)}`,
        created_by: currentUser,
      });
    },
    onSuccess: () => { invalidate(); toast.success('Avvikelse markerad som löst'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteMutation = useMutation({
    mutationFn: () =>
      createCaseEvent({
        case_id: caseData.id,
        event_type: 'note',
        description: `Anteckning: ${note}`,
        created_by: currentUser,
      }),
    onSuccess: () => { setNote(''); invalidate(); toast.success('Anteckning sparad'); },
  });

  const FileThumbnails = ({ files, setter }: { files: File[]; setter: (f: File[]) => void }) => (
    files.length > 0 ? (
      <div className="flex gap-2 flex-wrap mt-2">
        {files.map((f, i) => (
          <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
            <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => removeFile(i, setter, files)}
              className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-lg p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    ) : null
  );

  const totalCosts = (costs || []).reduce((sum, c) => sum + Number(c.amount), 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-muted min-w-[48px] min-h-[48px] flex items-center justify-center">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-card-foreground truncate">{caseData.address}</h1>
          <Badge variant="secondary" className="mt-0.5">{STATUS_LABELS[caseData.status] || caseData.status}</Badge>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 pb-32">
        {/* Customer info */}
        <section className="py-4 space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Kundinformation</h3>
          <div className="text-sm space-y-1">
            <div className="font-medium">{caseData.customer_name}</div>
            <div className="flex items-center gap-2">
              <a href={`tel:${caseData.customer_phone}`} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm font-medium min-h-[48px]">
                <Phone className="h-4 w-4" />
                {caseData.customer_phone}
              </a>
            </div>
            {caseData.customer_email && <div className="text-muted-foreground">{caseData.customer_email}</div>}
            <div className="text-muted-foreground">{caseData.address}</div>
          </div>
          {((caseData as any).media_consent || (caseData as any).carry_help_needed || (caseData as any).scheduled_delivery) && (
            <div className="flex flex-wrap gap-2 pt-2">
              {(caseData as any).media_consent && (
                <Badge variant="secondary">📷 Foto/film överenskommet</Badge>
              )}
              {(caseData as any).carry_help_needed && (
                <Badge className="bg-amber-500 hover:bg-amber-500/90 text-white">⚠ Bärhjälp behövs</Badge>
              )}
              {(caseData as any).scheduled_delivery && (
                <Badge className="bg-orange-500 hover:bg-orange-500/90 text-white">🕐 Tidsstyrd leverans</Badge>
              )}
            </div>
          )}
        </section>

        {/* Montage klart button */}
        {caseData.status === 'montage_bokat' && (
          <Button
            onClick={() => setShowKlar(true)}
            className="w-full min-h-[56px] text-lg font-semibold mb-4 bg-primary hover:bg-primary/90"
            size="lg"
            disabled={klarMutation.isPending}
          >
            <CheckCircle2 className="h-6 w-6 mr-2" />
            Montage klart
          </Button>
        )}

        {/* Status actions */}
        <section className="py-4 space-y-3 border-t">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Åtgärder</h3>

          {caseData.status === 'vantar_km' && (
            <div className="space-y-2">
              <Label>Boka KM-datum</Label>
              <Input type="date" value={kmDate} onChange={(e) => setKmDate(e.target.value)} className="min-h-[48px]" />
              <Button disabled={!kmDate || kmBookMutation.isPending} onClick={() => kmBookMutation.mutate()} className="min-h-[48px] w-full">
                {kmBookMutation.isPending ? 'Sparar...' : 'Boka kontrollmätning'}
              </Button>
            </div>
          )}

          {caseData.status === 'km_bokad' && (
            <div className="space-y-2">
              <Label>Extra timmar begärda</Label>
              <Input type="number" value={extraHoursReq} onChange={(e) => setExtraHoursReq(e.target.value)} className="min-h-[48px]" />
              <p className="text-xs text-muted-foreground">Varje extra timme kostar 469 kr. Ange bara timmar som verkligen behövs utöver det som ingår.</p>
              <Label>Anteckning</Label>
              <Textarea value={kmNote} onChange={(e) => setKmNote(e.target.value)} rows={2} />
              <Button disabled={kmReportMutation.isPending} onClick={() => kmReportMutation.mutate()} className="min-h-[48px] w-full">
                {kmReportMutation.isPending ? 'Sparar...' : 'Rapportera KM klar'}
              </Button>
            </div>
          )}

          {/* Extra hours status for montör */}
          {caseData.extra_hours_requested > 0 && caseData.status !== 'km_bokad' && (
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-sm"><span className="text-muted-foreground">Extra timmar begärda:</span> <span className="font-medium">{caseData.extra_hours_requested} st</span></p>
              <p className="text-sm">
                <span className="text-muted-foreground">Status:</span>{' '}
                {caseData.extra_hours_approved > 0 ? (
                  <span className="font-medium text-green-600">Godkända ({caseData.extra_hours_approved} st)</span>
                ) : caseData.status === 'vantar_godkannande' ? (
                  <span className="font-medium" style={{ color: '#D97706' }}>Väntar på godkännande</span>
                ) : (
                  <span className="font-medium text-muted-foreground">Avslagna</span>
                )}
              </p>
            </div>
          )}

          {/* Single "Rapportera problem" button */}
          <Button
            variant="outline"
            className="w-full min-h-[48px] border-orange-400 text-orange-700 hover:bg-orange-50"
            onClick={() => setShowProblem(true)}
          >
            <AlertTriangle className="h-4 w-4 mr-1" /> Rapportera problem
          </Button>

          {/* Cost button */}
          <Button
            variant="outline"
            className="w-full min-h-[48px]"
            onClick={() => setShowCost(true)}
          >
            <Receipt className="h-4 w-4 mr-1" /> Lägg till kostnad
          </Button>

          <SheetMetalOrdersSection caseId={caseData.id} variant="mobile" />
        </section>

        {/* Notes */}
        <section className="py-4 border-t space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Anteckning</h3>
          <div className="flex gap-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="flex-1" placeholder="Skriv en anteckning..." />
            <Button className="min-h-[48px]" disabled={!note || noteMutation.isPending} onClick={() => noteMutation.mutate()}>{noteMutation.isPending ? 'Sparar...' : 'Spara'}</Button>
          </div>
        </section>

        {/* Costs */}
        {costs && costs.length > 0 && (
          <section className="py-4 border-t space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Receipt className="h-4 w-4" /> Kostnader ({costs.length})
            </h3>
            {costs.map(c => (
              <div key={c.id} className="rounded-lg border p-3 text-sm flex justify-between items-start">
                <div>
                  <div className="font-medium text-card-foreground">{c.description}</div>
                  <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString('sv-SE')} — {c.created_by}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{Number(c.amount).toLocaleString('sv-SE')} kr</span>
                  {c.receipt_url && (
                    <button onClick={() => setFullscreenImg(c.receipt_url)} className="w-10 h-10 rounded border overflow-hidden hover:ring-2 ring-primary">
                      <img src={c.receipt_url} alt="Kvitto" className="w-full h-full object-cover" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="text-right font-semibold text-sm text-card-foreground">
              Totalt: {totalCosts.toLocaleString('sv-SE')} kr
            </div>
          </section>
        )}

        {/* Deviations */}
        {deviations && deviations.length > 0 && (
          <section className="py-4 border-t space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Avvikelser / Reklamationer ({deviations.length})
            </h3>
            {deviations.map(d => (
              <div key={d.id} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex justify-between items-center">
                  <div className="flex gap-1.5 items-center">
                    <Badge variant={d.resolved ? 'secondary' : 'destructive'}>
                      {DEVIATION_TYPES.find(dt => dt.value === d.type)?.label || d.type}
                    </Badge>
                    <Badge variant={d.resolved ? 'secondary' : 'destructive'} className={d.resolved ? 'bg-green-100 text-green-800 border-green-300' : ''}>
                      {d.resolved ? 'Löst' : 'Olöst'}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString('sv-SE')}</span>
                </div>
                <p className="text-card-foreground">{d.description}</p>
                <p className="text-muted-foreground text-xs">
                  Ansvar: {DEVIATION_RESPONSIBLE.find(r => r.value === d.responsible)?.label || d.responsible} — {d.created_by}
                </p>
                {(d as any).cost > 0 && (
                  <p className="text-sm font-medium text-destructive">Kostnad: {Number((d as any).cost).toLocaleString('sv-SE')} kr</p>
                )}
                {d.image_urls && (d.image_urls as string[]).length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {(d.image_urls as string[]).map((url, i) => (
                      <button key={i} onClick={() => setFullscreenImg(url)} className="w-16 h-16 rounded-lg overflow-hidden border hover:ring-2 ring-primary">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {!d.resolved && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 text-green-700 border-green-400 hover:bg-green-50"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate(d)}
                  >
                    {resolveMutation.isPending ? 'Sparar...' : '✓ Markera löst'}
                  </Button>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Event log */}
        <section className="py-4 border-t space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Clock className="h-4 w-4" /> Historik
          </h3>
          <div className="space-y-2">
            {events?.map(e => (
              <div key={e.id} className="flex gap-2 text-sm">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <div>
                  <span className="text-card-foreground">{e.description}</span>
                  <span className="text-muted-foreground ml-1">— {e.created_by}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom sheet: Rapportera problem */}
      <Drawer open={showProblem} onOpenChange={setShowProblem}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Rapportera problem</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-4 pb-2 max-h-[60vh] overflow-y-auto">
            <div>
              <Label className="mb-1 block">Typ *</Label>
              <Select value={probType} onValueChange={setProbType}>
                <SelectTrigger className="min-h-[48px]"><SelectValue placeholder="Välj typ" /></SelectTrigger>
                <SelectContent>
                  {DEVIATION_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Problembeskrivning *</Label>
              <Textarea value={probDesc} onChange={e => setProbDesc(e.target.value)} rows={3} placeholder="Beskriv problemet..." />
            </div>
            <div>
              <Label className="mb-2 block">Prioritet</Label>
              <div className="flex gap-2">
                {(['hog', 'medium', 'lag'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setProbPriority(p)}
                    className={`flex-1 py-3 rounded-lg border text-sm font-medium min-h-[48px] transition-colors ${
                      probPriority === p
                        ? p === 'hog' ? 'bg-red-100 border-red-400 text-red-800'
                          : p === 'medium' ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
                          : 'bg-green-100 border-green-400 text-green-800'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {p === 'hog' ? 'Hög' : p === 'medium' ? 'Medium' : 'Låg'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1 block">Ansvar</Label>
              <Select value={probResponsible} onValueChange={setProbResponsible}>
                <SelectTrigger className="min-h-[48px]"><SelectValue placeholder="Välj ansvarig" /></SelectTrigger>
                <SelectContent>
                  {DEVIATION_RESPONSIBLE.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Kostnad (kr)</Label>
              <Input type="number" value={probCost} onChange={e => setProbCost(e.target.value)} placeholder="0" className="min-h-[48px]" />
            </div>
            <div>
              <Label className="mb-1 block">Bifoga bilder (1–5 st)</Label>
              <label className="inline-flex items-center gap-2 px-4 py-3 border rounded-lg cursor-pointer hover:bg-muted min-h-[48px] w-full justify-center">
                <Camera className="h-5 w-5" />
                <span>{probFiles.length > 0 ? `${probFiles.length} bild(er) valda` : 'Välj bilder...'}</span>
                <input type="file" accept="image/jpeg,image/png,image/heic" multiple className="hidden" onChange={(e) => handleFileSelect(e, setProbFiles, probFiles)} />
              </label>
              <FileThumbnails files={probFiles} setter={setProbFiles} />
            </div>
          </div>
          <DrawerFooter>
            <Button
              className="min-h-[48px]"
              disabled={!probType || !probDesc.trim() || problemMutation.isPending}
              onClick={() => problemMutation.mutate()}
            >
              {problemMutation.isPending ? 'Sparar...' : 'Skapa ärende'}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="min-h-[48px]">Avbryt</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bottom sheet: Lägg till kostnad */}
      <Drawer open={showCost} onOpenChange={setShowCost}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Lägg till kostnad</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-4 pb-2">
            <div>
              <Label className="mb-1 block">Beskrivning *</Label>
              <Input value={costDesc} onChange={e => setCostDesc(e.target.value)} placeholder="t.ex. Inköp skruv Byggmax" className="min-h-[48px]" />
            </div>
            <div>
              <Label className="mb-1 block">Belopp (kr) *</Label>
              <Input type="number" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0" className="min-h-[48px]" />
            </div>
            <div>
              <Label className="mb-1 block">Kvittobild (valfritt)</Label>
              <label className="inline-flex items-center gap-2 px-4 py-3 border rounded-lg cursor-pointer hover:bg-muted min-h-[48px] w-full justify-center">
                <Camera className="h-5 w-5" />
                <span>{costFile ? costFile.name : 'Välj bild...'}</span>
                <input type="file" accept="image/jpeg,image/png,image/heic" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && /\.(jpe?g|png|heic)$/i.test(f.name)) setCostFile(f);
                  e.target.value = '';
                }} />
              </label>
              {costFile && (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border mt-2">
                  <img src={URL.createObjectURL(costFile)} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setCostFile(null)} className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-lg p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <DrawerFooter>
            <Button
              className="min-h-[48px]"
              disabled={!costDesc.trim() || !costAmount || costMutation.isPending}
              onClick={() => costMutation.mutate()}
            >
              {costMutation.isPending ? 'Sparar...' : 'Spara kostnad'}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="min-h-[48px]">Avbryt</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bottom sheet: Montage klart */}
      <Drawer open={showKlar} onOpenChange={setShowKlar}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Bekräfta montage klart</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-2">
            <Label>Slutkommentar (valfri)</Label>
            <Textarea value={klarComment} onChange={e => setKlarComment(e.target.value)} rows={3} placeholder="Eventuell kommentar..." />
          </div>
          <DrawerFooter>
            <Button className="min-h-[48px] bg-primary" disabled={klarMutation.isPending} onClick={() => klarMutation.mutate()}>
              {klarMutation.isPending ? 'Sparar...' : <><CheckCircle2 className="h-5 w-5 mr-2" /> Bekräfta klar</>}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="min-h-[48px]">Avbryt</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Fullscreen image dialog */}
      <Dialog open={!!fullscreenImg} onOpenChange={() => setFullscreenImg(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2">
          {fullscreenImg && <img src={fullscreenImg} alt="" className="w-full h-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
