import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCases, fetchVisits, type CaseRow } from '@/lib/supabaseClient';
import { SELLER_PIPELINE_COLUMNS, STATUS_LABELS, SELLERS } from '@/lib/constants';
import { CaseCard } from './CaseCard';
import { FollowUpSection } from './FollowUpSection';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface PipelineProps {
  sellerName: string;
  isAdmin?: boolean;
  onSelectCase: (c: CaseRow) => void;
}

export function Pipeline({ sellerName, isAdmin, onSelectCase }: PipelineProps) {
  const [adminFilter, setAdminFilter] = useState<string>('alla');

  const queryFilter = isAdmin ? {} : { seller: sellerName };

  const { data: cases, isLoading } = useQuery({
    queryKey: ['cases', isAdmin ? 'admin' : sellerName],
    queryFn: () => fetchCases(queryFilter),
  });

  const { data: visits } = useQuery({
    queryKey: ['visits', isAdmin ? 'admin' : sellerName],
    queryFn: () => fetchVisits(isAdmin ? {} : { seller: sellerName }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const followUps = (visits || []).filter((v) => v.result === 'aterkoppla' && !v.case_id);

  // Apply admin seller filter
  const filteredCases = (cases || []).filter(c => {
    if (!isAdmin) return true;
    if (adminFilter === 'alla') return true;
    return c.seller === adminFilter;
  });

  const showSellerBadge = !!isAdmin && adminFilter === 'alla';

  const grouped = SELLER_PIPELINE_COLUMNS.reduce((acc, status) => {
    acc[status] = filteredCases.filter((c) => {
      if (status === 'godkand') return c.status === 'godkand' || c.status === 'i_produktion';
      return c.status === status;
    });
    return acc;
  }, {} as Record<string, CaseRow[]>);

  const columnLabels: Record<string, string> = {
    ...STATUS_LABELS,
    godkand: 'Godkänd / I produktion',
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="px-4 md:px-0 flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Visa säljare</Label>
            <Select value={adminFilter} onValueChange={setAdminFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alla">Alla</SelectItem>
                {SELLERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

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
                  <CaseCard key={c.id} caseData={c} onClick={() => onSelectCase(c)} showSeller={showSellerBadge} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
