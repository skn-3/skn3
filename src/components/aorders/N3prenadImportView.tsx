import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Download, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { listAllOrders } from '@/integrations/orderGateway';
import { normalizeLines } from '@/lib/aOrderLines';
import { HOUR_RATE } from '@/lib/constants';

type Team = {
  id: string;
  name: string;
  company_name: string | null;
  org_nr: string | null;
  email: string | null;
  bankgiro: string | null;
  invoice_prefix: string | null;
  next_invoice_number: number | null;
  is_active: boolean;
};

type Report = {
  fetched: number;
  imported: number;
  skipped: number;
  teamsCreated: number;
  missingCases: number;
  sourceTotal: number;
  importedTotal: number;
  errors: string[];
};

function fmt(n: number) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }

export function N3prenadImportView() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string>('');
  const [report, setReport] = useState<Report | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairReport, setRepairReport] = useState<{ scanned: number; repaired: number } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillReport, setBackfillReport] = useState<{ updated: number; skipped: number; noCase: number; noProfit: number } | null>(null);

  async function backfillInternalHours() {
    setBackfilling(true);
    setBackfillReport(null);
    try {
      const { data: orders, error } = await (supabase as any)
        .from('a_orders')
        .select('id, case_id, internal_extra_hours, internal_extra_amount, status')
        .not('case_id', 'is', null)
        .neq('status', 'credited')
        .eq('internal_extra_hours', 0)
        .eq('internal_extra_amount', 0);
      if (error) throw error;
      const rows = (orders || []) as Array<{ id: string; case_id: string }>;
      let updated = 0, skipped = 0, noCase = 0, noProfit = 0;
      const caseIds = Array.from(new Set(rows.map(r => r.case_id).filter(Boolean)));
      const caseMap = new Map<string, { sold: number; approved: number }>();
      if (caseIds.length > 0) {
        const { data: cases, error: cErr } = await (supabase as any)
          .from('cases')
          .select('id, extra_hours_sold, extra_hours_approved')
          .in('id', caseIds);
        if (cErr) throw cErr;
        for (const c of (cases || [])) {
          caseMap.set(c.id, {
            sold: Number(c.extra_hours_sold || 0),
            approved: Number(c.extra_hours_approved || 0),
          });
        }
      }
      for (const r of rows) {
        const c = caseMap.get(r.case_id);
        if (!c) { noCase += 1; continue; }
        const profit = c.sold - c.approved;
        if (profit <= 0) { noProfit += 1; continue; }
        const { error: uErr } = await (supabase as any)
          .from('a_orders')
          .update({ internal_extra_hours: profit, internal_hour_rate: HOUR_RATE })
          .eq('id', r.id);
        if (uErr) skipped += 1;
        else updated += 1;
      }
      setBackfillReport({ updated, skipped, noCase, noProfit });
      toast.success(`Uppdaterade ${updated} ordrar`);
      qc.invalidateQueries({ queryKey: ['a_orders_all'] });
    } catch (e: any) {
      toast.error(e?.message || 'Backfyllning misslyckades');
    } finally {
      setBackfilling(false);
    }
  }

  async function repairImportedLines() {
    setRepairing(true);
    setRepairReport(null);
    try {
      const { data, error } = await (supabase as any)
        .from('a_orders')
        .select('id, line_items')
        .not('source_n3prenad_id', 'is', null);
      if (error) throw error;
      const rows = (data || []) as Array<{ id: string; line_items: any }>;
      let repaired = 0;
      for (const r of rows) {
        const normalized = normalizeLines(r.line_items);
        const before = JSON.stringify(Array.isArray(r.line_items) ? r.line_items : []);
        const after = JSON.stringify(normalized);
        if (before !== after) {
          const { error: uErr } = await (supabase as any)
            .from('a_orders')
            .update({ line_items: normalized })
            .eq('id', r.id);
          if (!uErr) repaired += 1;
        }
      }
      setRepairReport({ scanned: rows.length, repaired });
      toast.success(`Reparerade ${repaired} av ${rows.length} rader`);
      qc.invalidateQueries({ queryKey: ['a_orders_all'] });
    } catch (e: any) {
      toast.error(e?.message || 'Reparation misslyckades');
    } finally {
      setRepairing(false);
    }
  }


  const { data: testOrders = [], refetch: refetchTest } = useQuery({
    queryKey: ['a_orders_test_only'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a_orders')
        .select('id, order_number, customer_address, pdf_path, images')
        .is('source_n3prenad_id', null);
      if (error) throw error;
      return data as any[];
    },
  });

  async function deleteTestOrders() {
    setDeleting(true);
    try {
      // Samla filer
      const paths: string[] = [];
      for (const o of testOrders) {
        if (o.pdf_path) paths.push(o.pdf_path);
        const imgs = Array.isArray(o.images) ? o.images : [];
        for (const img of imgs) {
          const p = typeof img === 'string' ? img : img?.path;
          if (p) paths.push(p);
        }
      }
      if (paths.length > 0) {
        await (supabase as any).storage.from('case-documents').remove(paths);
      }
      const ids = testOrders.map(o => o.id);
      if (ids.length > 0) {
        const { error } = await (supabase as any).from('a_orders').delete().in('id', ids);
        if (error) throw error;
      }
      toast.success(`Raderade ${ids.length} testorder(s)`);
      setConfirmDelete(false);
      await refetchTest();
      qc.invalidateQueries({ queryKey: ['a_orders_all'] });
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte radera');
    } finally {
      setDeleting(false);
    }
  }

  async function runImport() {
    setRunning(true);
    setReport(null);
    const errors: string[] = [];
    let imported = 0, skipped = 0, teamsCreated = 0, missingCases = 0;
    let sourceTotal = 0, importedTotal = 0;

    try {
      setPhase('Hämtar ordrar från n3prenad...');
      const source = await listAllOrders();
      sourceTotal = source.reduce((s, o) => s + Number(o.total_amount || 0), 0);

      setPhase('Läser befintliga A-ordrar...');
      const { data: existingRows, error: exErr } = await (supabase as any)
        .from('a_orders')
        .select('id, source_n3prenad_id')
        .not('source_n3prenad_id', 'is', null);
      if (exErr) throw exErr;
      const existingIds = new Set<string>((existingRows || []).map((r: any) => r.source_n3prenad_id));

      setPhase('Läser team & ärenden...');
      const [{ data: teamsRows }, { data: caseRows }] = await Promise.all([
        (supabase as any).from('montor_teams').select('*'),
        (supabase as any).from('cases').select('id'),
      ]);
      const teams: Team[] = (teamsRows || []) as Team[];
      const teamByOrg = new Map<string, Team>();
      const teamByName = new Map<string, Team>();
      for (const t of teams) {
        if (t.org_nr) teamByOrg.set(t.org_nr.replace(/\D/g, ''), t);
        if (t.name) teamByName.set(t.name.trim().toLowerCase(), t);
      }
      const caseIds = new Set<string>((caseRows || []).map((c: any) => c.id));

      async function resolveTeam(o: any): Promise<string | null> {
        const orgRaw = (o.team_org_nr || '').replace(/\D/g, '');
        const nameRaw = (o.team_id || '').trim().toLowerCase();
        if (!o.team_id && !o.team_company && !orgRaw) return null;
        let t: Team | undefined;
        if (orgRaw) t = teamByOrg.get(orgRaw);
        if (!t && nameRaw) t = teamByName.get(nameRaw);
        if (t) return t.id;
        // Auto-create
        const insertPayload = {
          name: o.team_id || o.team_company || 'Okänt team',
          company_name: o.team_company || null,
          org_nr: o.team_org_nr || null,
          email: o.team_email || null,
          bankgiro: o.team_bankgiro || null,
          is_active: true,
        };
        const { data: ins, error } = await (supabase as any)
          .from('montor_teams').insert(insertPayload).select('*').single();
        if (error) { errors.push(`Team-skap (${insertPayload.name}): ${error.message}`); return null; }
        const created = ins as Team;
        teams.push(created);
        if (created.org_nr) teamByOrg.set(created.org_nr.replace(/\D/g, ''), created);
        if (created.name) teamByName.set(created.name.trim().toLowerCase(), created);
        teamsCreated += 1;
        return created.id;
      }

      // Bygg insert-rader
      setPhase(`Mappar ${source.length} ordrar...`);
      const toInsert: any[] = [];
      for (const o of source) {
        if (existingIds.has(o.id)) { skipped += 1; continue; }
        const team_id = await resolveTeam(o);
        let case_id: string | null = o.case_id || null;
        if (case_id && !caseIds.has(case_id)) { case_id = null; missingCases += 1; }
        const facade = ['tra', 'sten', 'puts'].includes(o.facade_type) ? o.facade_type : 'tra';
        toInsert.push({
          order_number: o.order_number ?? null,
          created_at: o.created_at,
          date: o.date,
          customer_name: o.customer_name || null,
          customer_address: o.customer_address || '',
          customer_phone: o.customer_phone || null,
          facade_type: facade,
          window_count: Number(o.windows_count || 0),
          door_count: Number(o.doors_count || 0),
          roof_window_count: 0,
          km_distance: Number(o.distance_km || 0),
          line_items: normalizeLines(o.line_items),
          description: o.description || '',
          total_amount: Number(o.total_amount || 0),
          status: o.status || 'order',
          invoice_number: o.invoice_number || null,
          invoice_sent_at: o.invoice_sent_at || null,
          scheduled_delivery: !!o.scheduled_delivery,
          delivery_time: o.delivery_time || null,
          internal_extra_hours: Number(o.internal_extra_hours || 0),
          internal_hour_rate: Number(o.internal_hour_rate || 0),
          internal_extra_amount: Number(o.internal_extra_amount || 0),
          team_id,
          case_id,
          source_n3prenad_id: o.id,
        });
      }

      // Batcha
      setPhase(`Importerar ${toInsert.length} ordrar...`);
      const BATCH = 50;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const slice = toInsert.slice(i, i + BATCH);
        const { data, error } = await (supabase as any).from('a_orders').insert(slice).select('id, total_amount');
        if (error) {
          // Fallback: per-row för att inte stoppa hela importen
          for (const row of slice) {
            const { data: one, error: e2 } = await (supabase as any).from('a_orders').insert(row).select('id, total_amount').single();
            if (e2) { errors.push(`Order ${row.order_number ?? row.source_n3prenad_id}: ${e2.message}`); }
            else if (one) { imported += 1; importedTotal += Number(one.total_amount || 0); }
          }
        } else {
          imported += (data || []).length;
          importedTotal += (data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
        }
      }

      // STEG C — credited_from_order_id andra pass
      setPhase('Kopplar krediteringar...');
      const credSources = source.filter(o => o.credited_from_order_id);
      if (credSources.length > 0) {
        const { data: all, error: aErr } = await (supabase as any)
          .from('a_orders')
          .select('id, source_n3prenad_id')
          .not('source_n3prenad_id', 'is', null);
        if (!aErr && all) {
          const map = new Map<string, string>(all.map((r: any) => [r.source_n3prenad_id, r.id]));
          for (const o of credSources) {
            const newId = map.get(o.id);
            const newCreditedId = map.get(o.credited_from_order_id);
            if (newId && newCreditedId) {
              const { error } = await (supabase as any)
                .from('a_orders')
                .update({ credited_from_order_id: newCreditedId })
                .eq('id', newId);
              if (error) errors.push(`Kreditkoppling ${o.id}: ${error.message}`);
            }
          }
        }
      }

      // STEG D — sekvens + per-team nästa fakturanr
      setPhase('Justerar sekvens & fakturanummer...');
      const { error: seqErr } = await (supabase as any).rpc('fix_a_order_sequence');
      if (seqErr) errors.push(`fix_a_order_sequence: ${seqErr.message}`);

      const { data: allOrders } = await (supabase as any)
        .from('a_orders')
        .select('team_id, invoice_number')
        .not('invoice_number', 'is', null)
        .not('team_id', 'is', null);
      const maxByTeam = new Map<string, number>();
      for (const row of (allOrders || [])) {
        const team = teams.find(t => t.id === row.team_id);
        const prefix = team?.invoice_prefix;
        if (!prefix) continue;
        const m = String(row.invoice_number).match(new RegExp(`^${prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}-(\\d+)$`));
        if (m) {
          const n = parseInt(m[1], 10);
          const cur = maxByTeam.get(row.team_id) || 0;
          if (n > cur) maxByTeam.set(row.team_id, n);
        }
      }
      for (const [teamId, max] of maxByTeam.entries()) {
        const { error } = await (supabase as any)
          .from('montor_teams')
          .update({ next_invoice_number: max + 1 })
          .eq('id', teamId);
        if (error) errors.push(`next_invoice_number team ${teamId}: ${error.message}`);
      }

      setReport({ fetched: source.length, imported, skipped, teamsCreated, missingCases, sourceTotal, importedTotal, errors });
      toast.success(`Import klar: ${imported} nya, ${skipped} redan importerade`);
      qc.invalidateQueries({ queryKey: ['a_orders_all'] });
      qc.invalidateQueries({ queryKey: ['admin_montor_teams'] });
      qc.invalidateQueries({ queryKey: ['montor_teams'] });
      await refetchTest();
    } catch (e: any) {
      errors.push(e?.message || String(e));
      setReport({ fetched: 0, imported, skipped, teamsCreated, missingCases, sourceTotal, importedTotal, errors });
      toast.error(e?.message || 'Import misslyckades');
    } finally {
      setRunning(false);
      setPhase('');
    }
  }

  return (
    <div className="space-y-6 mt-8 border-t pt-6">
      <div>
        <h3 className="text-lg font-semibold">Import från n3prenad</h3>
        <p className="text-sm text-muted-foreground">Engångsimport av all orderhistorik. Idempotent — kan köras flera gånger utan dubbletter.</p>
      </div>

      {/* STEG A — Städning */}
      <div className="rounded-md border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Steg 1 — Städa testordrar</div>
            <div className="text-sm text-muted-foreground">
              {testOrders.length === 0
                ? 'Inga testordrar (utan n3prenad-id) finns.'
                : `${testOrders.length} testorder(s) utan n3prenad-id hittade.`}
            </div>
          </div>
          {testOrders.length > 0 && (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={deleting} className="gap-2">
              <Trash2 className="h-4 w-4" /> Radera testordrar
            </Button>
          )}
        </div>
      </div>

      {/* STEG B — Import */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Steg 2 — Hämta & importera</div>
            <div className="text-sm text-muted-foreground">Bevarar originalets created_at, source_n3prenad_id som dubblettnyckel.</div>
          </div>
          <Button onClick={runImport} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Hämta & importera från n3prenad
          </Button>
        </div>
        {running && phase && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> {phase}
          </div>
        )}
      </div>

      {/* Rapport */}
      {report && (
        <div className="rounded-md border p-4 space-y-2">
          <div className="font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Rapport
          </div>
          <div className="text-sm">
            Hämtade: <b>{report.fetched}</b> · Importerade: <b>{report.imported}</b> · Redan importerade: <b>{report.skipped}</b> · Team skapade: <b>{report.teamsCreated}</b> · Saknade ärenden: <b>{report.missingCases}</b>
          </div>
          <div className="text-sm">
            Totalsumma källa: <b>{fmt(report.sourceTotal)}</b> · Totalsumma importerat: <b>{fmt(report.importedTotal)}</b>
            {Math.round(report.sourceTotal) !== Math.round(report.importedTotal) && report.imported > 0 && (
              <span className="ml-2 text-amber-700 inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> avviker (kan bero på redan importerade)
              </span>
            )}
          </div>
          {report.errors.length > 0 && (
            <div className="mt-2">
              <div className="text-sm font-medium text-red-700">{report.errors.length} fel:</div>
              <ul className="text-xs text-red-700 list-disc ml-5 max-h-48 overflow-auto">
                {report.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera {testOrders.length} testorder(s)?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>Följande A-ordrar saknar n3prenad-id och raderas tillsammans med tillhörande filer:</div>
                <ul className="text-xs list-disc ml-5 max-h-48 overflow-auto">
                  {testOrders.map(o => (
                    <li key={o.id}>#{o.order_number ?? '—'} — {o.customer_address}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTestOrders} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Raderar...' : 'Ja, radera'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reparation av importerade rader */}
      <div className="rounded-md border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Reparera importerade rader</div>
            <div className="text-sm text-muted-foreground">
              Normaliserar line_items för alla importerade A-ordrar (camelCase → snake_case, räknar om amount). Idempotent.
            </div>
            {repairReport && (
              <div className="text-sm mt-1">Reparerade <b>{repairReport.repaired}</b> av <b>{repairReport.scanned}</b> rader</div>
            )}
          </div>
          <Button variant="outline" onClick={repairImportedLines} disabled={repairing} className="gap-2">
            {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Reparera importerade rader
          </Button>
        </div>
      </div>

      {/* Backfyllnad av interna vinsttimmar */}
      <div className="rounded-md border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Fyll interna timmar från ärenden</div>
            <div className="text-sm text-muted-foreground">
              För importerade A-ordrar utan interna värden: sätter internal_extra_hours = sold − approved (när &gt; 0) och timpris {HOUR_RATE}. Rör inte line_items eller totalsumma. Idempotent.
            </div>
            {backfillReport && (
              <div className="text-sm mt-1">
                Uppdaterade: <b>{backfillReport.updated}</b> · Hoppade (hade redan värden): <b>{backfillReport.skipped}</b> · Utan ärendekoppling: <b>{backfillReport.noCase}</b> · Ärenden utan vinsttimmar: <b>{backfillReport.noProfit}</b>
              </div>
            )}
          </div>
          <Button variant="outline" onClick={backfillInternalHours} disabled={backfilling} className="gap-2">
            {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Fyll interna timmar från ärenden
          </Button>
        </div>
      </div>
    </div>
  );
}
