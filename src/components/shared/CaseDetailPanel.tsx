import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCaseEvents, fetchDeviations, fetchCaseById, fetchCaseCosts, updateCase, createCaseEvent, createDeviation, uploadDeviationImages, updateDeviation, sendNotificationEmail, deleteCase } from '@/lib/supabaseClient';
import type { CaseRow } from '@/lib/supabaseClient';
import { STATUS_LABELS, DEVIATION_TYPES, DEVIATION_RESPONSIBLE, EMAIL_MAP, COORDINATOR_EMAIL, COORDINATOR_CC, MONTORS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, ExternalLink, Clock, AlertTriangle, Trash2, CalendarIcon, Receipt, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CaseDetailPanelProps {
  caseData: CaseRow;
  currentUser: string;
  isSeller: boolean;
  onClose: () => void;
}

export function CaseDetailPanel({ caseData: initialCaseData, currentUser, isSeller, onClose }: CaseDetailPanelProps) {
  const queryClient = useQueryClient();

  // Live case data that updates after mutations
  const { data: liveCaseData } = useQuery({
    queryKey: ['case', initialCaseData.id],
    queryFn: () => fetchCaseById(initialCaseData.id),
    initialData: initialCaseData,
  });
  const caseData = liveCaseData ?? initialCaseData;
  const [note, setNote] = useState('');
  const [showDeviation, setShowDeviation] = useState(false);
  const [devForm, setDevForm] = useState({ type: '', description: '', responsible: '' });
  const [devCost, setDevCost] = useState('');
  const [probPriority, setProbPriority] = useState<'hog' | 'medium' | 'lag'>('medium');
  const [probFiles, setProbFiles] = useState<File[]>([]);
  const [kmDate, setKmDate] = useState('');
  const [extraHoursReq, setExtraHoursReq] = useState('0');
  const [kmNote, setKmNote] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(caseData.status);

  // Sync selectedStatus when live data updates
  useEffect(() => {
    setSelectedStatus(caseData.status);
  }, [caseData.status]);
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);
  // KM approval form state
  const [approvalMontor, setApprovalMontor] = useState(caseData.team || '');
  const [approvalDate, setApprovalDate] = useState<Date | undefined>(undefined);
  const [approvalNote, setApprovalNote] = useState('');

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
    queryClient.invalidateQueries({ queryKey: ['case_costs', caseData.id] });
  };

  const statusMutation = useMutation({
    mutationFn: async ({ newStatus, description }: { newStatus: string; description: string }) => {
      await updateCase(caseData.id, { status: newStatus });
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'status_change',
        description,
        created_by: currentUser,
      });

      // Send MONTAGE BOKAT email
      if (newStatus === 'montage_bokat') {
        try {
          await sendNotificationEmail({
            to: COORDINATOR_EMAIL,
            cc: COORDINATOR_CC,
            subject: `MONTAGE BOKAT — ${caseData.address}`,
            body: `
              <h2>Montage bokat</h2>
              <table style="border-collapse:collapse;width:100%">
                <tr><td style="padding:4px 8px;font-weight:bold">Adress:</td><td style="padding:4px 8px">${caseData.address}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Kund:</td><td style="padding:4px 8px">${caseData.customer_name}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Montör:</td><td style="padding:4px 8px">${caseData.team || 'Ej tilldelad'}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Montagedatum:</td><td style="padding:4px 8px">${caseData.montage_date || 'Ej angivet'}</td></tr>
                ${caseData.notes ? `<tr><td style="padding:4px 8px;font-weight:bold">Anteckning:</td><td style="padding:4px 8px">${caseData.notes}</td></tr>` : ''}
              </table>
            `,
          });
          await createCaseEvent({
            case_id: caseData.id,
            event_type: 'notification',
            description: `Mail skickat till ${COORDINATOR_EMAIL} (montage bokat)`,
            created_by: currentUser,
          });
        } catch (emailErr) {
          console.error('Email notification failed:', emailErr);
          toast.warning('Status uppdaterad men mailet kunde inte skickas');
        }
      }
    },
    onSuccess: () => { invalidate(); toast.success('Status uppdaterad'); },
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

  const problemMutation = useMutation({
    mutationFn: async () => {
      const isReklam = devForm.type === 'reklamation';
      const descWithPriority = isReklam ? `[${probPriority.toUpperCase()}] ${devForm.description}` : devForm.description;

      const deviation = await createDeviation({
        case_id: caseData.id,
        type: devForm.type,
        description: descWithPriority,
        responsible: devForm.responsible || 'okant',
        created_by: currentUser,
      });

      let imageUrls: string[] = [];
      if (probFiles.length > 0) {
        imageUrls = await uploadDeviationImages(caseData.id, deviation.id, probFiles);
        await updateDeviation(deviation.id, { image_urls: imageUrls });
      }

      const typLabel = DEVIATION_TYPES.find(d => d.value === devForm.type)?.label || devForm.type;
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'deviation',
        description: isReklam ? `Reklamation skapad: ${devForm.description}` : `Avvikelse skapad: ${typLabel} — ${devForm.description}`,
        created_by: currentUser,
      });

      if (isReklam) {
        await updateCase(caseData.id, { status: 'pausad' });
        await createCaseEvent({ case_id: caseData.id, event_type: 'status_change', description: 'Status ändrad till Pausad (reklamation)', created_by: currentUser });
      }

      try {
        const badgeMap: Record<string, { color: string; bg: string }> = {
          hog: { color: '#991B1B', bg: '#FEE2E2' },
          medium: { color: '#92400E', bg: '#FEF3C7' },
          lag: { color: '#374151', bg: '#F3F4F6' },
        };
        const rows: Array<{ label: string; value: string; badge?: { color: string; bg: string } }> = [
          { label: 'Adress', value: caseData.address },
          { label: 'Kund', value: caseData.customer_name },
          { label: 'Rapporterad av', value: currentUser },
          { label: 'Typ', value: typLabel },
        ];
        if (isReklam) {
          const pLabel = probPriority === 'hog' ? 'Hög' : probPriority === 'medium' ? 'Medium' : 'Låg';
          rows.push({ label: 'Prioritet', value: pLabel, badge: badgeMap[probPriority] });
        }
        rows.push({ label: 'Beskrivning', value: devForm.description });
        await sendNotificationEmail({
          to: COORDINATOR_EMAIL,
          cc: COORDINATOR_CC,
          subject: `${isReklam ? 'NY REKLAMATION' : 'NY AVVIKELSE'} — ${caseData.address}`,
          heading: isReklam ? 'Ny reklamation' : 'Ny avvikelse',
          rows,
          callToAction: 'Vänligen granska ärendet.',
        });
      } catch (emailErr) {
        console.error('Email notification failed:', emailErr);
      }
    },
    onSuccess: () => {
      setShowDeviation(false);
      setDevForm({ type: '', description: '', responsible: '' });
      setProbPriority('medium');
      setProbFiles([]);
      invalidate();
      toast.success('Problem rapporterat');
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
      await updateCase(caseData.id, {
        status: newStatus,
        extra_hours_requested: hrs,
      });
      await createCaseEvent({
        case_id: caseData.id,
        event_type: hrs > 0 ? 'hours_request' : 'km_report',
        description: hrs > 0
          ? `KM klar. Extra timmar begärda: ${hrs}`
          : `KM klar. Inga extra timmar.${kmNote ? ' ' + kmNote : ''}`,
        created_by: currentUser,
      });
    },
    onSuccess: () => { invalidate(); toast.success('KM rapporterad'); },
  });

  const approveHoursMutation = useMutation({
    mutationFn: async () => {
      await updateCase(caseData.id, { extra_hours_approved: caseData.extra_hours_requested, status: 'km_klar' });
      await createCaseEvent({ case_id: caseData.id, event_type: 'hours_approved', description: `Extra timmar godkända: ${caseData.extra_hours_requested}`, created_by: currentUser });
    },
    onSuccess: () => { invalidate(); toast.success('Extra timmar godkända'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectHoursMutation = useMutation({
    mutationFn: async () => {
      await updateCase(caseData.id, { extra_hours_approved: 0, status: 'km_klar' });
      await createCaseEvent({ case_id: caseData.id, event_type: 'hours_rejected', description: 'Extra timmar avslagna', created_by: currentUser });
    },
    onSuccess: () => { invalidate(); toast.success('Extra timmar avslagna'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approvalMutation = useMutation({
    mutationFn: async () => {
      const dateStr = format(approvalDate!, 'yyyy-MM-dd');
      const oldTeam = caseData.team;
      const teamChanged = approvalMontor !== oldTeam;

      await updateCase(caseData.id, { status: 'montage_bokat', montage_date: dateStr, team: approvalMontor });
      await createCaseEvent({ case_id: caseData.id, event_type: 'status_change', description: `KM godkänd. Montage bokat ${dateStr} — montör: ${approvalMontor}${approvalNote ? '. ' + approvalNote : ''}`, created_by: currentUser });

      if (teamChanged && oldTeam) {
        await createCaseEvent({ case_id: caseData.id, event_type: 'team_change', description: `Montör bytt från ${oldTeam} till ${approvalMontor}`, created_by: currentUser });
      }

      try {
        await sendNotificationEmail({
          to: COORDINATOR_EMAIL,
          cc: COORDINATOR_CC,
          subject: `MONTAGE BOKAT — ${caseData.address}`,
          heading: 'Montage bokat',
          rows: [
            { label: 'Adress', value: caseData.address },
            { label: 'Kund', value: caseData.customer_name },
            { label: 'Montör', value: approvalMontor },
            { label: 'Montagedatum', value: dateStr },
            ...(approvalNote ? [{ label: 'Anteckning', value: approvalNote }] : []),
          ],
          callToAction: 'Montage är bokat.',
        });
        await createCaseEvent({ case_id: caseData.id, event_type: 'notification', description: `Mail skickat till ${COORDINATOR_EMAIL} (montage bokat)`, created_by: currentUser });
      } catch (emailErr) {
        console.error('Email notification failed:', emailErr);
        toast.warning('Status uppdaterad men mailet kunde inte skickas');
      }
    },
    onSuccess: () => { invalidate(); toast.success('KM godkänd och montage bokat'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { await deleteCase(caseData.id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Ärendet har raderats');
      onClose();
    },
    onError: (e: Error) => toast.error('Kunde inte radera: ' + e.message),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const allowed = files.filter(f => /\.(jpe?g|png|heic)$/i.test(f.name));
    setProbFiles(prev => [...prev, ...allowed].slice(0, 5));
    e.target.value = '';
  };

  const changeStatus = (newStatus: string, description: string) => {
    statusMutation.mutate({ newStatus, description });
  };

  const handleManualStatusChange = (newStatus: string) => {
    setSelectedStatus(newStatus);
    if (newStatus !== caseData.status) {
      const label = STATUS_LABELS[newStatus] || newStatus;
      changeStatus(newStatus, `Status ändrad till: ${label}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/20" />
      <div
        className="relative w-full max-w-lg bg-card shadow-xl overflow-y-auto animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3">
          <div>
            <h2 className="font-bold text-card-foreground">{caseData.address}</h2>
            <Badge variant="secondary" className="mt-1">{STATUS_LABELS[caseData.status] || caseData.status}</Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="divide-y">
          {/* Customer info */}
          <section className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Kundinformation</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Namn:</span> {caseData.customer_name}</div>
              <div><span className="text-muted-foreground">Tel:</span> {caseData.customer_phone}</div>
              {caseData.customer_email && <div className="col-span-2"><span className="text-muted-foreground">E-post:</span> {caseData.customer_email}</div>}
              <div className="col-span-2"><span className="text-muted-foreground">Adress:</span> {caseData.address}</div>
            </div>
          </section>

          {/* Status dropdown */}
          <section className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Status</h3>
            <Select value={selectedStatus} onValueChange={handleManualStatusChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Order info */}
          <section className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Orderinfo</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {caseData.offer_number && <div><span className="text-muted-foreground">Offert:</span> {caseData.offer_number}</div>}
              {caseData.order_value && <div><span className="text-muted-foreground">Värde:</span> {Number(caseData.order_value).toLocaleString('sv-SE')} kr</div>}
              {caseData.tb_percent != null && <div><span className="text-muted-foreground">TB:</span> {Number(caseData.tb_percent)}%</div>}
              <div><span className="text-muted-foreground">Extra tim sålda:</span> {caseData.extra_hours_sold}</div>
              <div><span className="text-muted-foreground">Extra tim begärda:</span> {caseData.extra_hours_requested}</div>
              <div><span className="text-muted-foreground">Extra tim godkända:</span> {caseData.extra_hours_approved}</div>
            </div>
            {caseData.google_drive_link && (
              <a href={caseData.google_drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Google Drive
              </a>
            )}
          </section>

          {/* Actions based on role and status */}
          <section className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Åtgärder</h3>

            {!isSeller && caseData.status === 'vantar_km' && (
              <div className="space-y-2">
                <Label>Boka KM-datum</Label>
                <Input type="date" value={kmDate} onChange={(e) => setKmDate(e.target.value)} />
                <Button disabled={!kmDate || kmBookMutation.isPending} onClick={() => kmBookMutation.mutate()} size="sm">{kmBookMutation.isPending ? 'Sparar...' : 'Boka kontrollmätning'}</Button>
              </div>
            )}

            {!isSeller && caseData.status === 'km_bokad' && (
              <div className="space-y-2">
                <Label>Extra timmar begärda</Label>
                <Input type="number" value={extraHoursReq} onChange={(e) => setExtraHoursReq(e.target.value)} />
                <Label>Anteckning</Label>
                <Textarea value={kmNote} onChange={(e) => setKmNote(e.target.value)} rows={2} />
                <Button disabled={kmReportMutation.isPending} onClick={() => kmReportMutation.mutate()} size="sm">{kmReportMutation.isPending ? 'Sparar...' : 'Rapportera KM klar'}</Button>
              </div>
            )}

            {!isSeller && caseData.status === 'montage_bokat' && (
              <Button disabled={statusMutation.isPending} onClick={() => changeStatus('montage_klart', 'Montage klart.')} size="sm">{statusMutation.isPending ? 'Sparar...' : 'Montage klart'}</Button>
            )}

            {isSeller && (caseData.status === 'km_klar' || caseData.status === 'vantar_godkannande') && (
              <div className="space-y-3 rounded-lg border p-3">
                <h4 className="text-sm font-semibold">KM Klar — Granska & Boka montage</h4>
                {/* Show KM report from case_events */}
                {events?.filter(e => e.event_type === 'km_report' || e.event_type === 'hours_request').slice(0, 1).map(e => (
                  <div key={e.id} className="text-sm bg-muted p-2 rounded">
                    <p className="text-card-foreground">{e.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">— {e.created_by}, {new Date(e.created_at).toLocaleDateString('sv-SE')}</p>
                  </div>
                ))}

                {/* Extra hours status display */}
                {caseData.extra_hours_requested > 0 && caseData.extra_hours_approved > 0 && (
                  <div className="rounded bg-primary/10 p-2">
                    <p className="text-sm font-medium text-primary">✅ Extra timmar godkända: {caseData.extra_hours_approved} st</p>
                  </div>
                )}

                {caseData.extra_hours_requested > 0 && caseData.extra_hours_approved === 0 && caseData.status === 'vantar_godkannande' && (
                  <div className="space-y-2 rounded bg-destructive/10 p-2">
                    <p className="text-sm font-medium text-destructive">⚠ {caseData.extra_hours_requested} extra timmar begärda</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" disabled={approveHoursMutation.isPending || rejectHoursMutation.isPending} onClick={() => approveHoursMutation.mutate()}>
                        {approveHoursMutation.isPending ? 'Sparar...' : 'Godkänn extra timmar'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={approveHoursMutation.isPending || rejectHoursMutation.isPending} onClick={() => rejectHoursMutation.mutate()}>
                        {rejectHoursMutation.isPending ? 'Sparar...' : 'Avslå'}
                      </Button>
                    </div>
                  </div>
                )}

                {caseData.extra_hours_requested > 0 && caseData.extra_hours_approved === 0 && caseData.status !== 'vantar_godkannande' && (
                  <div className="rounded bg-muted p-2">
                    <p className="text-sm font-medium text-muted-foreground">❌ Extra timmar avslagna. Begärda: {caseData.extra_hours_requested} st</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Montör för montage</Label>
                  <Select value={approvalMontor} onValueChange={setApprovalMontor}>
                    <SelectTrigger><SelectValue placeholder="Välj montör" /></SelectTrigger>
                    <SelectContent>
                      {MONTORS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Montagedatum</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !approvalDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {approvalDate ? format(approvalDate, 'yyyy-MM-dd') : 'Välj datum'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={approvalDate} onSelect={setApprovalDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Anteckning (valfritt)</Label>
                  <Textarea value={approvalNote} onChange={e => setApprovalNote(e.target.value)} rows={2} placeholder="Eventuell kommentar..." />
                </div>

                <Button
                  size="sm"
                  className="w-full bg-primary"
                  disabled={!approvalMontor || !approvalDate || approvalMutation.isPending}
                  onClick={() => approvalMutation.mutate()}
                >
                  {approvalMutation.isPending ? 'Sparar...' : 'Godkänn och boka montage'}
                </Button>
              </div>
            )}

            {isSeller && (caseData.status === 'godkand' || caseData.status === 'i_produktion') && (
              <Button disabled={statusMutation.isPending} onClick={() => changeStatus('leverans_klar', 'Markerad som leverans klar')} size="sm">{statusMutation.isPending ? 'Sparar...' : 'Markera leverans klar'}</Button>
            )}

            {isSeller && caseData.status === 'leverans_klar' && (
              <Button disabled={statusMutation.isPending} onClick={() => changeStatus('montage_bokat', 'Montage bokat')} size="sm">{statusMutation.isPending ? 'Sparar...' : 'Boka montage'}</Button>
            )}

            {isSeller && caseData.status === 'montage_klart' && (
              <Button disabled={statusMutation.isPending} onClick={() => changeStatus('fakturerad', 'Markerad som fakturerad')} size="sm">{statusMutation.isPending ? 'Sparar...' : 'Markera fakturerad'}</Button>
            )}

            <Button variant="outline" size="sm" className="border-orange-400 text-orange-700 hover:bg-orange-50" onClick={() => setShowDeviation(true)}>
              <AlertTriangle className="h-4 w-4 mr-1" /> Rapportera problem
            </Button>
          </section>

          {/* Costs */}
          {costs && costs.length > 0 && (
            <section className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Receipt className="h-4 w-4" /> Kostnader ({costs.length})
              </h3>
              {costs.map(c => (
                <div key={c.id} className="rounded-lg border p-2 text-sm flex justify-between items-start">
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
                Totalt: {costs.reduce((sum, c) => sum + Number(c.amount), 0).toLocaleString('sv-SE')} kr
              </div>
            </section>
          )}

          {/* Deviations */}
          {deviations && deviations.length > 0 && (
            <section className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> Avvikelser ({deviations.length})
              </h3>
              {deviations.map((d) => (
                <div key={d.id} className="rounded-lg border p-2 text-sm space-y-1">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-1.5 items-center">
                      <Badge variant={d.resolved ? 'secondary' : 'destructive'}>
                        {DEVIATION_TYPES.find((dt) => dt.value === d.type)?.label || d.type}
                      </Badge>
                      <Badge variant={d.resolved ? 'secondary' : 'destructive'} className={d.resolved ? 'bg-green-100 text-green-800 border-green-300' : ''}>
                        {d.resolved ? 'Löst' : 'Olöst'}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString('sv-SE')}</span>
                  </div>
                  <p className="text-card-foreground">{d.description}</p>
                  <p className="text-muted-foreground">Ansvar: {DEVIATION_RESPONSIBLE.find((r) => r.value === d.responsible)?.label || d.responsible}</p>
                  {d.image_urls && (d.image_urls as string[]).length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-1">
                      {(d.image_urls as string[]).map((url, i) => (
                        <button key={i} onClick={() => setFullscreenImg(url)} className="w-14 h-14 rounded overflow-hidden border hover:ring-2 ring-primary">
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

          {/* Notes */}
          <section className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Anteckning</h3>
            <div className="flex gap-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="flex-1" placeholder="Skriv en anteckning..." />
              <Button size="sm" disabled={!note || noteMutation.isPending} onClick={() => noteMutation.mutate()}>{noteMutation.isPending ? 'Sparar...' : 'Spara'}</Button>
            </div>
          </section>

          {/* Event log */}
          <section className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-4 w-4" /> Historik
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events?.map((e) => (
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

          {/* Delete case - seller only */}
          {isSeller && (
            <section className="p-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start">
                    <Trash2 className="h-4 w-4 mr-2" /> Radera ärende
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Radera ärende</AlertDialogTitle>
                    <AlertDialogDescription>
                      Är du säker på att du vill radera ärendet <strong>{caseData.address}</strong>? Detta går inte att ångra.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate()}
                    >
                      {deleteMutation.isPending ? 'Raderar...' : 'Radera'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </section>
          )}
        </div>
      </div>
      {/* Fullscreen image dialog */}
      <Dialog open={!!fullscreenImg} onOpenChange={() => setFullscreenImg(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2">
          {fullscreenImg && <img src={fullscreenImg} alt="" className="w-full h-full object-contain" />}
        </DialogContent>
      </Dialog>

      {/* Rapportera problem drawer */}
      <Drawer open={showDeviation} onOpenChange={setShowDeviation}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Rapportera problem</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-4 pb-4">
            <div>
              <Label>Typ</Label>
              <Select value={devForm.type} onValueChange={(v) => setDevForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue placeholder="Välj typ" /></SelectTrigger>
                <SelectContent>
                  {DEVIATION_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Problembeskrivning *</Label>
              <Textarea value={devForm.description} onChange={e => setDevForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Beskriv problemet..." />
            </div>
            {devForm.type === 'reklamation' && (
              <div>
                <Label>Prioritet</Label>
                <div className="flex gap-2 mt-1">
                  {(['hog', 'medium', 'lag'] as const).map(p => (
                    <Button key={p} type="button" size="sm" variant={probPriority === p ? 'default' : 'outline'} onClick={() => setProbPriority(p)}>
                      {p === 'hog' ? 'Hög' : p === 'medium' ? 'Medium' : 'Låg'}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Ansvar</Label>
              <Select value={devForm.responsible} onValueChange={(v) => setDevForm(f => ({ ...f, responsible: v }))}>
                <SelectTrigger><SelectValue placeholder="Välj ansvarig" /></SelectTrigger>
                <SelectContent>
                  {DEVIATION_RESPONSIBLE.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bifoga bilder (max 5)</Label>
              <div className="mt-1">
                <label className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-muted">
                  <Camera className="h-4 w-4" /> Välj bilder
                  <input type="file" accept="image/jpeg,image/png,image/heic" multiple className="hidden" onChange={handleFileSelect} />
                </label>
              </div>
              {probFiles.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {probFiles.map((f, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setProbFiles(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-foreground/60 text-background rounded-bl-lg p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DrawerFooter>
            <Button
              disabled={!devForm.type || !devForm.description || problemMutation.isPending}
              onClick={() => problemMutation.mutate()}
            >
              {problemMutation.isPending ? 'Sparar...' : 'Skapa ärende'}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Avbryt</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
