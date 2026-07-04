import { useState, useRef, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createCaseEvent } from '@/lib/supabaseClient';
import { logActivity } from '@/lib/activityLog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Ruler, Trash2, RefreshCw, Star, Plus, ChevronDown, ChevronRight, CheckCircle2, Undo2, X } from 'lucide-react';

interface Tillbehor {
  typ: string;
  placering: string | null;
  material: string | null;
  dimension: string | null;
  matt: string | null;
  kulor: string | null;
  note: string | null;
}

interface LitteraRow {
  id: string;
  case_id: string;
  sort_order: number;
  littera: string | null;
  article_name: string | null;
  article_code: string | null;
  antal: number | null;
  u_varde: number | null;
  width: number | null;
  height: number | null;
  brostning: number | null;
  set_number: number | null;
  set_position: number | null;
  set_lead: boolean | null;
  color_inside: string | null;
  color_outside: string | null;
  spec: any | null;
  imported_snapshot: any | null;
  montor_note: string | null;
  cm_status: string;
}

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const STATUS_LABEL: Record<string, { label: string; variant: BadgeVariant }> = {
  ej_paborjad: { label: 'Ej påbörjad', variant: 'outline' },
  justerad: { label: 'Justerad', variant: 'secondary' },
  inskickad: { label: 'Inskickad', variant: 'default' },
  hanterad: { label: 'Hanterad', variant: 'default' },
};

const TILLBEHOR_LABEL: Record<string, string> = {
  foder: 'Foder', smyg: 'Smyg', fonsterbank: 'Fönsterbänk', sockellist: 'Sockellist',
  plisse: 'Plissé', l_profil: 'L-profil / plåt', ovrigt: 'Övrigt',
};
const PLACERING_LABEL: Record<string, string> = { invandig: 'Invändig', utvandig: 'Utvändig' };

const FIELD_LABELS: { key: keyof LitteraRow; label: string }[] = [
  { key: 'width', label: 'Bredd' },
  { key: 'height', label: 'Höjd' },
  { key: 'brostning', label: 'Bröstning' },
  { key: 'antal', label: 'Antal' },
  { key: 'set_number', label: 'Set-nr' },
  { key: 'set_position', label: 'Position' },
  { key: 'set_lead', label: 'Ledare' },
  { key: 'color_inside', label: 'Kulör insida' },
  { key: 'color_outside', label: 'Kulör utsida' },
];

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nej';
  return String(v);
}

function tillHead(t: Tillbehor): string {
  let s = TILLBEHOR_LABEL[t.typ] ?? t.typ;
  if (t.placering) s += ` (${PLACERING_LABEL[t.placering] ?? t.placering})`;
  return s;
}

function tillLabel(t: Tillbehor): string {
  const meta: string[] = [];
  if (t.dimension) meta.push(t.dimension);
  if (t.matt) meta.push(`${t.matt} mm`);
  if (t.material) meta.push(t.material);
  if (t.kulor) meta.push(t.kulor);
  let s = tillHead(t);
  if (meta.length) s += ' · ' + meta.join(', ');
  if (t.note) s += ` (${t.note})`;
  return s;
}

function eqTill(a: Tillbehor, b: Tillbehor): boolean {
  return (['material', 'dimension', 'matt', 'kulor', 'note'] as const).every(
    (k) => ((a as any)[k] ?? null) === ((b as any)[k] ?? null),
  );
}

type TillChange = { kind: 'added' | 'removed' | 'changed'; label: string; details?: string[] };

function diffTillbehor(orig: Tillbehor[], cur: Tillbehor[]): TillChange[] {
  const changes: TillChange[] = [];
  const left = [...cur];
  for (const o of orig) {
    let idx = left.findIndex((t) => t.typ === o.typ && (t.placering ?? null) === (o.placering ?? null) && eqTill(t, o));
    if (idx === -1) idx = left.findIndex((t) => t.typ === o.typ && (t.placering ?? null) === (o.placering ?? null));
    if (idx === -1) {
      changes.push({ kind: 'removed', label: tillLabel(o) });
    } else {
      const t = left[idx];
      left.splice(idx, 1);
      const details: string[] = [];
      const meta: [keyof Tillbehor, string][] = [['material', 'material'], ['dimension', 'dim'], ['matt', 'mått'], ['kulor', 'kulör'], ['note', 'notering']];
      for (const [k, lbl] of meta) {
        const a = (o as any)[k] ?? null;
        const b = (t as any)[k] ?? null;
        if (a !== b) details.push(`${lbl}: ${fmtVal(a)} → ${fmtVal(b)}`);
      }
      if (details.length) changes.push({ kind: 'changed', label: tillHead(o), details });
    }
  }
  for (const t of left) changes.push({ kind: 'added', label: tillLabel(t) });
  return changes;
}

function diffOverview(r: LitteraRow): string[] {
  const snap = r.imported_snapshot || {};
  const out: string[] = [];
  for (const { key, label } of FIELD_LABELS) {
    const now = (r as any)[key] ?? null;
    const orig = snap[key as string] ?? null;
    if (now !== orig) out.push(`${label}: ${fmtVal(orig)} → ${fmtVal(now)}`);
  }
  return out;
}

async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), mime: file.type || 'image/png' };
}

function ImportInputs({
  onSubmit,
  pending,
  progress,
}: {
  onSubmit: (payload: { files: File[]; text?: string }) => void;
  pending: boolean;
  progress: { done: number; total: number } | null;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (arr.length) setFiles((prev) => [...prev, ...arr]);
  }

  function handleSubmit() {
    if (files.length === 0 && !text.trim()) {
      toast.error('Lägg in minst en bild eller text först');
      return;
    }
    onSubmit({ files, text: text.trim() || undefined });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Välj flera skärmbilder på en gång — en per expanderad littera (fångar tillbehören) och/eller översiktslistan. Bilderna tolkas i tur och ordning. Importen är additiv: littera som montören redan justerat skrivs inte över.
      </p>
      <div>
        <Label>Skärmbilder från KP</Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          disabled={pending}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
          className="block mt-1 text-sm"
        />
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border px-2 py-1 text-xs">
                <span className="truncate">{f.name}</span>
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={pending}
                  className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Ta bort bild"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label>...eller klistra in (bilder eller tabelltext)</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          disabled={pending}
          placeholder="Klistra in en eller flera skärmbilder (Ctrl/Cmd+V) eller tabelltext från Mockfjärds KP"
          onPaste={(e) => {
            const imgs = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/'));
            if (imgs.length) {
              e.preventDefault();
              addFiles(imgs.map((i) => i.getAsFile()).filter(Boolean) as File[]);
            }
          }}
        />
      </div>
      <DialogFooter>
        <Button onClick={handleSubmit} disabled={pending}>
          {pending
            ? progress
              ? `Tolkar bild ${Math.min(progress.done + 1, progress.total)} av ${progress.total}...`
              : 'Tolkar...'
            : files.length > 1
              ? `Importera ${files.length} bilder`
              : 'Importera'}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function LitterorSection({ caseId, isAdmin, currentUser }: { caseId: string; isAdmin: boolean; currentUser: string }) {
  const qc = useQueryClient();
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['litteror', caseId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('litteror')
        .select('*')
        .eq('case_id', caseId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LitteraRow[];
    },
  });

  const overviewMutation = useMutation({
    mutationFn: async (payload: { image_base64?: string; mime_type?: string; text?: string }) => {
      const { data, error } = await supabase.functions.invoke('parse-littera-overview', {
        body: { case_id: caseId, ...payload },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as any).context;
          if (ctx) {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          }
        } catch {}
        throw new Error(detail);
      }
      return data;
    },
    onSuccess: (data) => {
      const a = data?.added ?? 0, u = data?.updated ?? 0, s = data?.skipped ?? 0;
      const parts: string[] = [];
      if (a) parts.push(`${a} tillagda`);
      if (u) parts.push(`${u} uppdaterade`);
      if (s) parts.push(`${s} oförändrade (skyddade)`);
      toast.success(parts.length ? `Import klar: ${parts.join(', ')}` : 'Inga littera hittades');
      setOverviewOpen(false);
      qc.invalidateQueries({ queryKey: ['litteror', caseId] });
    },
    onError: (e: Error) => toast.error(`Kunde inte importera: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('litteror').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Littera raderad');
      qc.invalidateQueries({ queryKey: ['litteror', caseId] });
    },
    onError: (e: Error) => toast.error(`Kunde inte radera: ${e.message}`),
  });

  const reimportMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('litteror').delete().eq('case_id', caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['litteror', caseId] });
      setOverviewOpen(true);
    },
    onError: (e: Error) => toast.error(`Kunde inte rensa: ${e.message}`),
  });

  const hanteradMutation = useMutation({
    mutationFn: async (row: LitteraRow) => {
      const { error } = await (supabase as any).from('litteror').update({ cm_status: 'hanterad' }).eq('id', row.id);
      if (error) throw error;
      logActivity({
        category: 'case',
        action: 'kontrollmatning_handled',
        description: `Markerade littera ${row.littera ?? ''} som hanterad`,
        case_id: caseId,
        metadata: { littera_id: row.id },
      });
      const remaining = (rows ?? []).filter((r) => r.id !== row.id && r.cm_status !== 'hanterad').length;
      if (remaining === 0) {
        await createCaseEvent({
          case_id: caseId,
          event_type: 'kontrollmatning',
          description: 'Kontrollmätning färdighanterad — alla littera införda i KP',
          created_by: currentUser,
        });
      }
    },
    onSuccess: () => {
      toast.success('Littera markerad som hanterad');
      qc.invalidateQueries({ queryKey: ['litteror', caseId] });
      qc.invalidateQueries({ queryKey: ['caseEvents', caseId] });
    },
    onError: (e: Error) => toast.error(`Kunde inte markera: ${e.message}`),
  });

  const reopenMutation = useMutation({
    mutationFn: async (row: LitteraRow) => {
      const { error } = await (supabase as any).from('litteror').update({ cm_status: 'inskickad' }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Littera återöppnad');
      qc.invalidateQueries({ queryKey: ['litteror', caseId] });
    },
    onError: (e: Error) => toast.error(`Kunde inte återöppna: ${e.message}`),
  });

  const formatSize = (r: LitteraRow) => {
    if (!r.width && !r.height) return '—';
    const wh = `${r.width ?? '?'}×${r.height ?? '?'}`;
    return r.brostning ? `${wh} / ${r.brostning}` : wh;
  };

  const inskickade = (rows ?? []).filter((r) => r.cm_status === 'inskickad').length;

  return (
    <section className="p-4 space-y-3 border-t">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Ruler className="h-4 w-4" /> Littera (kontrollmätning){rows && rows.length > 0 ? ` (${rows.length})` : ''}
        </h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOverviewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Importera littera
          </Button>
          {rows && rows.length > 0 && isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-1" /> Importera om
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Importera om från grunden?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Alla {rows.length} littera på ärendet raderas (även montörens ändringar). Detta kan inte ångras. Vanligtvis räcker "Importera littera" som lägger till och uppdaterar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction onClick={() => reimportMutation.mutate()}>Radera & importera om</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {inskickade > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {inskickade} littera inskickade av montören — granska ändringarna nedan, för in dem i Mockfjärds KP och markera som hanterade.
        </div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Laddar...</div>}

      {rows && rows.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Littera</TableHead>
                <TableHead>Artikel</TableHead>
                <TableHead>U-värde</TableHead>
                <TableHead>Antal</TableHead>
                <TableHead>Set</TableHead>
                <TableHead>Storlek</TableHead>
                <TableHead>Kulör in/ut</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const st = STATUS_LABEL[r.cm_status] ?? { label: r.cm_status, variant: 'outline' as BadgeVariant };
                const till = ((r.spec as any)?.tillbehor ?? []) as Tillbehor[];
                const origTill = ((r.imported_snapshot as any)?.tillbehor ?? []) as Tillbehor[];
                const fieldChanges = diffOverview(r);
                const tillChanges = diffTillbehor(origTill, till);
                const hasChanges = fieldChanges.length > 0 || tillChanges.length > 0 || !!(r.montor_note && r.montor_note.trim());
                const isOpen = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <TableRow className={r.cm_status === 'inskickad' ? 'bg-amber-50/50' : undefined}>
                      <TableCell className="w-8 p-2 align-top">
                        <button onClick={() => toggle(r.id)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Visa detaljer">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{r.littera || '—'}</TableCell>
                      <TableCell>
                        <div className="text-sm">{r.article_name || '—'}</div>
                        {r.article_code && <div className="text-xs text-muted-foreground">{r.article_code}</div>}
                        {till.length > 0 && <div className="text-[11px] text-muted-foreground">{till.length} tillbehör</div>}
                      </TableCell>
                      <TableCell>{r.u_varde ?? '—'}</TableCell>
                      <TableCell>{r.antal ?? '—'}</TableCell>
                      <TableCell>
                        {r.set_number != null ? (
                          <span className="inline-flex items-center gap-1">
                            {r.set_number}
                            {r.set_lead && <Star className="h-3 w-3 fill-yellow-400 text-yellow-500" />}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatSize(r)}</TableCell>
                      <TableCell className="text-xs">
                        {r.color_inside || '—'} / {r.color_outside || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Badge variant={st.variant}>{st.label}</Badge>
                          {hasChanges && r.cm_status !== 'ej_paborjad' && (
                            <span className="text-[10px] font-medium text-amber-700">Ändringar</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {(r.cm_status === 'inskickad' || r.cm_status === 'justerad') && (
                            <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" disabled={hanteradMutation.isPending} onClick={() => hanteradMutation.mutate(r)}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Hanterad
                            </Button>
                          )}
                          {r.cm_status === 'hanterad' && (
                            <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={reopenMutation.isPending} onClick={() => reopenMutation.mutate(r)}>
                              <Undo2 className="h-3.5 w-3.5 mr-1" /> Återöppna
                            </Button>
                          )}
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Radera littera {r.littera}?</AlertDialogTitle>
                                  <AlertDialogDescription>Detta kan inte ångras.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(r.id)}>Radera</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={10} className="bg-muted/30">
                          <div className="space-y-3 py-1">
                            {hasChanges ? (
                              <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 space-y-1.5">
                                <div className="text-xs font-semibold text-amber-900">Montörens ändringar (original → ändrat)</div>
                                {fieldChanges.map((c, i) => (
                                  <div key={`f${i}`} className="text-xs text-amber-900">{c}</div>
                                ))}
                                {tillChanges.map((c, i) => (
                                  <div key={`t${i}`} className="text-xs">
                                    {c.kind === 'added' && <span className="text-green-700 font-medium">Tillagt: {c.label}</span>}
                                    {c.kind === 'removed' && <span className="text-red-700 font-medium">Borttaget: {c.label}</span>}
                                    {c.kind === 'changed' && (
                                      <span className="text-amber-900"><span className="font-medium">{c.label}</span> — {c.details?.join('; ')}</span>
                                    )}
                                  </div>
                                ))}
                                {r.montor_note && r.montor_note.trim() && (
                                  <div className="text-xs text-amber-900"><span className="font-medium">Övriga justeringar:</span> {r.montor_note}</div>
                                )}
                              </div>
                            ) : (
                              (r.cm_status === 'inskickad' || r.cm_status === 'hanterad') && (
                                <div className="text-xs text-muted-foreground">Inga ändringar — montören har bekräftat littera som den är.</div>
                              )
                            )}

                            {till.length === 0 && !hasChanges && r.cm_status === 'ej_paborjad' ? (
                              <div className="text-xs text-muted-foreground">
                                Inga tillbehör importerade. Importera den expanderade littera-vyn från KP för att fånga foder, smyg, fönsterbänk m.m.
                              </div>
                            ) : till.length > 0 ? (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="py-1 pr-3 font-medium">Typ</th>
                                    <th className="pr-3 font-medium">Placering</th>
                                    <th className="pr-3 font-medium">Material</th>
                                    <th className="pr-3 font-medium">Dim</th>
                                    <th className="pr-3 font-medium">Mått</th>
                                    <th className="pr-3 font-medium">Kulör</th>
                                    <th className="font-medium">Övrigt</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {till.map((t, i) => (
                                    <tr key={i} className="border-t border-border/50">
                                      <td className="py-1 pr-3 font-medium">{TILLBEHOR_LABEL[t.typ] ?? t.typ}</td>
                                      <td className="pr-3">{t.placering ? (PLACERING_LABEL[t.placering] ?? t.placering) : '—'}</td>
                                      <td className="pr-3">{t.material ?? '—'}</td>
                                      <td className="pr-3">{t.dimension ?? '—'}</td>
                                      <td className="pr-3">{t.matt ?? '—'}</td>
                                      <td className="pr-3">{t.kulor ?? '—'}</td>
                                      <td>{t.note ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importera littera från KP</DialogTitle>
          </DialogHeader>
          <ImportInputs pending={overviewMutation.isPending} onSubmit={(p) => overviewMutation.mutate(p)} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
