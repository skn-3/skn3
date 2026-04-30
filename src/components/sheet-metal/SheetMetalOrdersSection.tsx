import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Hammer } from 'lucide-react';

interface Props {
  caseId: string;
  variant?: 'panel' | 'mobile';
}

interface SheetMetalOrderRow {
  id: string;
  created_at: string;
  status: string;
  profiles: any[];
  created_by: string;
}

const STATUS_LABEL: Record<string, string> = {
  skickad: 'Skickad',
  bekraftad: 'Bekräftad',
  levererad: 'Levererad',
};

export function SheetMetalOrdersSection({ caseId, variant = 'panel' }: Props) {
  const navigate = useNavigate();

  const { data: orders } = useQuery({
    queryKey: ['sheet_metal_orders', caseId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sheet_metal_orders')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SheetMetalOrderRow[];
    },
  });

  const goOrder = () => navigate(`/case/${caseId}/sheet-metal-order`);

  return (
    <section className={variant === 'mobile' ? 'space-y-2' : 'p-4 space-y-2'}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Hammer className="h-4 w-4" /> Plåtbeställningar {orders && orders.length > 0 && `(${orders.length})`}
      </h3>

      <Button
        variant="outline"
        size={variant === 'mobile' ? 'default' : 'sm'}
        className={variant === 'mobile' ? 'w-full min-h-[48px]' : ''}
        onClick={goOrder}
      >
        <Hammer className="h-4 w-4 mr-1" /> Beställ L-Profil / Underbleck
      </Button>

      {orders && orders.length > 0 && (
        <div className="space-y-2">
          {orders.map(o => (
            <div key={o.id} className="rounded-lg border p-2 text-sm flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {Array.isArray(o.profiles) ? o.profiles.length : 0} profil{(Array.isArray(o.profiles) && o.profiles.length === 1) ? '' : 'er'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString('sv-SE')} — {o.created_by}
                </div>
              </div>
              <Badge variant="secondary">{STATUS_LABEL[o.status] || o.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
