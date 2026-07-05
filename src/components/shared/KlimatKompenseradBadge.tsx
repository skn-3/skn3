import { useQuery } from '@tanstack/react-query';
import { TreePine, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';

interface Props {
  caseId: string;
  compact?: boolean;
}

interface Row {
  case_id: string;
  kompenserad_at: string;
  tree_count: number;
  verification_id: string;
}

export function KlimatKompenseradBadge({ caseId, compact }: Props) {
  const { data: comp } = useQuery({
    queryKey: ['case_climate_compensation', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_climate_compensation' as any)
        .select('case_id, kompenserad_at, tree_count, verification_id')
        .eq('case_id', caseId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Row | null) ?? null;
    },
  });

  if (!comp) return null;

  const proofUrl = `https://smartklimat.org/v/${comp.verification_id}`;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800"
        title={`Klimatkompenserad · ${comp.tree_count} träd`}
      >
        <TreePine className="h-3 w-3" />
        {comp.tree_count} träd
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge className="bg-green-600 hover:bg-green-600/90 text-white gap-1">
        <TreePine className="h-3 w-3" /> Klimatkompenserad · {comp.tree_count} träd
      </Badge>
      <a
        href={proofUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-green-700 hover:underline inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        Visa bevis <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
