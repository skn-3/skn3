import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchAllCases, updateCase, createCaseEvent } from '@/lib/supabaseClient';
import { findPipelineIssues, type PipelineIssue } from '@/lib/statusRules';
import { STATUS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  currentUser: string;
}

export function ValidatePipelineView({ currentUser }: Props) {
  const qc = useQueryClient();
  const { data: allCases, isLoading } = useQuery({
    queryKey: ['cases_all_validate'],
    queryFn: fetchAllCases,
  });

  const issues = useMemo<PipelineIssue[]>(() => findPipelineIssues(allCases || []), [allCases]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

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
