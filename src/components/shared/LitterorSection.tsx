import { useState, useRef } from 'react';
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
import { Ruler, Upload, Trash2, RefreshCw, Star } from 'lucide-react';

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
  cm_status: string;
}

const STATUS_LABEL: Record<string, { label: string; variant: 'outline' | 'secondary' | 'default' }> = {
  ej_paborjad: { label: 'Ej påbörjad', variant: 'outline' },
  justerad: { label: 'Justerad', variant: 'secondary' },
  inskickad: { label: 'Inskickad', variant: 'default' },
  hanterad: { label: 'Hanterad', variant: 'default' },
};

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
      <div>
        <Label>Skärmbild från KP-översikten</Label>
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
          placeholder="Klistra in översikten från Mockfjärds KP"
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
      toast.success(`Importerade ${data?.inserted ?? 0} littera`);
      setOverviewOpen(false);
      qc.invalidateQueries({ queryKey: ['litteror', caseId] });
    },
    onError: (e: Error) => toast.error(`Kunde inte importera översikt: ${e.message}`),
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
          {rows && rows.length > 0 && isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-1" /> Importera om
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Importera om översikt?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Alla {rows.length} littera på ärendet raderas. Detta kan inte ångras.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction onClick={() => reimportMutation.mutate()}>Radera & importera om</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {(!rows || rows.length === 0) && (
            <Button size="sm" onClick={() => setOverviewOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Importera littera-översikt
            </Button>
          )}
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Laddar...</div>}

      {rows && rows.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
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
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.littera || '—'}</TableCell>
                    <TableCell>
                      <div className="text-sm">{r.article_name || '—'}</div>
                      {r.article_code && <div className="text-xs text-muted-foreground">{r.article_code}</div>}
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importera littera-översikt från KP</DialogTitle>
          </DialogHeader>
          <ImportInputs pending={overviewMutation.isPending} onSubmit={(p) => overviewMutation.mutate(p)} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
