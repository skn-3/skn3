import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCaseEvents, fetchDeviations, fetchCaseById, updateCase, createCaseEvent, createDeviation, uploadDeviationImages, updateDeviation, sendNotificationEmail } from '@/lib/supabaseClient';
import type { CaseRow } from '@/lib/supabaseClient';
import { STATUS_LABELS, DEVIATION_TYPES, DEVIATION_RESPONSIBLE, COORDINATOR_EMAIL, EMAIL_MAP } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Phone, AlertTriangle, Clock, Camera, CheckCircle2, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface Props {
  caseData: CaseRow;
  currentUser: string;
  hasUnresolvedDeviation: boolean;
  onBack: () => void;
}

export function MontorCaseDetail({ caseData: initialCaseData, currentUser, onBack }: Props) {
  const queryClient = useQueryClient();

  // Live case data that updates after mutations
  const { data: liveCaseData } = useQuery({
    queryKey: ['case', initialCaseData.id],
    queryFn: () => fetchCaseById(initialCaseData.id),
    initialData: initialCaseData,
  });
  const caseData = liveCaseData ?? initialCaseData;
  const [showReklam, setShowReklam] = useState(false);
  const [showKlar, setShowKlar] = useState(false);
  const [showDeviation, setShowDeviation] = useState(false);
  const [reklamDesc, setReklamDesc] = useState('');
  const [reklamPriority, setReklamPriority] = useState<'hog' | 'medium' | 'lag'>('medium');
  const [reklamFiles, setReklamFiles] = useState<File[]>([]);
  const [klarComment, setKlarComment] = useState('');
  const [kmDate, setKmDate] = useState('');
  const [extraHoursReq, setExtraHoursReq] = useState('0');
  const [kmNote, setKmNote] = useState('');
  const [devForm, setDevForm] = useState({ type: '', description: '', responsible: '' });
  const [devFiles, setDevFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);

  const { data: events } = useQuery({
    queryKey: ['case_events', caseData.id],
    queryFn: () => fetchCaseEvents(caseData.id),
  });

  const { data: deviations } = useQuery({
    queryKey: ['deviations', caseData.id],
    queryFn: () => fetchDeviations(caseData.id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['case', initialCaseData.id] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['case_events', caseData.id] });
    queryClient.invalidateQueries({ queryKey: ['deviations', caseData.id] });
    queryClient.invalidateQueries({ queryKey: ['deviations_bulk'] });
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

  const buildEmailBody = (type: string, desc: string, priority?: string) => {
    return `
      <h2>${type === 'reklamation' ? 'Ny reklamation' : 'Ny avvikelse'}</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;font-weight:bold">Adress:</td><td style="padding:4px 8px">${caseData.address}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Kund:</td><td style="padding:4px 8px">${caseData.customer_name}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Montör:</td><td style="padding:4px 8px">${currentUser}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Typ:</td><td style="padding:4px 8px">${type}</td></tr>
        ${priority ? `<tr><td style="padding:4px 8px;font-weight:bold">Prioritet:</td><td style="padding:4px 8px">${priority}</td></tr>` : ''}
        <tr><td style="padding:4px 8px;font-weight:bold">Beskrivning:</td><td style="padding:4px 8px">${desc}</td></tr>
      </table>
    `;
  };

  const reklamMutation = useMutation({
    mutationFn: async () => {
      // Create deviation
      const deviation = await createDeviation({
        case_id: caseData.id,
        type: 'reklamation',
        description: `[${reklamPriority.toUpperCase()}] ${reklamDesc}`,
        responsible: 'okant',
        created_by: currentUser,
      });

      // Upload images
      let imageUrls: string[] = [];
      if (reklamFiles.length > 0) {
        imageUrls = await uploadDeviationImages(caseData.id, deviation.id, reklamFiles);
        await updateDeviation(deviation.id, { image_urls: imageUrls });
      }

      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'deviation',
        description: `Reklamation skapad: ${reklamDesc}`,
        created_by: currentUser,
      });
      await updateCase(caseData.id, { status: 'pausad' });
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'status_change',
        description: 'Status ändrad till Pausad (reklamation)',
        created_by: currentUser,
      });

      // Send notification email
      try {
        const emailBody = buildEmailBody('reklamation', reklamDesc, reklamPriority) +
          (imageUrls.length > 0 ? `<p><strong>${imageUrls.length} bild(er) bifogade</strong></p>` : '');
        await sendNotificationEmail({
          to: 'mirna.malke@mockfjards.se',
          cc: 'mf@malke.se',
          subject: `NY REKLAMATION — ${caseData.address}`,
          body: emailBody,
        });
        await createCaseEvent({
          case_id: caseData.id,
          event_type: 'notification',
          description: `Mail skickat till ${COORDINATOR_EMAIL} (reklamation)`,
          created_by: currentUser,
        });
      } catch (emailErr) {
        console.error('Email notification failed:', emailErr);
      }
    },
    onSuccess: () => {
      setShowReklam(false);
      setReklamDesc('');
      setReklamPriority('medium');
      setReklamFiles([]);
      invalidate();
      toast.success('Reklamation skapad');
      onBack();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const klarMutation = useMutation({
    mutationFn: async () => {
      await updateCase(caseData.id, { status: 'montage_klart' });
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'status_change',
        description: klarComment ? `Montage klart. ${klarComment}` : 'Montage klart.',
        created_by: currentUser,
      });

      // Send MONTAGE KLART email to coordinator
      try {
        const { COORDINATOR_EMAIL, COORDINATOR_CC, EMAIL_MAP } = await import('@/lib/constants');
        await sendNotificationEmail({
          to: COORDINATOR_EMAIL,
          cc: COORDINATOR_CC,
          subject: `MONTAGE KLART — ${caseData.address}`,
          body: `
            <h2>Montage klart</h2>
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:4px 8px;font-weight:bold">Adress:</td><td style="padding:4px 8px">${caseData.address}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Kund:</td><td style="padding:4px 8px">${caseData.customer_name}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Montör:</td><td style="padding:4px 8px">${currentUser}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Datum:</td><td style="padding:4px 8px">${new Date().toLocaleDateString('sv-SE')}</td></tr>
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
        toast.warning('Status uppdaterad men mailet kunde inte skickas');
      }
    },
    onSuccess: () => {
      setShowKlar(false);
      invalidate();
      toast.success('Montage markerat som klart');
      onBack();
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

      // Send KM KLAR email to seller
      try {
        const { EMAIL_MAP } = await import('@/lib/constants');
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
        toast.warning('KM rapporterad men mailet kunde inte skickas');
      }
    },
    onSuccess: () => { invalidate(); toast.success('KM rapporterad'); },
  });

  const deviationMutation = useMutation({
    mutationFn: async () => {
      const deviation = await createDeviation({
        case_id: caseData.id,
        type: devForm.type,
        description: devForm.description,
        responsible: devForm.responsible,
        created_by: currentUser,
      });

      let imageUrls: string[] = [];
      if (devFiles.length > 0) {
        imageUrls = await uploadDeviationImages(caseData.id, deviation.id, devFiles);
        await updateDeviation(deviation.id, { image_urls: imageUrls });
      }

      const typLabel = DEVIATION_TYPES.find(d => d.value === devForm.type)?.label || devForm.type;
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'deviation',
        description: `Avvikelse skapad: ${typLabel} — ${devForm.description}`,
        created_by: currentUser,
      });

      // Send notification email
      try {
        const typLabel = DEVIATION_TYPES.find(d => d.value === devForm.type)?.label || devForm.type;
        const emailBody = buildEmailBody(typLabel, devForm.description) +
          (imageUrls.length > 0 ? `<p><strong>${imageUrls.length} bild(er) bifogade</strong></p>` : '');
        await sendNotificationEmail({
          to: 'mirna.malke@mockfjards.se',
          cc: 'mf@malke.se',
          subject: `NY AVVIKELSE — ${caseData.address}`,
          body: emailBody,
        });
        await createCaseEvent({
          case_id: caseData.id,
          event_type: 'notification',
          description: `Mail skickat till ${COORDINATOR_EMAIL} (avvikelse)`,
          created_by: currentUser,
        });
      } catch (emailErr) {
        console.error('Email notification failed:', emailErr);
      }
    },
    onSuccess: () => {
      setShowDeviation(false);
      setDevForm({ type: '', description: '', responsible: '' });
      setDevFiles([]);
      invalidate();
      toast.success('Avvikelse rapporterad');
    },
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
      <div className="flex gap-2 flex-wrap">
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
        </section>

        {/* Montage klart button */}
        {caseData.status === 'montage_bokat' && (
          <Button
            onClick={() => setShowKlar(true)}
            className="w-full min-h-[56px] text-lg font-semibold mb-4 bg-primary hover:bg-primary/90"
            size="lg"
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
              <Button disabled={!kmDate} onClick={() => kmBookMutation.mutate()} className="min-h-[48px] w-full">Boka kontrollmätning</Button>
            </div>
          )}

          {caseData.status === 'km_bokad' && (
            <div className="space-y-2">
              <Label>Extra timmar begärda</Label>
              <Input type="number" value={extraHoursReq} onChange={(e) => setExtraHoursReq(e.target.value)} className="min-h-[48px]" />
              <Label>Anteckning</Label>
              <Textarea value={kmNote} onChange={(e) => setKmNote(e.target.value)} rows={2} />
              <Button disabled={kmReportMutation.isPending} onClick={() => kmReportMutation.mutate()} className="min-h-[48px] w-full">
                {kmReportMutation.isPending ? 'Sparar...' : 'Rapportera KM klar'}
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 min-h-[48px]" onClick={() => setShowDeviation(!showDeviation)}>
              <AlertTriangle className="h-4 w-4 mr-1" /> Avvikelse
            </Button>
            <Button variant="outline" className="flex-1 min-h-[48px] border-amber-400 text-amber-700" onClick={() => setShowReklam(true)}>
              <AlertTriangle className="h-4 w-4 mr-1" /> Ny reklamation
            </Button>
          </div>

          {showDeviation && (
            <div className="space-y-2 rounded-lg border p-3">
              <Select value={devForm.type} onValueChange={(v) => setDevForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="min-h-[48px]"><SelectValue placeholder="Typ av avvikelse" /></SelectTrigger>
                <SelectContent>
                  {DEVIATION_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Textarea placeholder="Beskrivning" value={devForm.description} onChange={(e) => setDevForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              <Select value={devForm.responsible} onValueChange={(v) => setDevForm(f => ({ ...f, responsible: v }))}>
                <SelectTrigger className="min-h-[48px]"><SelectValue placeholder="Ansvarig" /></SelectTrigger>
                <SelectContent>
                  {DEVIATION_RESPONSIBLE.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div>
                <Label className="mb-1 block text-sm">Bilder (max 5)</Label>
                <label className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-muted min-h-[48px]">
                  <Camera className="h-4 w-4" />
                  <span className="text-sm">Välj bilder...</span>
                  <input type="file" accept="image/jpeg,image/png,image/heic" multiple className="hidden" onChange={(e) => handleFileSelect(e, setDevFiles, devFiles)} />
                </label>
                <FileThumbnails files={devFiles} setter={setDevFiles} />
              </div>
              <Button className="min-h-[48px] w-full" disabled={!devForm.type || !devForm.description || !devForm.responsible} onClick={() => deviationMutation.mutate()}>
                Spara avvikelse
              </Button>
            </div>
          )}
        </section>

        {/* Notes */}
        <section className="py-4 border-t space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Anteckning</h3>
          <div className="flex gap-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="flex-1" placeholder="Skriv en anteckning..." />
            <Button className="min-h-[48px]" disabled={!note} onClick={() => noteMutation.mutate()}>Spara</Button>
          </div>
        </section>

        {/* Deviations */}
        {deviations && deviations.length > 0 && (
          <section className="py-4 border-t space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Avvikelser / Reklamationer ({deviations.length})
            </h3>
            {deviations.map(d => (
              <div key={d.id} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <Badge variant={d.resolved ? 'secondary' : 'destructive'}>
                    {DEVIATION_TYPES.find(dt => dt.value === d.type)?.label || d.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString('sv-SE')}</span>
                </div>
                <p className="text-card-foreground">{d.description}</p>
                <p className="text-muted-foreground text-xs">
                  Ansvar: {DEVIATION_RESPONSIBLE.find(r => r.value === d.responsible)?.label || d.responsible} — {d.created_by}
                </p>
                {d.image_urls && (d.image_urls as string[]).length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {(d.image_urls as string[]).map((url, i) => (
                      <button key={i} onClick={() => setFullscreenImg(url)} className="w-16 h-16 rounded-lg overflow-hidden border hover:ring-2 ring-primary">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
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

      {/* Bottom sheet: Ny reklamation */}
      <Drawer open={showReklam} onOpenChange={setShowReklam}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Ny reklamation</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-4 pb-2">
            <div>
              <Label>Problembeskrivning *</Label>
              <Textarea value={reklamDesc} onChange={e => setReklamDesc(e.target.value)} rows={3} placeholder="Beskriv problemet..." />
            </div>
            <div>
              <Label className="mb-2 block">Prioritet</Label>
              <div className="flex gap-2">
                {(['hog', 'medium', 'lag'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setReklamPriority(p)}
                    className={`flex-1 py-3 rounded-lg border text-sm font-medium min-h-[48px] transition-colors ${
                      reklamPriority === p
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
              <Label className="mb-1 block">Bifoga bilder (1–5 st, jpg/png/heic)</Label>
              <label className="inline-flex items-center gap-2 px-4 py-3 border rounded-lg cursor-pointer hover:bg-muted min-h-[48px] w-full justify-center">
                <Camera className="h-5 w-5" />
                <span>{reklamFiles.length > 0 ? `${reklamFiles.length} bild(er) valda` : 'Välj bilder...'}</span>
                <input type="file" accept="image/jpeg,image/png,image/heic" multiple className="hidden" onChange={(e) => handleFileSelect(e, setReklamFiles, reklamFiles)} />
              </label>
              <FileThumbnails files={reklamFiles} setter={setReklamFiles} />
            </div>
          </div>
          <DrawerFooter>
            <Button className="min-h-[48px]" disabled={!reklamDesc.trim() || reklamMutation.isPending} onClick={() => reklamMutation.mutate()}>
              {reklamMutation.isPending ? 'Sparar...' : 'Skapa reklamation'}
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
            <Button className="min-h-[48px] bg-primary" onClick={() => klarMutation.mutate()}>
              <CheckCircle2 className="h-5 w-5 mr-2" /> Bekräfta klar
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
