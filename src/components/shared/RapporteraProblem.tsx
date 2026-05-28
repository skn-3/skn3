import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCaseById,
  createDeviation,
  updateDeviation,
  uploadDeviationImages,
  createCaseEvent,
  updateCase,
  sendNotificationEmail,
} from '@/lib/supabaseClient';
import {
  DEVIATION_TYPES,
  DEVIATION_RESPONSIBLE,
  COORDINATOR_EMAIL,
  COORDINATOR_CC,
} from '@/lib/constants';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Camera, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function RapporteraProblem() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useRole();
  const currentUser = role?.name || 'Okänd';

  const {
    data: caseData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => fetchCaseById(caseId!),
    enabled: !!caseId,
  });

  // Form state
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'hog' | 'medium' | 'lag'>('medium');
  const [responsible, setResponsible] = useState('');
  const [respManuallySet, setRespManuallySet] = useState(false);
  const [cost, setCost] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  // Smart suggestion for responsible based on type
  useEffect(() => {
    if (respManuallySet) return;
    const suggestion: Record<string, string> = {
      felmatning: 'montor',
      fabriksfel: 'fabrik',
      extra_material: 'fabrik',
    };
    const s = suggestion[type];
    if (s && responsible !== s) setResponsible(s);
  }, [type, respManuallySet]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const allowed = picked.filter((f) => /\.(jpe?g|png|heic)$/i.test(f.name));
    setFiles((prev) => [...prev, ...allowed].slice(0, 5));
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const buildRows = (typLabel: string, isReklam: boolean) => {
    const badgeMap: Record<string, { color: string; bg: string }> = {
      hog: { color: '#991B1B', bg: '#FEE2E2' },
      medium: { color: '#92400E', bg: '#FEF3C7' },
      lag: { color: '#374151', bg: '#F3F4F6' },
    };
    const rows: Array<{ label: string; value: string; badge?: { color: string; bg: string } }> = [
      { label: 'Adress', value: caseData!.address },
      { label: 'Kund', value: caseData!.customer_name },
      { label: 'Rapporterad av', value: currentUser },
      { label: 'Typ', value: typLabel },
    ];
    if (isReklam) {
      const pLabel = priority === 'hog' ? 'Hög' : priority === 'medium' ? 'Medium' : 'Låg';
      rows.push({ label: 'Prioritet', value: pLabel, badge: badgeMap[priority] });
    }
    rows.push({ label: 'Beskrivning', value: description });
    return rows;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!caseData) throw new Error('Ärendet är inte laddat');
      if (!type) throw new Error('Välj typ');
      if (!description.trim()) throw new Error('Beskriv problemet');
      if (!responsible) throw new Error('Välj ansvarig');

      const isReklam = type === 'reklamation';
      const descWithPriority = isReklam
        ? `[${priority.toUpperCase()}] ${description}`
        : description;

      const deviation = await createDeviation({
        case_id: caseData.id,
        type,
        description: descWithPriority,
        responsible,
        created_by: currentUser,
        action_log: [
          { at: new Date().toISOString(), by: currentUser, action: 'Rapporterad' },
        ] as any,
      } as any);

      const updates: any = {};
      if (cost && Number(cost) > 0) updates.cost = Number(cost);

      let imageUrls: string[] = [];
      if (files.length > 0) {
        imageUrls = await uploadDeviationImages(caseData.id, deviation.id, files);
        updates.image_urls = imageUrls;
      }
      if (Object.keys(updates).length > 0) {
        await updateDeviation(deviation.id, updates);
      }

      const typLabel = DEVIATION_TYPES.find((d) => d.value === type)?.label || type;
      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'deviation',
        description: isReklam
          ? `Reklamation skapad: ${description}`
          : `Avvikelse skapad: ${typLabel} — ${description}`,
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

      // Email notification
      try {
        const rows = buildRows(typLabel, isReklam);
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

      return { deviation, isReklam, typLabel: DEVIATION_TYPES.find((d) => d.value === type)?.label || type };
    },
    onSuccess: ({ deviation, isReklam, typLabel }) => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['deviations', caseId] });
      queryClient.invalidateQueries({ queryKey: ['deviations_bulk'] });
      queryClient.invalidateQueries({ queryKey: ['case_events', caseId] });
      logActivity({
        action: 'deviation_created',
        category: 'deviation',
        description: `${isReklam ? 'Reklamation' : 'Avvikelse'} skapad: ${typLabel} — ${description.slice(0, 80)}`,
        case_id: caseId,
        deviation_id: deviation?.id,
        metadata: { type, responsible, priority, cost: cost ? Number(cost) : 0 },
      });
      toast.success('Problem rapporterat');
      navigate(`/?case=${caseId}`);
    },
    onError: (e: Error) => toast.error(e.message || 'Kunde inte spara'),
  });

  const goBack = () => {
    if (caseId) navigate(`/?case=${caseId}`);
    else navigate(-1);
  };

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-2 -ml-2 rounded-lg hover:bg-muted min-w-[48px] min-h-[48px] flex items-center justify-center"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-bold">Rapportera problem</h1>
        </div>
        <div className="max-w-[640px] mx-auto p-4 space-y-3">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-32 bg-muted rounded animate-pulse" />
          <div className="h-10 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError || !caseData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-2 -ml-2 rounded-lg hover:bg-muted min-w-[48px] min-h-[48px] flex items-center justify-center"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-bold">Rapportera problem</h1>
        </div>
        <div className="max-w-[640px] mx-auto p-6 text-center space-y-4">
          <p className="text-muted-foreground">Ärende ej hittat</p>
          <Button onClick={goBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" /> Tillbaka
          </Button>
        </div>
      </div>
    );
  }

  const canSave =
    !!type && !!description.trim() && !!responsible && !saveMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-3">
        <button
          onClick={goBack}
          className="p-2 -ml-2 rounded-lg hover:bg-muted min-w-[48px] min-h-[48px] flex items-center justify-center"
          aria-label="Tillbaka"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-card-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Rapportera problem
          </h1>
          <p className="text-xs text-muted-foreground truncate">{caseData.address}</p>
        </div>
      </div>

      {/* Content */}
      <div
        className="max-w-[640px] mx-auto px-4 py-4 space-y-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 140px)' }}
      >
        <div>
          <Label className="mb-1 block">Typ *</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="min-h-[48px]">
              <SelectValue placeholder="Välj typ" />
            </SelectTrigger>
            <SelectContent>
              {DEVIATION_TYPES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-1 block">Problembeskrivning *</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Beskriv problemet..."
            className="min-h-[120px]"
          />
        </div>

        <div>
          <Label className="mb-2 block">Prioritet</Label>
          <div className="flex gap-2">
            {(['hog', 'medium', 'lag'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium min-h-[48px] transition-colors ${
                  priority === p
                    ? p === 'hog'
                      ? 'bg-red-100 border-red-400 text-red-800'
                      : p === 'medium'
                      ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
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
          <Label className="mb-1 block">Ansvar *</Label>
          <Select
            value={responsible}
            onValueChange={(v) => {
              setRespManuallySet(true);
              setResponsible(v);
            }}
          >
            <SelectTrigger className="min-h-[48px]">
              <SelectValue placeholder="Välj ansvarig" />
            </SelectTrigger>
            <SelectContent>
              {DEVIATION_RESPONSIBLE.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!responsible && (
            <p className="text-xs text-destructive mt-1">
              Välj ansvarig för att kunna spara
            </p>
          )}
        </div>

        <div>
          <Label className="mb-1 block">Kostnad (kr)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0"
            className="min-h-[48px]"
          />
        </div>

        <div>
          <Label className="mb-1 block">Bifoga bilder (1–5 st)</Label>
          <label className="inline-flex items-center gap-2 px-4 py-3 border rounded-lg cursor-pointer hover:bg-muted min-h-[48px] w-full justify-center">
            <Camera className="h-5 w-5" />
            <span>
              {files.length > 0 ? `${files.length} bild(er) valda` : 'Välj bilder...'}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/heic"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
          {files.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="relative w-16 h-16 rounded-lg overflow-hidden border"
                >
                  <img
                    src={URL.createObjectURL(f)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-lg p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom action bar */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg z-20"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-[640px] mx-auto px-4 py-3 flex flex-col gap-2">
          <Button
            className="min-h-[48px] w-full"
            disabled={!canSave}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Sparar...' : 'Skapa ärende'}
          </Button>
          <Button
            variant="outline"
            className="min-h-[48px] w-full"
            onClick={goBack}
            disabled={saveMutation.isPending}
          >
            Avbryt
          </Button>
        </div>
      </div>
    </div>
  );
}
