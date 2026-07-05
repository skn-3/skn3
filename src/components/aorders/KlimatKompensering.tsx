import { useQuery } from '@tanstack/react-query';
import { TreePine, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';

interface Props {
  orderId: string;
}

interface CompensationRow {
  order_id: string;
  klimat_kompenserad_at: string;
  klimat_tree_count: number;
  klimat_verification_id: string;
}

export function KlimatKompensering({ orderId }: Props) {
  const { data: comp } = useQuery({
    queryKey: ['order_climate_compensation', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_climate_compensation' as any)
        .select('order_id, klimat_kompenserad_at, klimat_tree_count, klimat_verification_id')
        .eq('order_id', orderId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CompensationRow | null) ?? null;
    },
  });

  if (!comp) return null;

  const proofUrl = `https://smartklimat.org/v/${comp.klimat_verification_id}`;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge className="bg-green-600 hover:bg-green-600/90 text-white gap-1">
        <TreePine className="h-3 w-3" /> Klimatkompenserad · {comp.klimat_tree_count} träd
      </Badge>
      <a
        href={proofUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-green-700 hover:underline inline-flex items-center gap-1"
      >
        Visa bevis <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
