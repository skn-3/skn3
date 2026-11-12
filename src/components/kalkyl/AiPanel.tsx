// Panelen "AI-kontroll": tolka underlag, kontroller med AI-granskning och fråga om offerten.
// AI:n föreslår, säljaren bestämmer: ingenting ändras i kalkylen förrän säljaren trycker. Komponenten räknar inget själv.
import { useMemo, useRef, useState } from 'react';
import { Camera, Check, FileText, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  AI_TEXT, aiPdfError, aiRowSummary, aiRowTitle, applyAiRow, applyAiSuggestion, buildAiContext, findCustomerData, KALKYL_AI_LIMITS, proposalStatus,
  roomOf, rowTypeLabel, validateAiAnswer, validateAiProposal, validateAiReview,
  type AiObservation, type AiProposal, type CustomerFields, type KalkylData, type Kontroll, type KontrollFix, type KalkylSettings, type PriceIndex, type PriceItem,
} from '@/lib/kalkyl';
import { KontrollCard } from './SummaryAside';
import { callKalkylAi, pdfToBase64, photoToJpeg } from './aiApi';

type Pending = null | 'tolka' | 'granska' | 'fraga';

function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {children && <p className="text-sm text-muted-foreground mt-0.5">{children}</p>}
    </div>
  );
}
const Waiting = ({ text }: { text: string }) => (
  <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{text}</p>
);
const ErrorText = ({ text }: { text: string }) => (
  <p className="rounded-lg border border-border bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">{text}</p>
);
const Tag = ({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'success' | 'gold' }) => (
  <span className={cn('inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
    tone === 'success' ? 'bg-success-soft text-success' : tone === 'gold' ? 'bg-gold/20 text-gold-ink' : 'bg-muted text-muted-foreground')}>{children}</span>
);

export function AiPanel({ open, onOpenChange, data, items, prices, settings, kontroller, customer, readOnly, onChange, onShowRow, onOpenRow, onFix }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  data: KalkylData; items: PriceItem[]; prices: PriceIndex; settings: KalkylSettings; kontroller: Kontroll[]; customer: CustomerFields; readOnly: boolean;
  onChange: (fn: (d: KalkylData) => KalkylData) => void;
  onShowRow: (rowId: string) => void; onOpenRow: (rowId: string) => void; onFix: (fix: KontrollFix, rowId?: string) => void;
}) {
  const isMobile = useIsMobile();
  const [pending, setPending] = useState<Pending>(null);

  // Tolka underlag
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [pdf, setPdf] = useState<{ name: string; base64: string } | null>(null);
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [tolkaError, setTolkaError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);

  // Granskning
  const [observations, setObservations] = useState<AiObservation[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [obsAdded, setObsAdded] = useState<Set<string>>(new Set());
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Fråga
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const status = useMemo(() => (proposal ? proposalStatus(proposal, data) : {}), [proposal, data]);
  const context = () => buildAiContext(data, items);
  const blockedBy = (text: string) => {
    const found = findCustomerData(text, customer);
    return found.length ? `Ta bort kunduppgifter innan du skickar (${found.join(', ')}).` : null;
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = KALKYL_AI_LIMITS.photos - photos.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) toast.info(`Högst ${KALKYL_AI_LIMITS.photos} foton.`);
    const out: string[] = [];
    for (const f of list) {
      try { out.push(await photoToJpeg(f)); } catch { toast.error('Ett foto kunde inte läsas.'); }
    }
    setPhotos(p => [...p, ...out].slice(0, KALKYL_AI_LIMITS.photos));
  };
  const addPdf = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const err = aiPdfError(f);
    if (err) { toast.error(err); return; }
    try { setPdf({ name: f.name, base64: await pdfToBase64(f) }); } catch { toast.error('UE-offerten kunde inte läsas.'); }
  };

  const tolka = async () => {
    setTolkaError(null);
    const blocked = blockedBy(note);
    if (blocked) { setTolkaError(blocked); return; }
    if (!note.trim() && photos.length === 0 && !pdf) { setTolkaError('Skriv en anteckning eller lägg till ett foto eller en UE-offert.'); return; }
    setPending('tolka');
    const res = await callKalkylAi<{ proposal?: unknown }>({ mode: 'tolka', context: context(), note, photos, pdf });
    setPending(null);
    if (!res.ok) { setTolkaError(res.message); return; }
    const v = validateAiProposal(res.data.proposal, prices);
    if (!v.ok) { setTolkaError(AI_TEXT.failed); return; }
    setProposal(v.proposal);
    setAdded(new Set());
  };
  const addRow = (rowId: string) => {
    const row = proposal?.rows.find(r => r.id === rowId);
    if (!row || !proposal || readOnly) return;
    onChange(d => applyAiRow(d, row, proposal, prices, settings));
    setAdded(s => new Set(s).add(rowId));
    toast.success(`${aiRowTitle(row)} är tillagd`);
  };

  const granska = async () => {
    setReviewError(null);
    setPending('granska');
    const res = await callKalkylAi<{ review?: unknown }>({ mode: 'granska', context: context(), kontroller: kontroller.map(k => ({ id: k.id, title: k.title })) });
    setPending(null);
    if (!res.ok) { setReviewError(res.message); return; }
    setObservations(validateAiReview(res.data.review, data, prices));
    setDismissed(new Set());
    setObsAdded(new Set());
  };
  const addSuggestion = (obs: AiObservation) => {
    if (readOnly) return;
    onChange(d => applyAiSuggestion(d, obs, prices));
    setObsAdded(s => new Set(s).add(obs.id));
    toast.success('Raden är tillagd');
  };

  const fraga = async () => {
    setAskError(null);
    const q = question.trim();
    if (!q) return;
    const blocked = blockedBy(q);
    if (blocked) { setAskError(blocked); return; }
    setPending('fraga');
    setAnswer(null);
    const res = await callKalkylAi<{ answer?: unknown }>({ mode: 'fraga', context: context(), question: q });
    setPending(null);
    if (!res.ok) { setAskError(res.message); return; }
    const a = validateAiAnswer(res.data.answer);
    if (!a) setAskError(AI_TEXT.failed); else setAnswer(a);
  };

  const rowLabel = (rowId: string) => {
    const row = data.rows.find(r => r.id === rowId);
    if (!row) return '';
    const room = roomOf(data, row);
    return `${room?.name ?? row.title} · ${row.trade === 'fri' && !row.gren ? row.title : rowTypeLabel(row)}`;
  };
  const shownObs = (observations ?? []).filter(o => !dismissed.has(o.id));
  const busy = pending !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={cn('overflow-y-auto', isMobile ? 'max-h-[92dvh]' : 'w-full sm:max-w-xl')}>
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-2xl">AI-kontroll</SheetTitle>
          <SheetDescription>Kontrollen föreslår, du bestämmer. Inget ändras i offerten förrän du trycker.</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-8">
          {readOnly && (
            <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">Offerten är skrivskyddad. Du kan ställa frågor om den men inte lägga till rader.</p>
          )}

          {!readOnly && (
            <section aria-label="Tolka underlag" className="space-y-3">
              <SectionHead title="Tolka underlag">Anteckningar, foton och underentreprenörens offert blir förslag på rader.</SectionHead>
              <div className="space-y-1.5">
                <Label htmlFor="ai-note">Anteckning från platsbesöket</Label>
                <Textarea id="ai-note" rows={5} className="text-base" value={note} maxLength={KALKYL_AI_LIMITS.note} onChange={e => setNote(e.target.value)} disabled={busy} />
                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>Skriv inte personnummer eller andra kunduppgifter i anteckningen.</span>
                  <span className="font-mono tabular-nums whitespace-nowrap">{note.length} / {KALKYL_AI_LIMITS.note}</span>
                </div>
              </div>
              {(photos.length > 0 || pdf) && (
                <div className="flex flex-wrap gap-2">
                  {photos.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt={`Foto ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-border" />
                      <button type="button" aria-label={`Ta bort foto ${i + 1}`} onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}
                        className="absolute -right-3 -top-3 h-11 w-11 flex items-center justify-center">
                        <span className="h-6 w-6 rounded-full bg-foreground text-background flex items-center justify-center"><X className="h-3.5 w-3.5" aria-hidden="true" /></span>
                      </button>
                    </div>
                  ))}
                  {pdf && (
                    <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-card pl-3 text-sm min-h-[44px]">
                      <FileText className="h-4 w-4" aria-hidden="true" /><span className="max-w-[180px] truncate">{pdf.name}</span>
                      <button type="button" aria-label="Ta bort UE-offerten" onClick={() => setPdf(null)} className="h-11 w-11 flex items-center justify-center"><X className="h-4 w-4" aria-hidden="true" /></button>
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input ref={photoInput} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true"
                  onChange={e => { addPhotos(e.target.files); e.target.value = ''; }} />
                <input ref={pdfInput} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true"
                  onChange={e => { addPdf(e.target.files); e.target.value = ''; }} />
                <Button type="button" variant="outline" className="min-h-[44px]" disabled={busy || photos.length >= KALKYL_AI_LIMITS.photos} onClick={() => photoInput.current?.click()}>
                  <Camera className="h-4 w-4 mr-2" aria-hidden="true" />Fota
                </Button>
                <Button type="button" variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => pdfInput.current?.click()}>
                  <FileText className="h-4 w-4 mr-2" aria-hidden="true" />UE-offert
                </Button>
                <Button type="button" className="min-h-[44px] ml-auto" disabled={busy} onClick={tolka}>
                  <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />Tolka
                </Button>
              </div>
              {pending === 'tolka' && <Waiting text="Tolkar underlaget" />}
              {tolkaError && <ErrorText text={tolkaError} />}
              {proposal && pending !== 'tolka' && (
                <div className="space-y-3">
                  <h4 className="font-semibold">Förslag</h4>
                  {proposal.rows.length === 0 ? <p className="text-sm text-muted-foreground">{AI_TEXT.empty}</p> : (
                    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                      {proposal.rows.map(r => {
                        const isAdded = added.has(r.id);
                        const exists = !isAdded && status[r.id] === 'finns';
                        return (
                          <li key={r.id} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{aiRowTitle(r)}</div>
                              <div className="text-sm">{aiRowSummary(r, prices)}</div>
                              {r.reason && <div className="text-sm text-muted-foreground mt-0.5">{r.reason}</div>}
                            </div>
                            <div className="shrink-0">
                              {isAdded ? <Tag tone="success"><Check className="h-3.5 w-3.5" aria-hidden="true" />Tillagd</Tag>
                                : exists ? <Tag>Finns redan</Tag>
                                : <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => addRow(r.id)}>Lägg till</Button>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {proposal.questions.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm">Frågor från AI-kontrollen</h4>
                      <ul className="mt-1 list-disc pl-5 text-sm space-y-0.5">{proposal.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Priser hämtas från prislistan. Saknas ett pris lämnas det tomt.</p>
                </div>
              )}
            </section>
          )}

          {!readOnly && (
            <section aria-label="Kontroller" className="space-y-3">
              <SectionHead title="Kontroller" />
              <KontrollCard data={data} kontroller={kontroller} onShowRow={onShowRow} onFix={onFix} />
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-display text-lg font-semibold">AI-granskning</h4>
                    <p className="text-sm text-muted-foreground">AI-förslag stoppar aldrig utskick.</p>
                  </div>
                  <Button type="button" variant="outline" className="min-h-[44px]" disabled={busy || data.rows.length === 0} onClick={granska}>Granska kalkylen</Button>
                </div>
                {pending === 'granska' && <Waiting text="Granskar kalkylen" />}
                {reviewError && <ErrorText text={reviewError} />}
                {observations && pending !== 'granska' && (shownObs.length === 0
                  ? <p className="text-sm text-muted-foreground">Inga iakttagelser utöver kontrollerna.</p>
                  : (
                    <ul className="divide-y divide-border">
                      {shownObs.map(o => {
                        const item = o.suggestion?.type === 'add_line' ? prices[o.suggestion.code] : undefined;
                        const done = obsAdded.has(o.id);
                        return (
                          <li key={o.id} className="py-3 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2"><Tag tone="gold">AI-förslag</Tag><span className="text-xs text-muted-foreground">{rowLabel(o.row_id)}</span></div>
                            <div className="font-semibold">{o.title}</div>
                            {o.text && <p className="text-sm">{o.text}</p>}
                            {item && o.suggestion?.type === 'add_line' && (
                              <p className="text-sm text-muted-foreground">Förslag: {item.name}, {o.suggestion.qty.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} {item.unit}</p>
                            )}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {item && (done
                                ? <Tag tone="success"><Check className="h-3.5 w-3.5" aria-hidden="true" />Tillagd</Tag>
                                : <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => addSuggestion(o)}>Lägg till</Button>)}
                              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => onOpenRow(o.row_id)}>Öppna raden</Button>
                              <Button type="button" variant="ghost" className="min-h-[44px]" onClick={() => setDismissed(s => new Set(s).add(o.id))}>Avfärda</Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ))}
              </div>
            </section>
          )}

          <section aria-label="Fråga om offerten" className="space-y-3 pb-4">
            <SectionHead title="Fråga om offerten" />
            <div className="space-y-1.5">
              <Label htmlFor="ai-question">Din fråga</Label>
              <Textarea id="ai-question" rows={2} className="text-base" value={question} maxLength={KALKYL_AI_LIMITS.question} onChange={e => setQuestion(e.target.value)} disabled={busy} />
            </div>
            <div className="flex justify-end">
              <Button type="button" className="min-h-[44px]" disabled={busy || !question.trim()} onClick={fraga}>Fråga</Button>
            </div>
            {pending === 'fraga' && <Waiting text="Söker svar i kalkylen" />}
            {askError && <ErrorText text={askError} />}
            {answer && pending !== 'fraga' && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <p className="text-sm whitespace-pre-wrap">{answer}</p>
                <p className="text-xs text-muted-foreground">Svaret bygger på kalkylen och prislistan. Kontrollera innan du lovar kunden något.</p>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
