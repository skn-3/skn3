import { useState, useMemo, useEffect } from 'react';
import { formatDaySv, formatDayTimeSv, dayTagSv } from '@/lib/dateSv';
import { Chip, StatusChip } from '@/components/ui/chip';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCaseEvents, fetchDeviations, fetchCaseByIdForMontor, fetchCaseCosts, createCaseCost, uploadReceiptImage, updateCase, createCaseEvent, updateDeviation, sendNotificationEmail, sendMontorAssignmentEmail } from '@/lib/supabaseClient';
import type { CaseRow } from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { DEVIATION_TYPES, DEVIATION_RESPONSIBLE, COORDINATOR_EMAIL, EMAIL_MAP } from '@/lib/constants';
import { canEnterStatus } from '@/lib/statusRules';
import { logActivity } from '@/lib/activityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Phone, AlertTriangle, Clock, Camera, CheckCircle2, X, Receipt, Wrench, Pencil, Calendar as CalendarIcon, FileText, Navigation, HandHelping, Check, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { celebrateMontageDone } from '@/lib/celebrate';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SheetMetalOrdersSection } from '@/components/sheet-metal/SheetMetalOrdersSection';
import { SignedImage } from '@/components/shared/SignedImage';
import { MontorLitteraSection } from '@/components/montor/MontorLitteraSection';
import { submitKontrollmatning, fetchPendingLitteror } from '@/lib/kontrollmatning';
import { aOrderPdfName, invoicePdfName, creditPdfName } from '@/lib/pdfNames';
import { openDocumentInNewTab } from '@/lib/openDocument';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { CostPayoutChip } from '@/components/shared/CostPayoutChip';
import { ListChecks, Share2 } from 'lucide-react';
import { submitMontagePartial } from '@/lib/montagePartial';
import { MontagePartialBlock } from '@/components/shared/MontagePartialBlock';
import { shareCaseInChat } from '@/lib/chat';

const HEADING = 'text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground';

/** Sektionskort. Hopfällbara kort har en tryckbar rubrikrad (48 px) med sammanfattning. */
function Card({ title, children, collapsible, summary, open = true, onToggle, id }: {
  title: string; children: React.ReactNode; collapsible?: boolean; summary?: string; open?: boolean; onToggle?: () => void; id?: string;
}) {
  if (!collapsible) {
    return (
      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <h2 className={HEADING}>{title}</h2>
        {children}
      </section>
    );
  }
  return (
    <section className="rounded-2xl border bg-card p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`sec-${id}`}
        className="-m-2 flex w-[calc(100%+1rem)] min-h-[48px] items-center gap-3 rounded-xl p-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={`block ${HEADING}`}>{title}</span>
          {!open && summary && <span className="mt-0.5 block truncate text-sm text-card-foreground">{summary}</span>}
        </span>
        <ChevronRight className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div id={`sec-${id}`} className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}

const DEFAULT_COLLAPSED: Record<string, boolean> = { history: true };

interface Props {
  caseData: CaseRow;
  currentUser: string;
  onBack: () => void;
}

export function MontorCaseDetail({ caseData: initialCaseData, currentUser, onBack }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: liveCaseData } = useQuery({
    queryKey: ['case', initialCaseData.id],
    queryFn: () => fetchCaseByIdForMontor(initialCaseData.id),
    initialData: initialCaseData,
  });
  const caseData = liveCaseData ?? initialCaseData;

  const [showKlar, setShowKlar] = useState(false);
  const [showPartial, setShowPartial] = useState(false);
  const [partialNote, setPartialNote] = useState('');
  const [showCost, setShowCost] = useState(false);
  const [klarComment, setKlarComment] = useState('');
  const [kmDate, setKmDate] = useState('');
  const [extraHoursReq, setExtraHoursReq] = useState('0');
  const [kmNote, setKmNote] = useState('');
  const [note, setNote] = useState('');
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);
  const [montageDate, setMontageDate] = useState('');
  const [montageTime, setMontageTime] = useState('');
  const [editingMontage, setEditingMontage] = useState(false);
  const [editMontageDate, setEditMontageDate] = useState('');
  const [editMontageTime, setEditMontageTime] = useState('');

  // Cost form state
  const [costDesc, setCostDesc] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costFile, setCostFile] = useState<File | null>(null);
  const [costCategory, setCostCategory] = useState<'ovrigt' | 'reklamation'>('ovrigt');
  const [costResponsible, setCostResponsible] = useState<string>('');

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

  // Ej inskickade littera — avgör om "Rapportera KM klar" även skickar in mätningen.
  const { data: litteraRows } = useQuery({
    queryKey: ['litteror', caseData.id],
    queryFn: () => fetchPendingLitteror(caseData.id),
  });
  const litteraCount = (litteraRows ?? []).length;

  const { data: sheetCount = 0 } = useQuery({
    queryKey: ['sheet_metal_orders_count', caseData.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('sheet_metal_orders').select('id').eq('case_id', caseData.id);
      if (error) throw error;
      return (data ?? []).length as number;
    },
  });

  // Hopfällda sektioner minns sitt läge per ärende under sessionen.
  const storageKey = `montor-case-sections:${caseData.id}`;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return { ...DEFAULT_COLLAPSED, ...JSON.parse(sessionStorage.getItem(storageKey) || '{}') }; } catch { return { ...DEFAULT_COLLAPSED }; }
  });
  const isOpen = (k: string) => !collapsed[k];
  const toggle = (k: string) => setCollapsed((prev) => {
    const next = { ...prev, [k]: !prev[k] };
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* privat läge */ }
    return next;
  });

  const pendingLittera = (litteraRows ?? []).filter((r) => r.cm_status === 'ej_paborjad' || r.cm_status === 'justerad');

  // Montörens eget team (profilnamn = teamnamn). Admin som tittar i montörvyn har inget team och ser då alla ordrar på ärendet.
  const myTeamQuery = useQuery({
    queryKey: ['montor-team', currentUser],
    enabled: !!currentUser,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('montor_teams').select('id, name').eq('name', currentUser).maybeSingle();
      if (error) throw error;
      return (data ?? null) as { id: string; name: string } | null;
    },
  });
  const myTeamId = myTeamQuery.data?.id ?? null;

  const { data: myAOrders = [] } = useQuery({
    queryKey: ['montor-aorders', caseData.id, myTeamId],
    enabled: !!caseData.id && myTeamQuery.isFetched,
    queryFn: async () => {
      let q = (supabase as any)
        .from('a_orders')
        .select('id, order_number, created_at, date, total_amount, status, pdf_path, order_sent_at, invoice_number, invoice_sent_at, credited_from_order_id, paid_at, customer_address, order_kind, montor_teams(name)')
        .eq('case_id', caseData.id)
        .order('created_at', { ascending: false });
      if (myTeamId) q = q.eq('team_id', myTeamId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['case', initialCaseData.id] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['case_events', caseData.id] });
    queryClient.invalidateQueries({ queryKey: ['deviations', caseData.id] });
    queryClient.invalidateQueries({ queryKey: ['deviations_bulk'] });
    queryClient.invalidateQueries({ queryKey: ['case_costs', caseData.id] });
  };

  // Kvittobildens förhandsvisnings-URL skapas en gång per fil och frigörs vid byte.
  const costFileUrl = useMemo(() => (costFile ? URL.createObjectURL(costFile) : null), [costFile]);
  useEffect(() => {
    return () => { if (costFileUrl) URL.revokeObjectURL(costFileUrl); };
  }, [costFileUrl]);



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
      logActivity({
        category: 'case',
        action: 'montage_completed',
        description: `Markerade montage klart för ${caseData.address}`,
        case_id: caseData.id,
        metadata: { comment: klarComment || null },
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
      celebrateMontageDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const partialMutation = useMutation({
    mutationFn: () => submitMontagePartial(caseData, currentUser, partialNote),
    onSuccess: () => { setShowPartial(false); setPartialNote(''); invalidate(); toast.success('Delrapport skickad'); },
    onError: (e: Error) => { invalidate(); toast.error(e.message); },
  });

  const startMontageMutation = useMutation({
    mutationFn: async () => {
      const check = canEnterStatus('montage_pagar', caseData);
      if (!check.ok) throw new Error(check.reason || 'Förutsättning saknas');
      await updateCase(caseData.id, { status: 'montage_pagar' });
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'status_change',
        description: 'Montage påbörjat',
        created_by: currentUser,
      });
      logActivity({
        category: 'case',
        action: 'montage_started',
        description: `Påbörjade montage för ${caseData.address}`,
        case_id: caseData.id,
      });
    },
    onSuccess: () => { invalidate(); toast.success('Montage påbörjat'); },
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
      logActivity({
        category: 'case',
        action: 'km_booked',
        description: `Bokade kontrollmätning (${kmDate}) för ${caseData.address}`,
        case_id: caseData.id,
        metadata: { km_date: kmDate },
      });
      await sendMontorAssignmentEmail(caseData, 'km', currentUser, { km_date: kmDate });
    },
    onSuccess: () => { invalidate(); toast.success('KM bokad'); },
    onError: (e: Error) => toast.error(`KM kunde inte bokas: ${e.message || 'okänt fel'}`),
  });

  const kmReportMutation = useMutation({
    mutationFn: async () => {
      // Ett enda KM-klar-flöde: ej inskickade littera skickas in samtidigt.
      if (pendingLittera.length > 0) {
        await submitKontrollmatning({
          caseId: caseData.id,
          rows: litteraRows ?? [],
          currentUser,
          caseAddress: caseData.address,
          customerName: caseData.customer_name,
        });
      }
      const hrs = Number(extraHoursReq);
      const newStatus = hrs > 0 ? 'vantar_godkannande' : 'km_klar';
      await updateCase(caseData.id, { status: newStatus, extra_hours_requested: hrs });
      await createCaseEvent({
        case_id: caseData.id,
        event_type: hrs > 0 ? 'hours_request' : 'km_report',
        description: hrs > 0 ? `KM klar. Extra timmar begärda: ${hrs}` : `KM klar. Inga extra timmar.${kmNote ? ' ' + kmNote : ''}`,
        created_by: currentUser,
      });
      logActivity({
        category: 'case',
        action: 'km_reported_done',
        description: `Rapporterade KM klar för ${caseData.address}`,
        case_id: caseData.id,
        metadata: { extra_hours_requested: hrs, note: kmNote || null },
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
    onError: (e: Error) => toast.error(`KM kunde inte rapporteras: ${e.message || 'okänt fel'}`),
  });

  const bookMontageMutation = useMutation({
    mutationFn: async () => {
      if (!montageDate) throw new Error('Datum krävs');
      // Saknar ärendet montageteam och inloggad är ett montörsteam: tilldela sig själv.
      const selfAssign = !caseData.team && !!myTeamQuery.data;
      const team = selfAssign ? currentUser : (caseData.team ?? null);
      const check = canEnterStatus('montage_bokat', { ...caseData, team, montage_date: montageDate });
      if (!check.ok) throw new Error(check.reason || 'Förutsättning saknas');
      await updateCase(caseData.id, {
        montage_date: montageDate,
        montage_time: montageTime || null,
        status: 'montage_bokat',
        ...(selfAssign ? { team: currentUser } : {}),
      } as any);
      const desc = `Montage bokat ${montageDate}${montageTime ? ' ' + montageTime : ''} av ${currentUser}${selfAssign ? `. Montage-montör: ${currentUser}` : ''}`;
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'montage_booked',
        description: desc,
        created_by: currentUser,
      });
      logActivity({
        category: 'case',
        action: 'montage_booked',
        description: desc,
        case_id: caseData.id,
        metadata: { montage_date: montageDate, montage_time: montageTime || null, case_id: caseData.id },
      });
      await sendMontorAssignmentEmail(
        { ...caseData, team, montage_date: montageDate, montage_time: montageTime || null },
        'montage',
        currentUser,
        { montage_date: montageDate, montage_time: montageTime || null },
      );
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success(`Montage bokat ${formatDaySv(montageDate)}`);
      setMontageDate('');
      setMontageTime('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rescheduleMontageMutation = useMutation({
    mutationFn: async () => {
      if (!editMontageDate) throw new Error('Datum krävs');
      const oldDate = caseData.montage_date;
      const oldTime = (caseData as any).montage_time || null;
      await updateCase(caseData.id, {
        montage_date: editMontageDate,
        montage_time: editMontageTime || null,
      } as any);
      const desc = `Montagedatum ändrat från ${oldDate}${oldTime ? ' ' + oldTime : ''} till ${editMontageDate}${editMontageTime ? ' ' + editMontageTime : ''} av ${currentUser}`;
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'montage_rescheduled',
        description: desc,
        created_by: currentUser,
      });
      logActivity({
        category: 'case',
        action: 'montage_rescheduled',
        description: desc,
        case_id: caseData.id,
        metadata: { old_date: oldDate, new_date: editMontageDate, old_time: oldTime, new_time: editMontageTime || null, case_id: caseData.id },
      });
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success(`Montagedatum ändrat till ${formatDaySv(editMontageDate)}`);
      setEditingMontage(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const costMutation = useMutation({
    mutationFn: async () => {
      const cost = await createCaseCost({
        case_id: caseData.id,
        description: costDesc,
        amount: Number(costAmount),
        created_by: currentUser,
        category: costCategory,
        responsible: costCategory === 'reklamation' ? (costResponsible || null) : null,
      });
      // Kostnaden finns nu — ett kvittofel får inte rapportera hela flödet som misslyckat.
      let receiptFailed = false;
      if (costFile) {
        try {
          const url = await uploadReceiptImage(caseData.id, cost.id, costFile);
          const { supabase } = await import('@/integrations/supabase/client');
          const { error: updErr } = await supabase.from('case_costs').update({ receipt_url: url }).eq('id', cost.id);
          if (updErr) throw updErr;
        } catch (e) {
          receiptFailed = true;
          console.error('Kvittouppladdning misslyckades:', e);
        }
      }
      const respLabel = costCategory === 'reklamation' && costResponsible
        ? ` (ansvar: ${DEVIATION_RESPONSIBLE.find(r => r.value === costResponsible)?.label || costResponsible})`
        : '';
      const catLabel = costCategory === 'reklamation' ? ` [Reklamation${respLabel}]` : '';
      try {
        await createCaseEvent({
          case_id: caseData.id,
          event_type: 'cost',
          description: `Kostnad tillagd${catLabel}: ${costDesc} — ${Number(costAmount).toLocaleString('sv-SE')} kr ex moms${receiptFailed ? ' (kvittobilden kunde inte laddas upp)' : ''}`,
          created_by: currentUser,
        });
      } catch (e) {
        console.error('createCaseEvent (cost) failed:', e);
      }
      logActivity({
        category: 'case',
        action: 'cost_added',
        description: `Registrerade kostnad${catLabel} (${Number(costAmount).toLocaleString('sv-SE')} kr) för ${caseData.address}`,
        case_id: caseData.id,
        metadata: { amount: Number(costAmount), description: costDesc, has_receipt: !!costFile && !receiptFailed, receipt_failed: receiptFailed, category: costCategory, responsible: costCategory === 'reklamation' ? costResponsible : null },
      });
      return { receiptFailed };
    },
    onSuccess: ({ receiptFailed }) => {
      setShowCost(false);
      setCostDesc('');
      setCostAmount('');
      setCostFile(null);
      setCostCategory('ovrigt');
      setCostResponsible('');
      invalidate();
      if (receiptFailed) {
        toast.warning('Kostnaden är sparad men kvittobilden kunde inte laddas upp — kontoret ser det i historiken', { duration: 8000 });
      } else {
        toast.success('Kostnad sparad');
      }
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
      logActivity({
        category: 'deviation',
        action: 'deviation_resolved',
        description: `Löste reklamation (${caseData.address})`,
        case_id: caseData.id,
        deviation_id: deviation.id,
        metadata: { type: deviation.type },
      });
    },
    onSuccess: () => { invalidate(); toast.success('Avvikelse markerad som löst'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteMutation = useMutation({
    mutationFn: async () => {
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'note',
        description: `Anteckning: ${note}`,
        created_by: currentUser,
      });
      logActivity({
        category: 'case',
        action: 'note_added',
        description: `La till anteckning på ${caseData.address}`,
        case_id: caseData.id,
        metadata: { note },
      });
    },
    onSuccess: () => { setNote(''); invalidate(); toast.success('Anteckning sparad'); },
    onError: (e: Error) => toast.error(`Anteckningen kunde inte sparas: ${e.message || 'okänt fel'}`),
  });


  const totalCosts = (costs || []).reduce((sum, c) => sum + Number(c.amount), 0);

  const anyCase = caseData as any;
  const isKmPhase = ['vantar_km', 'km_bokad', 'km_klar'].includes(caseData.status);
  const slotDate = isKmPhase ? caseData.km_date : caseData.montage_date;
  const slotTime = isKmPhase ? anyCase.km_time : anyCase.montage_time;
  const slotTag = dayTagSv(slotDate);
  const firstName = (caseData.customer_name || '').trim().split(/\s+/)[0] || 'kund';
  const destination = [caseData.address, caseData.city].filter(Boolean).join(', ');
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  const hasOpenDeviation = (deviations || []).some((d) => !d.resolved);
  const showCity = !!caseData.city && !(caseData.address || '').toLowerCase().includes(caseData.city.toLowerCase());
  const visibleEvents = (events || []).filter(e => e.event_type !== 'economy' && e.event_type !== 'deviation_cost');
  const lastEvent = visibleEvents[0];
  const eventTime = (iso: string) => formatDayTimeSv(iso, new Date(iso).toTimeString().slice(0, 5));
  const ordersSum = myAOrders.reduce((s: number, o: any) => s + (typeof o.total_amount === 'number' ? o.total_amount : 0), 0);
  const fmtKr = (n: number) => Math.round(n).toLocaleString('sv-SE');

  const canBookMontage = ['godkand', 'i_produktion', 'leverans_klar'].includes(caseData.status) && !caseData.montage_date;
  const hasNextStep = ['vantar_km', 'km_bokad', 'montage_bokat', 'montage_pagar'].includes(caseData.status) || canBookMontage;
  const PRIMARY = 'w-full min-h-[52px] text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90';

  const openPdf = async (path: string, name: string) => {
    const ok = await openDocumentInNewTab(async () => {
      const { data } = await supabase.storage.from('case-documents').createSignedUrl(path, 600, { download: name });
      return data?.signedUrl ?? null;
    });
    if (!ok) toast.error('PDF:en kunde inte öppnas');
  };

  const nextStepCard = hasNextStep ? (
    <section className="rounded-2xl border border-ink/20 bg-gold-soft p-4 space-y-3 text-ink">
      <h2 className={HEADING}>Nästa steg</h2>

      {caseData.status === 'vantar_km' && (
        <div className="space-y-2">
          <p className="font-display text-[17px] font-semibold">Boka kontrollmätning</p>
          <Label>Boka KM-datum</Label>
          <Input type="date" value={kmDate} onChange={(e) => setKmDate(e.target.value)} className="min-h-[48px] bg-card" />
          <Button disabled={!kmDate || kmBookMutation.isPending} onClick={() => kmBookMutation.mutate()} className={PRIMARY}>
            {kmBookMutation.isPending ? 'Sparar...' : 'Boka kontrollmätning'}
          </Button>
        </div>
      )}

      {caseData.status === 'km_bokad' && (
        <div className="space-y-2">
          <p className="font-display text-[17px] font-semibold">Rapportera KM klar</p>
          <Label>Extra timmar begärda</Label>
          <Input type="number" value={extraHoursReq} onChange={(e) => setExtraHoursReq(e.target.value)} className="min-h-[48px] bg-card" />
          <p className="text-xs text-ink/70">Varje extra timme kostar 469 kr. Ange bara timmar som verkligen behövs utöver det som ingår.</p>
          <Label>Anteckning</Label>
          <Textarea value={kmNote} onChange={(e) => setKmNote(e.target.value)} rows={2} className="bg-card" />
          <Button disabled={kmReportMutation.isPending} onClick={() => kmReportMutation.mutate()} className={PRIMARY}>
            {kmReportMutation.isPending ? 'Sparar...' : 'Rapportera KM klar'}
          </Button>
          {pendingLittera.length > 0 && (
            <p className="text-xs text-ink/70">
              Kontrollmätningen ({pendingLittera.length} littera) skickas in samtidigt.
            </p>
          )}
        </div>
      )}

      {canBookMontage && (
        <div className="space-y-2">
          <p className="font-display text-[17px] font-semibold">Boka montage</p>
          <Label className="flex items-center gap-1.5"><CalendarIcon className="h-4 w-4" /> Boka montagedatum</Label>
          <Input type="date" value={montageDate} onChange={(e) => setMontageDate(e.target.value)} className="min-h-[48px] bg-card" />
          <Label>Tid (valfritt)</Label>
          <Input type="time" value={montageTime} onChange={(e) => setMontageTime(e.target.value)} className="min-h-[48px] bg-card" />
          <Button disabled={!montageDate || bookMontageMutation.isPending} onClick={() => bookMontageMutation.mutate()} className={PRIMARY}>
            {bookMontageMutation.isPending ? 'Sparar...' : 'Boka montage'}
          </Button>
        </div>
      )}

      {caseData.status === 'montage_bokat' && (
        <Button onClick={() => startMontageMutation.mutate()} disabled={startMontageMutation.isPending} className={PRIMARY}>
          <Wrench className="h-5 w-5 mr-2" />
          Påbörja montage
        </Button>
      )}

      {(caseData.status === 'montage_bokat' || caseData.status === 'montage_pagar') && (
        <Button
          onClick={() => setShowKlar(true)}
          disabled={klarMutation.isPending}
          variant={caseData.status === 'montage_bokat' ? 'outline' : 'default'}
          className={caseData.status === 'montage_bokat' ? 'w-full min-h-[48px] border-ink text-ink bg-card font-semibold' : PRIMARY}
        >
          <CheckCircle2 className="h-5 w-5 mr-2" />
          Montage klart
        </Button>
      )}
      {['montage_bokat', 'montage_pagar'].includes(caseData.status) && <Button variant="outline" className="w-full min-h-[48px] border-ink text-ink bg-card font-semibold" onClick={() => setShowPartial(true)} disabled={partialMutation.isPending}><ListChecks className="h-5 w-5 mr-2" />Delrapportera montage</Button>}
    </section>
  ) : (
    <p className="px-1 py-2 text-sm text-muted-foreground">Inget att göra just nu – kontoret tar nästa steg.</p>
  );

  const reportButton = (
    <Button
      variant="outline"
      className="w-full min-h-[48px] text-destructive border-border bg-card"
      onClick={() => navigate(`/case/${caseData.id}/rapportera`)}
    >
      <AlertTriangle className="h-4 w-4 mr-1" /> Rapportera problem
    </Button>
  );

  const customerCard = (
    <Card title="Kund">
      <div className="font-display text-[17px] font-semibold text-card-foreground">{caseData.customer_name}</div>
      <div className="text-sm text-muted-foreground">{caseData.address}{showCity ? `, ${caseData.city}` : ''}</div>
      {caseData.customer_email && (
        <a href={`mailto:${caseData.customer_email}`} className="inline-flex min-h-[44px] items-center text-sm text-ink underline underline-offset-2 break-all">
          {caseData.customer_email}
        </a>
      )}
      {(anyCase.media_consent || anyCase.carry_help_needed || anyCase.scheduled_delivery) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {anyCase.media_consent && <Chip className="bg-gold-soft text-ink" icon={<Camera />}>Foto/film överenskommet</Chip>}
          {anyCase.carry_help_needed && <Chip className="bg-gold-soft text-ink" icon={<HandHelping />}>Bärhjälp behövs</Chip>}
          {anyCase.scheduled_delivery && <Chip className="bg-gold-soft text-ink" icon={<Clock />}>Tidsstyrd leverans</Chip>}
        </div>
      )}
    </Card>
  );

  const missing = <span className="text-muted-foreground">Ej bokat</span>;
  const deliveryText = anyCase.delivery_week
    ? `vecka ${anyCase.delivery_week}${anyCase.delivery_year ? `/${anyCase.delivery_year}` : ''}${anyCase.delivery_date ? ` · ${formatDayTimeSv(anyCase.delivery_date, anyCase.delivery_time)}` : ''}`
    : anyCase.delivery_date ? formatDayTimeSv(anyCase.delivery_date, anyCase.delivery_time) : null;

  const timesCard = (
    <Card title="Tider">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">KM</dt><dd className="text-right font-medium">{caseData.km_date ? formatDayTimeSv(caseData.km_date, anyCase.km_time) : missing}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Leverans</dt><dd className="text-right font-medium">{deliveryText ?? missing}</dd></div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Montage</dt>
          <dd className="flex items-center gap-2 text-right font-medium">
            {caseData.montage_date ? formatDayTimeSv(caseData.montage_date, anyCase.montage_time) : missing}
            {caseData.montage_date && !editingMontage && caseData.status !== 'montage_klart' && caseData.status !== 'fakturerad' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditMontageDate(caseData.montage_date || '');
                  setEditMontageTime((anyCase.montage_time as string) || '');
                  setEditingMontage(true);
                }}
                className="min-h-[44px]"
              >
                <Pencil className="h-4 w-4 mr-1" /> Ändra
              </Button>
            )}
          </dd>
        </div>
      </dl>
      {editingMontage && (
        <div className="space-y-2 rounded-xl border p-3">
          <Label>Nytt montagedatum</Label>
          <Input type="date" value={editMontageDate} onChange={(e) => setEditMontageDate(e.target.value)} className="min-h-[48px]" />
          <Label>Tid (valfritt)</Label>
          <Input type="time" value={editMontageTime} onChange={(e) => setEditMontageTime(e.target.value)} className="min-h-[48px]" />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!editMontageDate || rescheduleMontageMutation.isPending} onClick={() => rescheduleMontageMutation.mutate()} className="min-h-[48px] flex-1">
              {rescheduleMontageMutation.isPending ? 'Sparar...' : 'Spara'}
            </Button>
            <Button variant="outline" onClick={() => setEditingMontage(false)} className="min-h-[48px]">Avbryt</Button>
          </div>
        </div>
      )}
      {caseData.extra_hours_requested > 0 && caseData.status !== 'km_bokad' && (
        <div className="rounded-xl border p-3 space-y-1 text-sm">
          <p><span className="text-muted-foreground">Extra timmar begärda:</span> <span className="font-medium">{caseData.extra_hours_requested} st</span></p>
          <p>
            <span className="text-muted-foreground">Status:</span>{' '}
            {caseData.extra_hours_approved > 0 ? (
              <span className="font-medium text-success">Godkända ({caseData.extra_hours_approved} st)</span>
            ) : caseData.status === 'vantar_godkannande' ? (
              <span className="font-medium text-warning-ink">Väntar på godkännande</span>
            ) : (
              <span className="font-medium text-muted-foreground">Avslagna</span>
            )}
          </p>
        </div>
      )}
    </Card>
  );

  const deviationsCard = deviations && deviations.length > 0 ? (
    <Card title={`Avvikelser / Reklamationer (${deviations.length})`}>
      {deviations.map(d => (
        <div key={d.id} className="rounded-xl border p-3 text-sm space-y-1">
          <div className="flex justify-between items-center gap-2">
            <div className="flex flex-wrap gap-1.5 items-center">
              <Badge variant={d.resolved ? 'secondary' : 'destructive'}>
                {DEVIATION_TYPES.find(dt => dt.value === d.type)?.label || d.type}
              </Badge>
              <Badge variant={d.resolved ? 'secondary' : 'destructive'} className={d.resolved ? 'text-success' : ''}>
                {d.resolved ? 'Löst' : 'Olöst'}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">{formatDaySv(d.created_at)}</span>
          </div>
          <p className="text-card-foreground">{d.description}</p>
          <p className="text-muted-foreground text-xs">
            Ansvar: {DEVIATION_RESPONSIBLE.find(r => r.value === d.responsible)?.label || d.responsible} — {d.created_by}
          </p>
          {(d as any).ball === 'montor' && (d as any).next_step && !d.resolved && (
            <div className="mt-1 rounded-md border border-ink/20 bg-gold-soft px-2.5 py-1.5 text-sm text-ink">
              <span className="font-semibold">Nästa steg (ditt): </span>
              <span>{(d as any).next_step}</span>
              {(d as any).next_step_due && <span className="text-xs"> · senast {formatDaySv((d as any).next_step_due)}</span>}
            </div>
          )}
          {(d as any).cost > 0 && (
            <p className="text-sm font-medium text-destructive">Kostnad: {Number((d as any).cost).toLocaleString('sv-SE')} kr</p>
          )}
          {d.image_urls && (d.image_urls as string[]).length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {(d.image_urls as string[]).map((url, i) => (
                <button key={i} onClick={() => setFullscreenImg(url)} className="w-16 h-16 rounded-lg overflow-hidden border">
                  <SignedImage value={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {!d.resolved && (
            <Button size="sm" variant="outline" className="mt-1 min-h-[44px] text-success" disabled={resolveMutation.isPending} onClick={() => resolveMutation.mutate(d)}>
              {resolveMutation.isPending ? 'Sparar...' : <><Check className="h-4 w-4 mr-1" /> Markera löst</>}
            </Button>
          )}
        </div>
      ))}
    </Card>
  ) : null;

  const sellerNotes = (caseData.notes || '').trim();
  const montorNotes = (anyCase.montor_notes || '').trim();
  const noteCard = (
    <Card title="Anteckning">
      {sellerNotes && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Ordernoteringar Säljare</p>
          <p className="rounded-xl border p-3 text-sm whitespace-pre-wrap">{sellerNotes}</p>
        </div>
      )}
      {montorNotes && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Ordernoteringar Montör</p>
          <p className="rounded-xl border p-3 text-sm whitespace-pre-wrap">{anyCase.montor_notes}</p>
        </div>
      )}
      <div className="flex gap-2">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="flex-1" placeholder="Skriv en anteckning..." />
        <Button className="min-h-[48px]" disabled={!note || noteMutation.isPending} onClick={() => noteMutation.mutate()}>{noteMutation.isPending ? 'Sparar...' : 'Spara'}</Button>
      </div>
    </Card>
  );

  const ordersCard = myAOrders.length > 0 ? (
    <Card title="A-ordrar & fakturor" id="orders" collapsible summary={`${myAOrders.length} ordrar · ${fmtKr(ordersSum)} kr`} open={isOpen('orders')} onToggle={() => toggle('orders')}>
      {myAOrders.map((o: any) => {
        const isCreditNote = o.status === 'credited' && !!o.credited_from_order_id;
        const kindLabel = isCreditNote ? 'Kreditfaktura' : o.order_kind === 'service' ? 'Serviceorder' : o.order_kind === 'komplettering' ? 'Komplettering' : 'A-order';
        const line = o.status === 'credited' ? 'bg-muted-foreground' : o.paid_at ? 'bg-success' : o.invoice_sent_at ? 'bg-ink' : o.order_sent_at ? 'bg-sage' : 'bg-gold';
        const statusText = isCreditNote
          ? `Kreditfaktura ${o.invoice_number ?? ''}`.trim()
          : o.status === 'credited'
          ? 'Krediterad'
          : o.paid_at
          ? `Betald ${formatDaySv(o.paid_at)}`
          : o.invoice_sent_at
          ? [`Fakturerad ${o.invoice_number ?? ''}`.trim(), formatDaySv(o.invoice_sent_at)].filter(Boolean).join(' · ')
          : o.order_sent_at
          ? `Skickad ${formatDaySv(o.order_sent_at)}`
          : 'Order';
        const negative = isCreditNote || (typeof o.total_amount === 'number' && o.total_amount < 0);
        return (
          <article key={o.id} className="relative rounded-xl border bg-card p-3 pl-4 text-sm space-y-2">
            <span aria-hidden="true" className={`absolute inset-y-3 left-0 w-[3px] rounded-r ${line}`} />
            <div className="flex items-center gap-2">
              <Chip className="border border-border bg-background text-ink">{kindLabel}</Chip>
              <span className="font-mono text-xs text-muted-foreground">#{o.order_number ?? '—'}</span>
              <span className="ml-auto text-xs text-muted-foreground">{formatDaySv(o.date || o.created_at)}</span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-card-foreground break-words">{o.customer_address || caseData.address}</div>
                <p className={`mt-1 flex items-center gap-2 text-xs ${o.paid_at && o.status !== 'credited' ? 'text-success' : 'text-muted-foreground'}`}>
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${line}`} />{statusText}
                </p>
              </div>
              {typeof o.total_amount === 'number' && (
                <div className="text-right">
                  <div className={`font-display text-[18px] tabular-nums whitespace-nowrap ${negative ? 'text-muted-foreground' : 'text-card-foreground'}`}>{fmtKr(o.total_amount)} kr</div>
                  <div className="text-[10px] font-normal uppercase tracking-[1px] text-muted-foreground/80">ex moms</div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {isCreditNote ? (
                o.pdf_path && (
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => openPdf(o.pdf_path, creditPdfName(o))}>
                    <FileText className="h-4 w-4 mr-1" /> Kreditfaktura PDF
                  </Button>
                )
              ) : (
                <>
                  {o.order_sent_at && (
                    <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => openPdf(`a-orders/${o.id}.pdf`, aOrderPdfName(o))}>
                      <FileText className="h-4 w-4 mr-1" /> {o.order_kind === 'service' ? 'Serviceorder PDF' : 'A-order PDF'}
                    </Button>
                  )}
                  {o.invoice_sent_at && o.pdf_path && (
                    <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => openPdf(`a-orders/${o.id}-faktura.pdf`, invoicePdfName(o))}>
                      <FileText className="h-4 w-4 mr-1" /> Faktura PDF
                    </Button>
                  )}
                  {!o.order_sent_at && !(o.invoice_sent_at && o.pdf_path) && (
                    <span className="text-xs text-muted-foreground">PDF ej genererad ännu</span>
                  )}
                </>
              )}
            </div>
          </article>
        );
      })}
    </Card>
  ) : null;

  const sheetCard = (
    <Card title="Plåtbeställningar" id="sheet" collapsible summary={`${sheetCount} beställningar`} open={isOpen('sheet')} onToggle={() => toggle('sheet')}>
      <SheetMetalOrdersSection caseId={caseData.id} variant="mobile" hideTitle />
    </Card>
  );

  const litteraCard = (
    <Card title="Kontrollmätning / littera" id="littera" collapsible summary={`${litteraCount} littera`} open={isOpen('littera')} onToggle={() => toggle('littera')}>
      <MontorLitteraSection caseId={caseData.id} currentUser={currentUser} caseAddress={caseData.address} customerName={caseData.customer_name} hideTitle />
    </Card>
  );

  const costsCard = (
    <Card title="Kostnader" id="costs" collapsible summary={`${costs?.length ?? 0} kostnader · ${fmtKr(totalCosts)} kr`} open={isOpen('costs')} onToggle={() => toggle('costs')}>
      <Button variant="outline" className="w-full min-h-[48px]" onClick={() => setShowCost(true)}>
        <Receipt className="h-4 w-4 mr-1" /> Lägg till kostnad
      </Button>
      {(costs || []).map(c => {
        const isFabrik = c.category === 'reklamation' && c.responsible === 'fabrik';
        return (
          <div key={c.id} className={`rounded-xl border p-3 text-sm flex justify-between items-start gap-2 ${isFabrik ? 'opacity-60' : ''}`}>
            <div className="min-w-0">
              <div className="font-medium text-card-foreground flex items-center gap-2 flex-wrap">
                <span>{c.description}</span>
                {c.category === 'reklamation' && (
                  <Chip className="bg-gold-soft text-ink">
                    Reklamation{c.responsible ? ` · ${DEVIATION_RESPONSIBLE.find(r => r.value === c.responsible)?.label || c.responsible}` : ''}
                  </Chip>
                )}
                {isFabrik && <span className="text-[10px] text-muted-foreground italic">(ersätts)</span>}
                <CostPayoutChip cost={{ a_order_id: c.a_order_id ?? null, payout_excluded_at: c.payout_excluded_at ?? null }} showPending={false} />
              </div>
              <div className="text-xs text-muted-foreground">{formatDaySv(c.created_at)} — {c.created_by}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums whitespace-nowrap">{Number(c.amount).toLocaleString('sv-SE')} kr</span>
              {c.receipt_url && (
                <button onClick={() => setFullscreenImg(c.receipt_url)} className="w-11 h-11 rounded border overflow-hidden">
                  <SignedImage value={c.receipt_url} alt="Kvitto" className="w-full h-full object-cover" />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {costs && costs.length > 0 && (
        <div className="text-right font-semibold text-sm text-card-foreground">Totalt: {totalCosts.toLocaleString('sv-SE')} kr</div>
      )}
    </Card>
  );

  const historyCard = (
    <Card title="Historik" id="history" collapsible summary={lastEvent ? `Senast: ${lastEvent.description} · ${eventTime(lastEvent.created_at)}` : 'Ingen historik ännu'} open={isOpen('history')} onToggle={() => toggle('history')}>
      {visibleEvents.map(e => (
        <div key={e.id} className="flex gap-2 text-sm">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{eventTime(e.created_at)}</span>
          <div>
            <span className="text-card-foreground">{e.description}</span>
            <span className="text-muted-foreground ml-1">— {e.created_by}</span>
          </div>
        </div>
      ))}
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Topprad */}
      <div className="safe-top sticky top-0 z-10 bg-card border-b">
      <div className="px-4 py-3 flex items-start gap-3">
        <button onClick={onBack} aria-label="Tillbaka" className="p-2 -ml-2 rounded-lg min-w-[48px] min-h-[48px] flex items-center justify-center">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[20px] font-semibold leading-tight text-card-foreground break-words">{caseData.address}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusChip status={caseData.status} />
            {slotDate ? (
              <span className="flex items-center gap-1.5">
                {slotTag && <Chip className="bg-gold-soft text-ink">{slotTag}</Chip>}
                <span className="text-[13px] font-medium text-ink">{isKmPhase ? 'KM' : 'Montage'} · {formatDayTimeSv(slotDate, slotTime)}</span>
              </span>
            ) : <span className="text-[13px] text-muted-foreground">Ej bokat</span>}
            {hasOpenDeviation && <Chip className="bg-gold-soft text-ink" icon={<AlertTriangle />}>Öppen reklamation</Chip>}
          </div>
        </div>
        <NotificationBell onDark={false} />
      </div>
      </div>

      <div className="mx-auto max-w-[640px] lg:max-w-[1200px] px-4 pb-32 pt-4">
        <div className="mb-4 grid grid-cols-2 gap-2 lg:max-w-[560px]">
          {caseData.customer_phone && (
            <Button asChild variant="outline" className="min-h-[48px] text-ink">
              <a href={`tel:${caseData.customer_phone}`}><Phone className="h-4 w-4 mr-1.5" /> Ring {firstName}</a>
            </Button>
          )}
          <Button asChild variant="outline" className={`min-h-[48px] text-ink ${caseData.customer_phone ? '' : 'col-span-2'}`}>
            <a href={mapsUrl} target="_blank" rel="noopener"><Navigation className="h-4 w-4 mr-1.5" /> Vägbeskrivning</a>
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6 items-start">
          <div className="space-y-4 min-w-0">
            {nextStepCard}
            {reportButton}
            <Button variant="outline" className="w-full min-h-[48px]" onClick={() => shareCaseInChat({ id: caseData.id, address: caseData.address })}><Share2 className="h-4 w-4 mr-2" />Dela i chatt</Button>
            <MontagePartialBlock caseData={caseData} />
            {customerCard}
            {timesCard}
            {deviationsCard}
            {noteCard}
          </div>
          <div className="space-y-4 min-w-0">
            {ordersCard}
            {sheetCard}
            {litteraCard}
            {costsCard}
            {historyCard}
          </div>
        </div>
      </div>


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
              <Label className="mb-1 block">Kategori</Label>
              <select
                value={costCategory}
                onChange={e => setCostCategory(e.target.value as 'ovrigt' | 'reklamation')}
                className="w-full min-h-[48px] rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="ovrigt">Övrigt</option>
                <option value="reklamation">Reklamation</option>
              </select>
            </div>
            {costCategory === 'reklamation' && (
              <div>
                <Label className="mb-1 block">Ansvar *</Label>
                <select
                  value={costResponsible}
                  onChange={e => setCostResponsible(e.target.value)}
                  className="w-full min-h-[48px] rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Välj ansvar...</option>
                  {DEVIATION_RESPONSIBLE.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                {costResponsible === 'fabrik' && (
                  <p className="mt-1 text-xs text-muted-foreground italic">
                    Ersätts av fabrik – belastar inte ekonomin.
                  </p>
                )}
              </div>
            )}
            <div>
              <Label className="mb-1 block">Belopp (ex moms) *</Label>
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
                  {costFileUrl && <img src={costFileUrl} alt="" className="w-full h-full object-cover" />}
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
              disabled={!costDesc.trim() || !costAmount || (costCategory === 'reklamation' && !costResponsible) || costMutation.isPending}
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

      <Drawer open={showPartial} onOpenChange={setShowPartial}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>Delrapportera montage</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-2 space-y-2"><Label htmlFor="partial-note">Allt är klart utom:</Label><Textarea id="partial-note" required value={partialNote} onChange={e => setPartialNote(e.target.value)} rows={3} placeholder="T.ex. fönsterbleck på baksidan saknas, lister i köket" /></div>
          <DrawerFooter><Button className="min-h-[48px]" disabled={!partialNote.trim() || partialMutation.isPending} onClick={() => partialMutation.mutate()}>{partialMutation.isPending ? 'Skickar…' : 'Skicka delrapport'}</Button><DrawerClose asChild><Button variant="outline" className="min-h-[48px]">Avbryt</Button></DrawerClose></DrawerFooter>
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
          {fullscreenImg && <SignedImage value={fullscreenImg} alt="" className="w-full h-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
