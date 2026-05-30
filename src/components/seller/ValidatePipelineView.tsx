import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchAllCases, updateCase, createCase, createCaseEvent, fetchAllVisits, createVisit, updateVisit, deleteVisit } from '@/lib/supabaseClient';
import { findPipelineIssues, type PipelineIssue } from '@/lib/statusRules';
import { STATUS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle, Check, CalendarPlus, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLog';
import { formatAmount } from '@/lib/utils';

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
