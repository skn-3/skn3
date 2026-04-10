import { useQuery } from '@tanstack/react-query';
import { fetchCases, fetchVisits, type CaseRow } from '@/lib/supabaseClient';
import { SELLER_PIPELINE_COLUMNS, STATUS_LABELS } from '@/lib/constants';
import { CaseCard } from './CaseCard';
import { FollowUpSection } from './FollowUpSection';
import { Loader2 } from 'lucide-react';

interface PipelineProps {
  sellerName: string;
  onSelectCase: (c: CaseRow) => void;
}

export function Pipeline({ sellerName, onSelectCase }: PipelineProps) {
  const { data: cases, isLoading } = useQuery({
    queryKey: ['cases', sellerName],
    queryFn: () => fetchCases({ seller: sellerName }),
  });

  const { data: visits } = useQuery({
    queryKey: ['visits', sellerName],
    queryFn: () => fetchVisits({ seller: sellerName }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const followUps = (visits || []).filter((v) => v.result === 'aterkoppla' && !v.case_id);

  // Debug logging
  if (cases) {
    console.log('Alla ärenden:', cases);
    console.log('Statusar:', [...new Set(cases.map(c => c.status))]);
  }

  const grouped = SELLER_PIPELINE_COLUMNS.reduce((acc, status) => {
    acc[status] = (cases || []).filter((c) => {
      if (status === 'godkand') return c.status === 'godkand' || c.status === 'i_produktion';
      return c.status === status;
    });
    return acc;
  }, {} as Record<string, CaseRow[]>);

  console.log('Kolumn-filter:', Object.fromEntries(
    SELLER_PIPELINE_COLUMNS.map(s => [s, grouped[s]?.length || 0])
  ));

  const columnLabels: Record<string, string> = {
    ...STATUS_LABELS,
    godkand: 'Godkänd / I produktion',
  };

  return (
    <div className="space-y-4">
      {followUps.length > 0 && (
        <FollowUpSection visits={followUps} sellerName={sellerName} />
      )}

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max px-4 md:px-0">
          {SELLER_PIPELINE_COLUMNS.map((status) => (
            <div key={status} className="w-56 shrink-0">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {columnLabels[status] || STATUS_LABELS[status]}
                </h2>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                  {grouped[status]?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {grouped[status]?.map((c) => (
                  <CaseCard key={c.id} caseData={c} onClick={() => onSelectCase(c)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
