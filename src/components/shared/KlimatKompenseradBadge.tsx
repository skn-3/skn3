import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TreePine, ExternalLink, QrCode } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Chip } from '@/components/ui/chip';
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
  const { data: klimatStatus } = useQuery({
    queryKey: ['case_klimat_status', caseId],
    queryFn: async () => {
      const { data } = await supabase.from('cases').select('klimat_status').eq('id', caseId).maybeSingle();
      return ((data as any)?.klimat_status as string | null) ?? null;
    },
  });

  if (!comp) return null;

  const trees = comp.total_trees ?? comp.tree_count ?? 0;
  if (trees < 1) return null;

  const pending = klimatStatus === 'pending';
  const proofUrl = comp.claim_url || `https://smartklimat.org/v/${comp.verification_id}`;

  if (compact) {
    return pending ? (
      <Chip tone="warning" icon={<TreePine />} title={`${trees} träd väntar på kundens bekräftelse`}>
        {trees} träd väntar
      </Chip>
    ) : (
      <Chip tone="success" icon={<TreePine />} title={`Klimatkompenserad · ${trees} träd`}>
        {trees} träd
      </Chip>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {pending ? (
        <Chip tone="warning" size="md" icon={<TreePine />}>{trees} träd väntar på kundens bekräftelse</Chip>
      ) : (
        <Chip tone="successFilled" size="md" icon={<TreePine className="text-gold" />}>Klimatkompenserad · {trees} träd</Chip>
      )}
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
        className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        Visa bevis <ExternalLink className="h-3 w-3" />
      </a>
      <KlimatQrDialog open={qrOpen} onOpenChange={setQrOpen} claimUrl={comp.claim_url} treeTotal={trees} />
    </div>
  );
}
