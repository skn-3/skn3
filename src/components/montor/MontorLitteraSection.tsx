import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createCaseEvent, sendNotificationEmail } from '@/lib/supabaseClient';
import { logActivity } from '@/lib/activityLog';
import { COORDINATOR_EMAIL } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Ruler, Star, Send, CheckCircle2, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

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
  montor_note: string | null;
  spec: any | null;
  imported_snapshot: any | null;
  cm_status: string;
}

interface TillForm {
  typ: string;
  placering: string;
  material: string;
  dimension: string;
  matt: string;
  kulor: string;
  note: string;
  _new?: boolean;
}

const STATUS: Record<string, { label: string; variant: 'outline' | 'secondary' | 'default' | 'destructive' }> = {
  ej_paborjad: { label: 'Ej granskad', variant: 'outline' },
  justerad: { label: 'Ändrad', variant: 'secondary' },
  inskickad: { label: 'Inskickad', variant: 'default' },
  hanterad: { label: 'Hanterad', variant: 'default' },
};

const TILL_TYPES: { value: string; label: string }[] = [
  { value: 'foder', label: 'Foder' },
  { value: 'smyg', label: 'Smyg' },
  { value: 'fonsterbank', label: 'Fönsterbänk' },
  { value: 'sockellist', label: 'Sockellist' },
  { value: 'plisse', label: 'Plissé' },
  { value: 'l_profil', label: 'L-profil / plåt' },
  { value: 'ovrigt', label: 'Övrigt' },
];
const TILL_LABEL: Record<string, string> = Object.fromEntries(TILL_TYPES.map((t) => [t.value, t.label]));
const PLAC_LABEL: Record<string, string> = { invandig: 'Invändig', utvandig: 'Utvändig' };

const TRACKED: { key: keyof LitteraRow; label: string }[] = [
  { key: 'width', label: 'bredd' },
  { key: 'height', label: 'höjd' },
  { key: 'brostning', label: 'bröstning' },
  { key: 'antal', label: 'antal' },
  { key: 'set_number', label: 'set-nr' },
  { key: 'set_position', label: 'position' },
  { key: 'set_lead', label: 'ledare' },
  { key: 'color_inside', label: 'kulör insida' },
  { key: 'color_outside', label: 'kulör utsida' },
];

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function strOrNull(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

function canonTill(arr: any): string {
  const list = Array.isArray(arr) ? arr : [];
  return JSON.stringify(
    list.map((t: any) => [
      t?.typ ?? 'ovrigt', t?.placering ?? null, t?.material ?? null,
      t?.dimension ?? null, t?.matt ?? null, t?.kulor ?? null, t?.note ?? null,
    ]),
  );
}

function formToTill(f: TillForm) {
  return {
    typ: f.typ || 'ovrigt',
    placering: f.placering ? f.placering : null,
    material: strOrNull(f.material),
    dimension: strOrNull(f.dimension),
    matt: strOrNull(f.matt),
    kulor: strOrNull(f.kulor),
    note: strOrNull(f.note),
  };
}
function tillToForm(t: any): TillForm {
  return {
    typ: t?.typ || 'ovrigt',
    placering: t?.placering || '',
    material: t?.material || '',
    dimension: t?.dimension || '',
    matt: t?.matt || '',
    kulor: t?.kulor || '',
    note: t?.note || '',
  };
}
function tillEmpty(f: TillForm): boolean {
  return !f.material.trim() && !f.dimension.trim() && !f.matt.trim() && !f.kulor.trim() && !f.note.trim() && (f.typ === 'ovrigt' || f.typ === '');
}
function tillLabel(t: any): string {
  const head = [TILL_LABEL[t?.typ] ?? t?.typ ?? 'Tillbehör'];
  if (t?.placering) head.push(`(${PLAC_LABEL[t.placering] ?? t.placering})`);
  const meta: string[] = [];
  if (t?.dimension) meta.push(t.dimension);
  if (t?.matt) meta.push(`${t.matt} mm`);
  if (t?.material) meta.push(t.material);
  if (t?.kulor) meta.push(t.kulor);
  let s = head.join(' ');
  if (meta.length) s += ' · ' + meta.join(', ');
  if (t?.note) s += ` (${t.note})`;
  return s;
}

function changedFields(r: LitteraRow): string[] {
  const snap = r.imported_snapshot || {};
  const diff = TRACKED.filter(({ key }) => {
    const now = r[key];
    const orig = snap[key as string] ?? null;
    return (now ?? null) !== (orig ?? null);
  }).map((f) => f.label);
  if (r.montor_note && r.montor_note.trim()) diff.push('övrigt');
  if (canonTill((r.spec as any)?.tillbehor) !== canonTill(snap?.tillbehor)) diff.push('tillbehör');
  if (((r.spec as any)?.spartyp ?? null) !== (snap?.spartyp ?? null)) diff.push('spårtyp');
  return diff;
}

function fmtSize(r: { width: number | null; height: number | null; brostning: number | null }) {
  if (r.width == null && r.height == null) return '—';
  const wh = `${r.width ?? '?'}×${r.height ?? '?'}`;
  return r.brostning != null ? `${wh} / ${r.brostning}` : wh;
}

function OrigHint({ orig, cur }: { orig: number | string | null | undefined; cur: number | string | null }) {
  const o = orig ?? null;
  if (o == null) return null;
  if ((o as any) === (cur ?? null)) return null;
  return <p className="text-[10px] text-muted-foreground mt-0.5">Original: {String(o)}</p>;
}

export function MontorLitteraSection({
  caseId,
  currentUser,
  caseAddress,
  customerName,
}: {
  caseId: string;
  currentUser: string;
  caseAddress: string;
  customerName: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LitteraRow | null>(null);

  const [fWidth, setFWidth] = useState('');
  const [fHeight, setFHeight] = useState('');
  const [fBrost, setFBrost] = useState('');
  const [fAntal, setFAntal] = useState('');
  const [fSetNr, setFSetNr] = useState('');
  const [fSetPos, setFSetPos] = useState('');
  const [fLead, setFLead] = useState(false);
  const [fColIn, setFColIn] = useState('');
  const [fColOut, setFColOut] = useState('');
  const [fNote, setFNote] = useState('');
  const [fTill, setFTill] = useState<TillForm[]>([]);
  const [fSpartyp, setFSpartyp] = useState('');

  const { data: rows, isLoading } = useQuery({
    queryKey: ['litteror', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('litteror')
        .select('*')
        .eq('case_id', caseId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LitteraRow[];
    },
  });

  function openEdit(r: LitteraRow) {
    setEditing(r);
    setFWidth(r.width != null ? String(r.width) : '');
    setFHeight(r.height != null ? String(r.height) : '');
    setFBrost(r.brostning != null ? String(r.brostning) : '');
    setFAntal(r.antal != null ? String(r.antal) : '');
    setFSetNr(r.set_number != null ? String(r.set_number) : '');
    setFSetPos(r.set_position != null ? String(r.set_position) : '');
    setFLead(!!r.set_lead);
    setFColIn(r.color_inside ?? '');
    setFColOut(r.color_outside ?? '');
    setFNote(r.montor_note ?? '');
    setFTill((((r.spec as any)?.tillbehor ?? []) as any[]).map(tillToForm));
    setFSpartyp((((r.spec as any)?.spartyp as string) ?? ''));
  }

  const updateTill = (i: number, patch: Partial<TillForm>) =>
    setFTill((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const removeTill = (i: number) => setFTill((prev) => prev.filter((_, idx) => idx !== i));
  const addTill = () =>
    setFTill((prev) => [...prev, { typ: 'ovrigt', placering: '', material: '', dimension: '', matt: '', kulor: '', note: '', _new: true }]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return { noop: true };
      const patch = {
        width: numOrNull(fWidth),
        height: numOrNull(fHeight),
        brostning: numOrNull(fBrost),
        antal: numOrNull(fAntal),
        set_number: numOrNull(fSetNr),
        set_position: numOrNull(fSetPos),
        set_lead: fLead,
        color_inside: strOrNull(fColIn),
        color_outside: strOrNull(fColOut),
        montor_note: strOrNull(fNote),
      };
      const tillbehor = fTill.filter((f) => !tillEmpty(f)).map(formToTill);
      const spartyp = strOrNull(fSpartyp);
      const overviewChanged = (Object.keys(patch) as (keyof typeof patch)[]).some(
        (k) => (patch[k] ?? null) !== ((editing as any)[k] ?? null),
      );
      const tillChanged = canonTill(tillbehor) !== canonTill((editing.spec as any)?.tillbehor);
      const spartypChanged = spartyp !== ((editing.spec as any)?.spartyp ?? null);
      if (!overviewChanged && !tillChanged && !spartypChanged) return { noop: true };
      const next_status = editing.cm_status === 'hanterad' ? 'hanterad' : 'justerad';
      const { error } = await (supabase as any)
        .from('litteror')
        .update({ ...patch, spec: { ...((editing.spec as any) || {}), tillbehor, spartyp }, cm_status: next_status })
        .eq('id', editing.id);
      if (error) throw error;
      return { noop: false };
    },
    onSuccess: (res) => {
      setEditing(null);
      if (res && !res.noop) {
        qc.invalidateQueries({ queryKey: ['litteror', caseId] });
        toast.success('Littera uppdaterad');
      }
    },
    onError: (e: Error) => toast.error(`Kunde inte spara: ${e.message}`),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const list = rows ?? [];
      const toSend = list.filter((r) => r.cm_status === 'ej_paborjad' || r.cm_status === 'justerad');
      if (toSend.length === 0) throw new Error('Inget att skicka in');
      const ids = toSend.map((r) => r.id);
      const { error } = await supabase.from('litteror').update({ cm_status: 'inskickad' }).in('id', ids);
      if (error) throw error;

      const changedCount = toSend.filter((r) => changedFields(r).length > 0).length;
      await createCaseEvent({
        case_id: caseId,
        event_type: 'kontrollmatning',
        description: `Kontrollmätning inskickad: ${toSend.length} littera (${changedCount} med ändringar)`,
        created_by: currentUser,
      });
      logActivity({
        category: 'case',
        action: 'kontrollmatning_submitted',
        description: `Skickade in kontrollmätning för ${caseAddress}`,
        case_id: caseId,
        metadata: { littera_count: toSend.length, changed_count: changedCount },
      });
      try {
        await sendNotificationEmail({
          to: COORDINATOR_EMAIL,
          subject: `KONTROLLMÄTNING INSKICKAD — ${caseAddress}`,
          body: `
            <h2>Kontrollmätning inskickad</h2>
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:4px 8px;font-weight:bold">Adress:</td><td style="padding:4px 8px">${caseAddress}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Kund:</td><td style="padding:4px 8px">${customerName}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Montör:</td><td style="padding:4px 8px">${currentUser}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Littera inskickade:</td><td style="padding:4px 8px">${toSend.length}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Varav ändrade:</td><td style="padding:4px 8px">${changedCount}</td></tr>
            </table>
            <p style="margin-top:12px">Logga in i N3prenad för att granska ändringarna och uppdatera Mockfjärds kundportal.</p>
          `,
        });
        await createCaseEvent({
          case_id: caseId,
          event_type: 'notification',
          description: `Mail skickat till ${COORDINATOR_EMAIL} (kontrollmätning inskickad)`,
          created_by: currentUser,
        });
      } catch (e) {
        console.error('Email notification failed:', e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['litteror', caseId] });
      toast.success('Kontrollmätning inskickad');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <section className="py-4 border-t space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Ruler className="h-4 w-4" /> Littera / kontrollmätning
        </h3>
        <p className="text-sm text-muted-foreground">Laddar...</p>
      </section>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <section className="py-4 border-t space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Ruler className="h-4 w-4" /> Littera / kontrollmätning
        </h3>
        <p className="text-sm text-muted-foreground">
          Inga littera importerade ännu. Kontoret importerar littera från Mockfjärds kundportal.
        </p>
      </section>
    );
  }

  const reviewable = rows.filter((r) => r.cm_status === 'ej_paborjad' || r.cm_status === 'justerad');
  const allHandled = rows.every((r) => r.cm_status === 'hanterad');
  const allSubmitted = reviewable.length === 0 && !allHandled;
  const origTill = ((editing?.imported_snapshot as any)?.tillbehor ?? []) as any[];

  return (
    <section className="py-4 border-t space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Ruler className="h-4 w-4" /> Littera / kontrollmätning ({rows.length})
      </h3>
      <p className="text-xs text-muted-foreground">
        Granska säljarens littera mot verkligheten. Justera mått, kulör och tillbehör (lister, smyg, fönsterbänk, plissé, plåt) — ändra, ta bort eller lägg till. Skicka sedan in till kontoret.
      </p>

      <div className="space-y-2">
        {rows.map((r) => {
          const st = STATUS[r.cm_status] ?? { label: r.cm_status, variant: 'outline' as const };
          const diff = changedFields(r);
          const till = ((r.spec as any)?.tillbehor ?? []) as any[];
          const locked = r.cm_status === 'hanterad';
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => openEdit(r)}
              className="w-full text-left rounded-lg border p-3 hover:bg-muted/40 active:bg-muted/60 transition-colors min-h-[48px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-card-foreground">{r.littera || '—'}</span>
                    {r.set_number != null && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Set {r.set_number}
                        {r.set_lead && <Star className="h-3 w-3 ml-1 inline" />}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{r.article_name || '—'}</p>
                </div>
                <Badge variant={st.variant}>{st.label}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-card-foreground">
                <div><span className="text-muted-foreground">Storlek:</span> {fmtSize(r)}</div>
                <div className="truncate"><span className="text-muted-foreground">Kulör:</span> {r.color_inside || '—'} / {r.color_outside || '—'}</div>
                <div className="truncate"><span className="text-muted-foreground">Spår:</span> {((r.spec as any)?.spartyp) || '—'}</div>
                <div><span className="text-muted-foreground">Tillbehör:</span> {till.length}</div>
              </div>
              {diff.length > 0 && (
                <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1">
                  <Pencil className="h-3 w-3" /> Ändrat: {diff.join(', ')}
                </div>
              )}
              {locked && <p className="mt-1 text-[11px] text-muted-foreground italic">Hanterad av kontoret</p>}
            </button>
          );
        })}
      </div>

      {reviewable.length > 0 && (
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          className="w-full min-h-[52px] text-base font-semibold"
          size="lg"
        >
          <Send className="h-4 w-4 mr-1" />
          {submitMutation.isPending ? 'Skickar...' : `Skicka in kontrollmätning (${reviewable.length})`}
        </Button>
      )}
      {allSubmitted && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Inskickad till kontoret. Du kan fortfarande justera och skicka in på nytt vid behov.
        </div>
      )}
      {allHandled && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Kontoret har hanterat alla ändringar.
        </div>
      )}

      <Drawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Justera littera {editing?.littera ?? ''}</DrawerTitle>
          </DrawerHeader>
          {editing && (
            <div className="px-4 pb-2 space-y-3 overflow-y-auto max-h-[70vh]">
              <p className="text-xs text-muted-foreground">
                {editing.article_name} {editing.article_code ? `· ${editing.article_code}` : ''}
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Bredd (mm)</Label>
                  <Input inputMode="numeric" value={fWidth} onChange={(e) => setFWidth(e.target.value)} className="min-h-[48px]" />
                  <OrigHint orig={editing.imported_snapshot?.width} cur={numOrNull(fWidth)} />
                </div>
                <div>
                  <Label className="text-xs">Höjd (mm)</Label>
                  <Input inputMode="numeric" value={fHeight} onChange={(e) => setFHeight(e.target.value)} className="min-h-[48px]" />
                  <OrigHint orig={editing.imported_snapshot?.height} cur={numOrNull(fHeight)} />
                </div>
                <div>
                  <Label className="text-xs">Bröstning</Label>
                  <Input inputMode="numeric" value={fBrost} onChange={(e) => setFBrost(e.target.value)} className="min-h-[48px]" />
                  <OrigHint orig={editing.imported_snapshot?.brostning} cur={numOrNull(fBrost)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Antal</Label>
                  <Input inputMode="numeric" value={fAntal} onChange={(e) => setFAntal(e.target.value)} className="min-h-[48px]" />
                  <OrigHint orig={editing.imported_snapshot?.antal} cur={numOrNull(fAntal)} />
                </div>
                <div>
                  <Label className="text-xs">Set-nr</Label>
                  <Input inputMode="numeric" value={fSetNr} onChange={(e) => setFSetNr(e.target.value)} className="min-h-[48px]" />
                  <OrigHint orig={editing.imported_snapshot?.set_number} cur={numOrNull(fSetNr)} />
                </div>
                <div>
                  <Label className="text-xs">Position</Label>
                  <Input inputMode="numeric" value={fSetPos} onChange={(e) => setFSetPos(e.target.value)} className="min-h-[48px]" />
                  <OrigHint orig={editing.imported_snapshot?.set_position} cur={numOrNull(fSetPos)} />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm min-h-[48px]">
                <input
                  type="checkbox"
                  checked={fLead}
                  onChange={(e) => setFLead(e.target.checked)}
                  className="h-5 w-5 rounded border-input"
                />
                Ledare i settet (stjärna)
              </label>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Kulör insida</Label>
                  <Input value={fColIn} onChange={(e) => setFColIn(e.target.value)} className="min-h-[48px]" />
                  <OrigHint orig={editing.imported_snapshot?.color_inside} cur={strOrNull(fColIn)} />
                </div>
                <div>
                  <Label className="text-xs">Kulör utsida</Label>
                  <Input value={fColOut} onChange={(e) => setFColOut(e.target.value)} className="min-h-[48px]" />
                  <OrigHint orig={editing.imported_snapshot?.color_outside} cur={strOrNull(fColOut)} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Spårtyp</Label>
                <Input value={fSpartyp} onChange={(e) => setFSpartyp(e.target.value)} className="min-h-[48px]" placeholder="t.ex. B2 Fyra sidor" />
                <OrigHint orig={editing.imported_snapshot?.spartyp} cur={strOrNull(fSpartyp)} />
              </div>


              <div className="space-y-2">
                <Label className="text-xs">Tillbehör (lister, smyg, fönsterbänk, plissé, plåt)</Label>
                {origTill.length > 0 && (
                  <div className="rounded border border-dashed bg-muted/30 p-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Säljarens original:</p>
                    {origTill.map((t, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground">• {tillLabel(t)}</p>
                    ))}
                  </div>
                )}
                {fTill.map((f, i) => (
                  <div key={i} className="relative rounded-lg border p-2 space-y-2 bg-card">
                    {f._new && <Badge variant="secondary" className="text-[10px] absolute -top-2 left-2">Ny</Badge>}
                    <button
                      type="button"
                      onClick={() => removeTill(i)}
                      className="absolute top-1 right-1 p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Ta bort tillbehör"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider">Typ</Label>
                        <select
                          value={f.typ}
                          onChange={(e) => updateTill(i, { typ: e.target.value })}
                          className="w-full min-h-[44px] rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {TILL_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider">Placering</Label>
                        <select
                          value={f.placering}
                          onChange={(e) => updateTill(i, { placering: e.target.value })}
                          className="w-full min-h-[44px] rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">—</option>
                          <option value="invandig">Invändig</option>
                          <option value="utvandig">Utvändig</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider">Material</Label>
                        <Input value={f.material} onChange={(e) => updateTill(i, { material: e.target.value })} className="min-h-[44px]" placeholder="Furu Målad Vit" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider">Dimension</Label>
                        <Input value={f.dimension} onChange={(e) => updateTill(i, { dimension: e.target.value })} className="min-h-[44px]" placeholder="12x50" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider">Mått (b×h)</Label>
                        <Input value={f.matt} onChange={(e) => updateTill(i, { matt: e.target.value })} className="min-h-[44px]" placeholder="883 x 1086" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider">Kulör</Label>
                        <Input value={f.kulor} onChange={(e) => updateTill(i, { kulor: e.target.value })} className="min-h-[44px]" placeholder="NCS S 5502-Y" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider">Notering</Label>
                      <Input value={f.note} onChange={(e) => updateTill(i, { note: e.target.value })} className="min-h-[44px]" placeholder="t.ex. förspänd Mörkläggande" />
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" className="w-full min-h-[44px]" onClick={addTill}>
                  <Plus className="h-4 w-4 mr-1" /> Lägg till tillbehör
                </Button>
              </div>

              <div>
                <Label className="text-xs">Övriga justeringar (fritext)</Label>
                <Textarea
                  value={fNote}
                  onChange={(e) => setFNote(e.target.value)}
                  rows={3}
                  placeholder="Allt som inte ryms i fälten ovan – t.ex. spårtyp, handtagsplacering, annat foder/smyg..."
                />
              </div>
            </div>
          )}
          <DrawerFooter>
            {editing?.cm_status === 'hanterad' ? (
              <div className="text-sm text-muted-foreground text-center">Hanterad av kontoret – kan inte ändras.</div>
            ) : (
              <Button className="min-h-[48px]" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Sparar...' : 'Spara justering'}
              </Button>
            )}
            <DrawerClose asChild>
              <Button variant="outline" className="min-h-[48px]">Stäng</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
