import { useState, useRef, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Ruler, Trash2, RefreshCw, Star, Plus, ChevronDown, ChevronRight } from 'lucide-react';

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
  montor_note: string | null;
  cm_status: string;
}

const STATUS_LABEL: Record<string, { label: string; variant: 'outline' | 'secondary' | 'default' }> = {
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
}: {
  onSubmit: (payload: { image_base64?: string; mime_type?: string; text?: string }) => void;
  pending: boolean;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!file && !text.trim()) {
      toast.error('Lägg in en bild eller text först');
      return;
    }
    if (file) {
      const { base64, mime } = await fileToBase64(file);
      onSubmit({ image_base64: base64, mime_type: mime, text: text.trim() || undefined });
    } else {
      onSubmit({ text: text.trim() });
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
        Importen är additiv. Ta en skärmbild av översiktslistan för alla littera på en gång, och en skärmbild per expanderad littera för att fånga tillbehör (foder, smyg, fönsterbänk, plissé). Littera som montören redan justerat skrivs inte över.
      </div>
      <div>
        <Label>Skärmbild från KP</Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block mt-1 text-sm"
        />
        {file && <div className="text-xs text-muted-foreground mt-1">{file.name}</div>}
      </div>
      <div>
        <Label>...eller klistra in tabelltext</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Klistra in översikten eller en littera med Konfiguration från Mockfjärds KP"
          onPaste={(e) => {
            const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
            if (item) {
              const f = item.getAsFile();
              if (f) {
                e.preventDefault();
                setFile(f);
              }
            }
          }}
        />
      </div>
      <DialogFooter>
        <Button onClick={handleSubmit} disabled={pending}>
          {pending ? 'Tolkar...' : 'Importera'}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function LitterorSection({ caseId, isAdmin }: { caseId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const formatSize = (r: LitteraRow) => {
    if (!r.width && !r.height) return '—';
    const wh = `${r.width ?? '?'}×${r.height ?? '?'}`;
    return r.brostning ? `${wh} / ${r.brostning}` : wh;
  };

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
                {isAdmin && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const st = STATUS_LABEL[r.cm_status] ?? { label: r.cm_status, variant: 'outline' as const };
                const till = ((r.spec as any)?.tillbehor ?? []) as Tillbehor[];
                const isOpen = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <TableRow>
                      <TableCell className="w-8 p-2 align-top">
                        <button onClick={() => toggle(r.id)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Visa tillbehör">
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
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex justify-end">
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
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 10 : 9} className="bg-muted/30">
                          {till.length === 0 && !r.montor_note ? (
                            <div className="text-xs text-muted-foreground py-1">
                              Inga tillbehör importerade. Importera den expanderade littera-vyn från KP för att fånga foder, smyg, fönsterbänk m.m.
                            </div>
                          ) : (
                            <div className="space-y-2 py-1">
                              {till.length > 0 && (
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
                              )}
                              {r.montor_note && (
                                <div className="text-xs">
                                  <span className="text-muted-foreground">Montörens övriga justeringar: </span>{r.montor_note}
                                </div>
                              )}
                            </div>
                          )}
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
