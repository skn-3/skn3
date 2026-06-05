import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCaseById, createCaseEvent } from '@/lib/supabaseClient';
import { logActivity } from '@/lib/activityLog';
import { supabase } from '@/integrations/supabase/client';
import { useRole } from '@/hooks/useRole';
import { MONTOR_PHONES, SHEET_METAL_RECIPIENT, SHEET_METAL_CC } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Trash2, Upload, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProfileSvg } from '@/components/sheet-metal/ProfileSvg';
import { compressImageToDataUrl } from '@/lib/imageCompress';

interface ProfileLength { length_mm: number; qty: number; }
interface Measurements {
  top_mm: number; vertical_mm: number; bottom_mm: number; drip_mm: number;
  upper_angle: string; lower_angle: string; bottom_angle: string;
}
interface OrderProfile {
  id: string;
  mode: 'manual' | 'image';
  type: 'l-profil' | 'underbleck';
  color: string;
  with_gables: boolean;
  lengths: ProfileLength[];
  measurements: Measurements;
  image_data_url?: string;
  image_filename?: string;
  image_description?: string;
}

const defaultMeasurements = (type: 'l-profil' | 'underbleck'): Measurements => ({
  top_mm: type === 'l-profil' ? 5 : 7,
  vertical_mm: 44,
  bottom_mm: type === 'l-profil' ? 84 : 180,
  drip_mm: 20,
  upper_angle: '6-30°',
  lower_angle: '30°',
  bottom_angle: '88°',
});

const newProfile = (): OrderProfile => ({
  id: crypto.randomUUID(),
  mode: 'manual',
  type: 'l-profil',
  color: 'Lackad aluminium, varmvit/9010, Glans: 30, 0.8mm',
  with_gables: false,
  lengths: [{ length_mm: 1000, qty: 1 }],
  measurements: defaultMeasurements('l-profil'),
});

export default function SheetMetalOrderPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { role } = useRole();
  const queryClient = useQueryClient();

  const { data: caseData, isLoading } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => fetchCaseById(caseId!),
    enabled: !!caseId,
  });

  const [step, setStep] = useState<1 | 2>(1);
  const [profiles, setProfiles] = useState<OrderProfile[]>([newProfile()]);
  const [notes, setNotes] = useState('');
  const [montor, setMontor] = useState('');

  useEffect(() => {
    if (caseData?.team && !montor) setMontor(caseData.team);
  }, [caseData, montor]);

  const updateProfile = (id: string, patch: Partial<OrderProfile>) => {
    setProfiles(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)));
  };
  const updateMeasurement = (id: string, key: keyof Measurements, value: string | number) => {
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, measurements: { ...p.measurements, [key]: value } } : p));
  };
  const updateLength = (pid: string, idx: number, key: 'length_mm' | 'qty', value: number) => {
    setProfiles(ps => ps.map(p => p.id === pid
      ? { ...p, lengths: p.lengths.map((l, i) => i === idx ? { ...l, [key]: value } : l) }
      : p));
  };
  const addLength = (pid: string) => {
    setProfiles(ps => ps.map(p => p.id === pid ? { ...p, lengths: [...p.lengths, { length_mm: 1000, qty: 1 }] } : p));
  };
  const removeLength = (pid: string, idx: number) => {
    setProfiles(ps => ps.map(p => p.id === pid ? { ...p, lengths: p.lengths.filter((_, i) => i !== idx) } : p));
  };

  const handleTypeChange = (id: string, t: 'l-profil' | 'underbleck') => {
    updateProfile(id, { type: t, measurements: defaultMeasurements(t) });
  };

  const handleImageSelect = async (id: string, file: File) => {
    try {
      const dataUrl = await compressImageToDataUrl(file, 1200, 0.82);
      updateProfile(id, { image_data_url: dataUrl, image_filename: file.name });
    } catch (e) {
      toast.error('Kunde inte läsa bilden');
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!caseData || !role) throw new Error('Saknar data');
      const payload = {
        to: SHEET_METAL_RECIPIENT,
        cc: SHEET_METAL_CC,
        delivery_address: caseData.address,
        montor_name: montor || 'Ej angiven',
        montor_phone: MONTOR_PHONES[montor] || '',
        notes,
        created_by: role.name,
        profiles: profiles.map(p => ({
          mode: p.mode,
          type: p.type,
          color: p.color,
          with_gables: p.with_gables,
          lengths: p.lengths,
          measurements: p.mode === 'manual' ? p.measurements : undefined,
          image_data_url: p.mode === 'image' ? p.image_data_url : undefined,
          image_filename: p.mode === 'image' ? p.image_filename : undefined,
          image_description: p.mode === 'image' ? p.image_description : undefined,
        })),
      };

      const { error: fnErr } = await supabase.functions.invoke('send-sheet-metal-order', { body: payload });
      if (fnErr) throw fnErr;

      const { error: insErr } = await supabase.from('sheet_metal_orders').insert({
        case_id: caseData.id,
        created_by: role.name,
        status: 'skickad',
        delivery_address: caseData.address,
        montor_name: montor,
        montor_phone: MONTOR_PHONES[montor] || null,
        notes,
        profiles: payload.profiles.map(p => ({ ...p, image_data_url: p.image_data_url ? '[bifogad]' : undefined })) as any,
      });
      if (insErr) throw insErr;

      await createCaseEvent({
        case_id: caseData.id,
        event_type: 'sheet_metal_order',
        description: `L-Profil/Underbleck beställd — ${profiles.length} profil${profiles.length === 1 ? '' : 'er'} skickade till plåtslagare`,
        created_by: role.name,
      });
    },
    onSuccess: () => {
      toast.success('Beställning skickad till plåtslagaren');
      queryClient.invalidateQueries({ queryKey: ['sheet_metal_orders', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case_events', caseId] });
      navigate(-1);
    },
    onError: (e: Error) => toast.error('Kunde inte skicka: ' + e.message),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!caseData) return <div className="p-8">Ärendet hittades inte.</div>;

  const canProceed = profiles.every(p => {
    if (p.lengths.length === 0) return false;
    if (p.mode === 'image') return !!p.image_data_url;
    return p.measurements.vertical_mm > 0;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-card px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Beställ L-Profil / Underbleck</h1>
          <p className="text-sm text-muted-foreground">{caseData.address}</p>
        </div>
        <Badge variant={step === 1 ? 'default' : 'secondary'}>Steg {step}/2</Badge>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        {step === 1 && (
          <>
            <Card className="p-4 bg-muted/40">
              <div className="text-sm">
                <strong>Leveransadress:</strong> {caseData.address}<br />
                <strong>Montör:</strong> {montor || caseData.team || '—'} {MONTOR_PHONES[montor] && <span className="text-muted-foreground">— Tel: {MONTOR_PHONES[montor]}</span>}
              </div>
            </Card>

            {profiles.map((p, idx) => (
              <Card key={p.id} className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Profil {idx + 1}</h2>
                  {profiles.length > 1 && (
                    <Button variant="ghost" size="sm" className="text-destructive"
                      onClick={() => setProfiles(ps => ps.filter(x => x.id !== p.id))}>
                      <Trash2 className="h-4 w-4 mr-1" /> Ta bort profil
                    </Button>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Inmatning</Label>
                  <RadioGroup value={p.mode} onValueChange={(v) => updateProfile(p.id, { mode: v as 'manual' | 'image' })}
                    className="flex gap-4 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="manual" /> <span className="text-sm">Ange mått manuellt</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="image" /> <span className="text-sm">Ladda upp skiss</span>
                    </label>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Typ</Label>
                  <RadioGroup value={p.type} onValueChange={(v) => handleTypeChange(p.id, v as 'l-profil' | 'underbleck')}
                    className="flex gap-4 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="l-profil" /> <span className="text-sm">L-Profil</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="underbleck" /> <span className="text-sm">Underbleck</span>
                    </label>
                  </RadioGroup>
                </div>

                {p.mode === 'manual' ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <Label>Övre kant (mm)</Label>
                        <Input type="number" value={p.measurements.top_mm}
                          onChange={e => updateMeasurement(p.id, 'top_mm', Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>Vertikal höjd (mm)</Label>
                        <Input type="number" value={p.measurements.vertical_mm}
                          onChange={e => updateMeasurement(p.id, 'vertical_mm', Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>Horisontell botten (mm)</Label>
                        <Input type="number" value={p.measurements.bottom_mm}
                          onChange={e => updateMeasurement(p.id, 'bottom_mm', Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>Droppläpp (mm)</Label>
                        <Input type="number" value={p.measurements.drip_mm}
                          onChange={e => updateMeasurement(p.id, 'drip_mm', Number(e.target.value))} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Övre vinkel</Label>
                          <Input value={p.measurements.upper_angle}
                            onChange={e => updateMeasurement(p.id, 'upper_angle', e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs">Nedre vinkel</Label>
                          <Input value={p.measurements.lower_angle}
                            onChange={e => updateMeasurement(p.id, 'lower_angle', e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs">Bottenvinkel</Label>
                          <Input value={p.measurements.bottom_angle}
                            onChange={e => updateMeasurement(p.id, 'bottom_angle', e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Skiss (live)</Label>
                      <ProfileSvg m={p.measurements} type={p.type} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label>Skiss / bild</Label>
                      <div className="mt-1 flex items-center gap-3">
                        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md border border-input hover:bg-accent text-sm">
                          <Upload className="h-4 w-4" /> {p.image_data_url ? 'Byt bild' : 'Välj bild'}
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(p.id, f); e.currentTarget.value = ''; }} />
                        </label>
                        {p.image_filename && <span className="text-xs text-muted-foreground">{p.image_filename}</span>}
                      </div>
                      {p.image_data_url && (
                        <img src={p.image_data_url} alt="skiss" className="mt-2 max-h-64 rounded border" />
                      )}
                    </div>
                    <div>
                      <Label>Beskrivning</Label>
                      <Textarea value={p.image_description || ''}
                        onChange={e => updateProfile(p.id, { image_description: e.target.value })}
                        placeholder='T.ex. "Underbleck, med gavlar, varmvit 9010"' rows={2} />
                    </div>
                  </div>
                )}

                <div>
                  <Label>Färg</Label>
                  <Input value={p.color} onChange={e => updateProfile(p.id, { color: e.target.value })} />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox id={`g-${p.id}`} checked={p.with_gables}
                    onCheckedChange={v => updateProfile(p.id, { with_gables: !!v })} />
                  <Label htmlFor={`g-${p.id}`} className="cursor-pointer">Med gavlar</Label>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Längder</Label>
                  <div className="space-y-2 mt-1">
                    {p.lengths.map((l, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input type="number" value={l.length_mm}
                          onChange={e => updateLength(p.id, i, 'length_mm', Number(e.target.value))}
                          className="flex-1" placeholder="Längd mm" />
                        <span className="text-muted-foreground">×</span>
                        <Input type="number" value={l.qty}
                          onChange={e => updateLength(p.id, i, 'qty', Number(e.target.value))}
                          className="w-24" placeholder="Antal" />
                        <span className="text-sm text-muted-foreground">st</span>
                        {p.lengths.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => removeLength(p.id, i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => addLength(p.id)}>
                      <Plus className="h-4 w-4 mr-1" /> Lägg till längd
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            <Button variant="outline" onClick={() => setProfiles(ps => [...ps, newProfile()])} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Lägg till profil
            </Button>

            <div className="flex justify-end pt-4">
              <Button disabled={!canProceed} onClick={() => setStep(2)}>Granska →</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Card className="p-4 space-y-2">
              <h2 className="font-bold">Sammanfattning</h2>
              <div className="text-sm">
                <strong>Leveransadress:</strong> {caseData.address}<br />
                <strong>Mottagare:</strong> {SHEET_METAL_RECIPIENT} (CC: {SHEET_METAL_CC})
              </div>
              <div>
                <Label>Montör</Label>
                <select className="block w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={montor} onChange={e => setMontor(e.target.value)}>
                  <option value="">Välj montör</option>
                  {Object.entries(MONTOR_PHONES).map(([n, ph]) => (
                    <option key={n} value={n}>{n} — {ph}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Övrig information (valfritt)</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Tilläggsinformation till plåtslagaren..." />
              </div>
            </Card>

            {profiles.map((p, idx) => (
              <Card key={p.id} className="p-4 space-y-3">
                <h3 className="font-bold text-primary">Profil {idx + 1} — {p.type === 'l-profil' ? 'L-Profil' : 'Underbleck'}</h3>
                <div className="text-sm space-y-1">
                  <div><strong>Färg:</strong> {p.color}</div>
                  <div><strong>Gavlar:</strong> {p.with_gables ? 'Ja' : 'Nej'}</div>
                </div>
                {p.mode === 'manual' ? (
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div>Övre kant: <strong>{p.measurements.top_mm} mm</strong></div>
                      <div>Vertikal: <strong>{p.measurements.vertical_mm} mm</strong></div>
                      <div>Botten: <strong>{p.measurements.bottom_mm} mm</strong></div>
                      <div>Droppläpp: <strong>{p.measurements.drip_mm} mm</strong></div>
                      <div>Vinklar: {p.measurements.upper_angle} / {p.measurements.lower_angle} / {p.measurements.bottom_angle}</div>
                    </div>
                    <ProfileSvg m={p.measurements} type={p.type} />
                  </div>
                ) : (
                  <div className="text-sm space-y-2">
                    <div><strong>Beskrivning:</strong> {p.image_description || '—'}</div>
                    {p.image_data_url && <img src={p.image_data_url} alt="skiss" className="max-h-48 rounded border" />}
                  </div>
                )}
                <div className="text-sm">
                  <strong>Längder:</strong> {p.lengths.map(l => `${l.length_mm}mm × ${l.qty}st`).join(', ')}
                </div>
              </Card>
            ))}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>← Tillbaka</Button>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending || !montor}>
                {submit.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Skickar...</> : <><Send className="h-4 w-4 mr-1" /> Skicka till plåtslagare</>}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
