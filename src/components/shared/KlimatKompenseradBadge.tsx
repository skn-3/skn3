import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TreePine, ExternalLink, QrCode } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KlimatQrDialog } from '@/components/shared/KlimatQrDialog';

interface Props {
  caseId: string;
  compact?: boolean;
}

interface Row {
  case_id: string;
  kompenserad_at: string;
  tree_count: number;
  verification_id: string;
  claim_url: string | null;
  total_trees: number | null;
}

export function KlimatKompenseradBadge({ caseId, compact }: Props) {
  const [qrOpen, setQrOpen] = useState(false);
  const { data: comp } = useQuery({
    queryKey: ['case_climate_compensation', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_climate_compensation' as any)
        .select('case_id, kompenserad_at, tree_count, verification_id, claim_url, total_trees')
        .eq('case_id', caseId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Row | null) ?? null;
    },
  });

  if (!comp) return null;

  const trees = comp.total_trees ?? comp.tree_count ?? 0;
  if (trees < 1) return null;

  const proofUrl = comp.claim_url || `https://smartklimat.org/v/${comp.verification_id}`;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-green-300 dark:border-green-800 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:text-green-300"
        title={`Klimatkompenserad · ${trees} träd`}
      >
        <TreePine className="h-3 w-3" />
        {trees} träd
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge className="bg-green-600 hover:bg-green-600/90 text-white gap-1">
        <TreePine className="h-3 w-3" /> Klimatkompenserad · {trees} träd
      </Badge>
      {comp.claim_url && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={(e) => { e.stopPropagation(); setQrOpen(true); }}
        >
          <QrCode className="h-3 w-3 mr-1" /> Visa QR
        </Button>
      )}
      <a
        href={proofUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-green-700 dark:text-green-300 hover:underline inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        Visa bevis <ExternalLink className="h-3 w-3" />
      </a>
      <KlimatQrDialog open={qrOpen} onOpenChange={setQrOpen} claimUrl={comp.claim_url} treeTotal={trees} />
    </div>
  );
}
