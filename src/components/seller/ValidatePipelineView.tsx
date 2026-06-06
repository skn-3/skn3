import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchAllCases, updateCase, createCase, createCaseEvent, fetchAllVisits, createVisit, updateVisit, deleteVisit } from '@/lib/supabaseClient';
import { findPipelineIssues, type PipelineIssue } from '@/lib/statusRules';
import { STATUS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle, Check, CalendarPlus, FileWarning, Boxes } from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLog';
import { formatAmount } from '@/lib/utils';
import { listOrdersByCaseIds } from '@/integrations/orderGateway';

interface Props {
  currentUser: string;
}

export function ValidatePipelineView({ currentUser }: Props) {
  const qc = useQueryClient();
  const { data: allCases, isLoading } = useQuery({
    queryKey: ['cases_all_validate'],
    queryFn: fetchAllCases,
  });

  const { data: allVisits } = useQuery({
    queryKey: ['visits_all_validate'],
    queryFn: fetchAllVisits,
  });

  const issues = useMemo<PipelineIssue[]>(() => findPipelineIssues(allCases || []), [allCases]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  // Backfill: cases utan kopplad visits-rad
  const casesMissingVisits = useMemo(() => {
    if (!allCases || !allVisits) return [];
    const linked = new Set((allVisits || []).map((v: any) => v.case_id).filter(Boolean));
    return allCases.filter(c => !linked.has(c.id));
  }, [allCases, allVisits]);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);

  // Backfill: cases utan units — hämta från n3prenad (windows_count + doors_count)
  const casesMissingUnits = useMemo(() => {
    if (!allCases) return [];
    return allCases.filter((c: any) => c.units == null);
  }, [allCases]);
  const [unitsBackfillBusy, setUnitsBackfillBusy] = useState(false);

  const runUnitsBackfill = async () => {
    if (casesMissingUnits.length === 0) return;
    setUnitsBackfillBusy(true);
    try {
      const ids = casesMissingUnits.map((c: any) => c.id);
      // Batcha i klumpar om 100 för att undvika alltför stora payloads
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
      const orders: any[] = [];
      for (const chunk of chunks) {
        const part = await listOrdersByCaseIds(chunk);
        orders.push(...part);
      }
      const byCase = new Map<string, any>();
      for (const o of orders) {
        if (o.case_id) byCase.set(o.case_id, o);
      }
      let updated = 0;
      let skipped = 0;
      for (const c of casesMissingUnits) {
        const o = byCase.get(c.id);
        if (!o) { skipped++; continue; }
        const w = Number(o.windows_count ?? 0) || 0;
        const d = Number(o.doors_count ?? 0) || 0;
        const sum = w + d;
        if (sum <= 0) { skipped++; continue; }
        try {
          await updateCase(c.id, { units: sum } as any);
          await createCaseEvent({
            case_id: c.id,
            event_type: 'update',
            description: `Antal enheter auto-fyllt från n3prenad (backfill): ${sum} (fönster ${w} + dörrar ${d})`,
            created_by: currentUser,
          });
          updated++;
        } catch (e) {
          console.warn('units backfill update failed', c.id, e);
          skipped++;
        }
      }
      logActivity({
        action: 'units_backfill',
        category: 'system',
        description: `Backfill av antal enheter: ${updated} uppdaterade, ${skipped} hoppades över`,
        metadata: { updated, skipped, candidates: casesMissingUnits.length },
      });
      toast.success(`${updated} ärenden uppdaterade · ${skipped} utan order/data`);
      qc.invalidateQueries({ queryKey: ['cases_all_validate'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
    } catch (e: any) {
      toast.error(e?.message || 'Backfill misslyckades');
    } finally {
      setUnitsBackfillBusy(false);
    }
  };

  // ===== Orphan signed visits: signerat besök utan giltigt case_id =====
  const orphanVisits = useMemo(() => {
    if (!allVisits) return [] as any[];
    const caseIds = new Set((allCases || []).map(c => c.id));
    return (allVisits as any[]).filter(v =>
      v.result === 'signerat' && (!v.case_id || !caseIds.has(v.case_id))
    );
  }, [allVisits, allCases]);
  const [orphanBusyId, setOrphanBusyId] = useState<string | null>(null);
  const [followUpInputs, setFollowUpInputs] = useState<Record<string, string>>({});
  const [deleteVisitId, setDeleteVisitId] = useState<string | null>(null);

  const orphanCreateCase = async (v: any) => {
    setOrphanBusyId(v.id);
    try {
      const newCase = await createCase({
        customer_name: v.customer_name,
        address: v.address,
        seller: v.seller,
        order_value: v.order_value ?? null,
        status: 'vantar_km',
        customer_phone: '',
      } as any);
      await updateVisit(v.id, { case_id: newCase.id } as any);
      await createCaseEvent({
        case_id: newCase.id,
        event_type: 'status_change',
        description: `Ärende skapat retroaktivt från orphan-besök (${v.id})`,
        created_by: currentUser,
      });
      logActivity({
        action: 'orphan_visit_case_created',
        category: 'case',
        description: `Skapade ärende för orphan-besök — ${v.address}`,
        case_id: newCase.id,
        metadata: { visit_id: v.id },
      });
      toast.success('Ärende skapat och kopplat');
      qc.invalidateQueries({ queryKey: ['cases_all_validate'] });
      qc.invalidateQueries({ queryKey: ['visits_all_validate'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['visits'] });
    } catch (e: any) {
      toast.error(e.message || 'Kunde inte skapa ärende');
    } finally {
      setOrphanBusyId(null);
    }
  };

  const orphanConvertToFollowUp = async (v: any) => {
    const fud = followUpInputs[v.id];
    if (!fud) {
      toast.error('Ange återkoppla-datum först');
      return;
    }
    setOrphanBusyId(v.id);
    try {
      await updateVisit(v.id, { result: 'aterkoppla', follow_up_date: fud, case_id: null } as any);
      logActivity({
        action: 'orphan_visit_converted',
        category: 'case',
        description: `Orphan-besök ändrat till återkoppla — ${v.address}`,
        metadata: { visit_id: v.id, follow_up_date: fud },
      });
      toast.success('Besök ändrat till återkoppla');
      qc.invalidateQueries({ queryKey: ['visits_all_validate'] });
      qc.invalidateQueries({ queryKey: ['visits'] });
    } catch (e: any) {
      toast.error(e.message || 'Kunde inte uppdatera');
    } finally {
      setOrphanBusyId(null);
    }
  };

  const orphanDelete = async (id: string) => {
    setOrphanBusyId(id);
    try {
      await deleteVisit(id);
      logActivity({
        action: 'orphan_visit_deleted',
        category: 'data',
        description: `Orphan-besök raderat (${id})`,
        metadata: { visit_id: id },
      });
      toast.success('Besök raderat');
      qc.invalidateQueries({ queryKey: ['visits_all_validate'] });
      qc.invalidateQueries({ queryKey: ['visits'] });
    } catch (e: any) {
      toast.error(e.message || 'Kunde inte radera');
    } finally {
      setOrphanBusyId(null);
      setDeleteVisitId(null);
    }
  };

  const runBackfill = async () => {
    setBackfillBusy(true);
    let ok = 0;
    for (const c of casesMissingVisits) {
      try {
        const d = c.created_at ? String(c.created_at).split('T')[0] : new Date().toISOString().split('T')[0];
        await createVisit({
          date: d,
          address: c.address,
          customer_name: c.customer_name,
          seller: c.seller,
          result: 'signerat',
          order_value: c.order_value ?? null,
          case_id: c.id,
        } as any);
        ok++;
      } catch (e) {
        console.warn('backfill failed for', c.id, e);
      }
    }
    setBackfillBusy(false);
    setBackfillOpen(false);
    toast.success(`${ok}/${casesMissingVisits.length} besök skapade`);
    qc.invalidateQueries({ queryKey: ['visits_all_validate'] });
    qc.invalidateQueries({ queryKey: ['visits'] });
  };

  const applyOne = async (issue: PipelineIssue) => {
    if (!issue.suggestedStatus) return;
    const oldLabel = STATUS_LABELS[issue.currentStatus] || issue.currentStatus;
    const newLabel = STATUS_LABELS[issue.suggestedStatus] || issue.suggestedStatus;
    await updateCase(issue.case.id, { status: issue.suggestedStatus });
    await createCaseEvent({
      case_id: issue.case.id,
      event_type: 'status_corrected',
      description: `Status korrigerad av pipeline-validering: ${oldLabel} → ${newLabel} (${issue.reason})`,
      created_by: currentUser,
    });
  };

  const fixOne = async (issue: PipelineIssue) => {
    setBusyId(issue.case.id);
    try {
      await applyOne(issue);
      toast.success('Status korrigerad');
      qc.invalidateQueries({ queryKey: ['cases_all_validate'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
    } catch (e: any) {
      toast.error(e.message || 'Kunde inte rätta');
    } finally {
      setBusyId(null);
    }
  };

  const fixAll = async () => {
    const fixable = issues.filter(i => i.suggestedStatus);
    if (fixable.length === 0) return;
    setBusyAll(true);
    let ok = 0;
    for (const i of fixable) {
      try {
        await applyOne(i);
        ok++;
      } catch (e) {
        console.warn('fix failed', e);
      }
    }
    setBusyAll(false);
    toast.success(`${ok}/${fixable.length} ärenden rättade`);
    qc.invalidateQueries({ queryKey: ['cases_all_validate'] });
    qc.invalidateQueries({ queryKey: ['cases'] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Laddar ärenden…
      </div>
    );
  }

  const fixableCount = issues.filter(i => i.suggestedStatus).length;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Validera pipeline-status</h2>
          <p className="text-sm text-muted-foreground">
            Hittade {issues.length} ärenden vars status bryter mot reglerna.
          </p>
        </div>
        {fixableCount > 0 && (
          <Button onClick={fixAll} disabled={busyAll}>
            {busyAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Rätta alla ({fixableCount})
          </Button>
        )}
      </div>

      <div className="rounded-lg border p-4 bg-card flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <CalendarPlus className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <div className="font-medium">Skapa saknade besök för signerade ärenden</div>
            <p className="text-sm text-muted-foreground">
              {casesMissingVisits.length === 0
                ? 'Alla ärenden har en kopplad besöksregistrering ✓'
                : `${casesMissingVisits.length} ärenden saknar en kopplad besöksrad. Skapa dem retroaktivt så hit rate och statistik blir korrekt.`}
            </p>
          </div>
        </div>
        {casesMissingVisits.length > 0 && (
          <Button variant="outline" onClick={() => setBackfillOpen(true)} disabled={backfillBusy}>
            {backfillBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Skapa {casesMissingVisits.length} besök
          </Button>
        )}
      </div>

      <div className="rounded-lg border p-4 bg-card flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Boxes className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <div className="font-medium">Fyll i antal enheter från n3prenad</div>
            <p className="text-sm text-muted-foreground">
              {casesMissingUnits.length === 0
                ? 'Alla ärenden har antal enheter ifyllt ✓'
                : `${casesMissingUnits.length} ärenden saknar antal enheter. Hämtar fönster + dörrar från kopplad n3prenad-order. Manuellt ifyllda värden rörs aldrig.`}
            </p>
          </div>
        </div>
        {casesMissingUnits.length > 0 && (
          <Button variant="outline" onClick={runUnitsBackfill} disabled={unitsBackfillBusy}>
            {unitsBackfillBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Fyll i {casesMissingUnits.length} ärenden
          </Button>
        )}
      </div>

      <AlertDialog open={backfillOpen} onOpenChange={setBackfillOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skapa {casesMissingVisits.length} besök?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta skapar en visits-rad (result=signerat) för varje ärende som saknar koppling, med datum = ärendets skapandedatum. Åtgärden går inte att ångra automatiskt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={backfillBusy}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={runBackfill} disabled={backfillBusy}>
              {backfillBusy ? 'Skapar…' : 'Ja, skapa besök'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* === Orphan signed visits === */}
      <div className="rounded-lg border p-4 bg-card space-y-3">
        <div className="flex items-start gap-3">
          <FileWarning className="h-5 w-5 text-destructive mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Signerade besök utan ärende</div>
            <p className="text-sm text-muted-foreground">
              {orphanVisits.length === 0
                ? 'Inga orphan-besök — alla signerade besök är kopplade till ett befintligt ärende ✓'
                : `${orphanVisits.length} signerade besök saknar koppling till ett befintligt ärende. Detta förvrider hit rate.`}
            </p>
          </div>
        </div>
        {orphanVisits.length > 0 && (
          <div className="space-y-2">
            {orphanVisits.map((v: any) => (
              <div key={v.id} className="rounded-md border p-3 bg-background space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{v.address}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.date} · {v.seller}
                      {v.order_value ? ` · ${formatAmount(Number(v.order_value))} kr` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">visit_id: {v.id}</div>
                    {v.case_id && (
                      <div className="text-xs text-destructive">case_id pekar på raderat ärende: {v.case_id}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => orphanCreateCase(v)}
                    disabled={orphanBusyId === v.id}
                  >
                    {orphanBusyId === v.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Skapa ärende
                  </Button>
                  <div className="flex items-center gap-1">
                    <Input
                      type="date"
                      value={followUpInputs[v.id] || ''}
                      onChange={(e) =>
                        setFollowUpInputs((s) => ({ ...s, [v.id]: e.target.value }))
                      }
                      className="h-8 w-[150px]"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => orphanConvertToFollowUp(v)}
                      disabled={orphanBusyId === v.id || !followUpInputs[v.id]}
                    >
                      Ändra till återkoppla
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteVisitId(v.id)}
                    disabled={orphanBusyId === v.id}
                  >
                    Radera besöket
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteVisitId} onOpenChange={(o) => !o && setDeleteVisitId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera besöket?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta tar permanent bort visits-raden. Åtgärden kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteVisitId && orphanDelete(deleteVisitId)}>
              Ja, radera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>




      {issues.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          ✓ Inga avvikelser hittades — pipelinen är konsekvent.
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map(issue => (
            <div key={issue.case.id + issue.reason} className="rounded-lg border p-3 bg-card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-card-foreground truncate">
                    {issue.case.customer_name} — {issue.case.address}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm flex-wrap">
                    <Badge variant="outline">Nu: {STATUS_LABELS[issue.currentStatus] || issue.currentStatus}</Badge>
                    {issue.suggestedStatus ? (
                      <Badge>Förslag: {STATUS_LABELS[issue.suggestedStatus] || issue.suggestedStatus}</Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Manuell granskning
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{issue.reason}</p>
                </div>
                {issue.suggestedStatus && (
                  <Button
                    size="sm"
                    onClick={() => fixOne(issue)}
                    disabled={busyId === issue.case.id || busyAll}
                  >
                    {busyId === issue.case.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rätta'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
