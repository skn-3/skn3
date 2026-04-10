import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateVisit, type VisitRow } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

interface FollowUpSectionProps {
  visits: VisitRow[];
  sellerName: string;
}

export function FollowUpSection({ visits, sellerName }: FollowUpSectionProps) {
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async ({ id, result }: { id: string; result: string }) => {
      await updateVisit(id, { result });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast.success('Besök uppdaterat');
      setUpdatingId(null);
    },
  });

  const today = new Date();

  return (
    <div className="mx-4 md:mx-0 rounded-xl border border-yellow-300 bg-yellow-50 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-yellow-800 flex items-center gap-2">
        <CalendarClock className="h-4 w-4" />
        Att följa upp ({visits.length})
      </h3>
      <div className="space-y-2">
        {visits.map((v) => {
          const followUpDate = v.follow_up_date ? new Date(v.follow_up_date) : null;
          const isPast = followUpDate && followUpDate < today;
          const daysSince = Math.floor((today.getTime() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24));

          return (
            <div key={v.id} className="flex items-center justify-between bg-white rounded-lg p-3 text-sm border border-yellow-200">
              <div className="space-y-0.5">
                <div className="font-medium text-foreground">{v.address}</div>
                <div className="text-muted-foreground">{v.customer_name}</div>
                <div className="flex gap-2 items-center">
                  {followUpDate && (
                    <span className={isPast ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                      Återkoppla: {v.follow_up_date}
                    </span>
                  )}
                  <span className="text-muted-foreground">({daysSince} dagar sedan besök)</span>
                </div>
                {v.order_value && (
                  <span className="text-muted-foreground">{Number(v.order_value).toLocaleString('sv-SE')} kr</span>
                )}
              </div>
              <div className="flex gap-2">
                {updatingId === v.id ? (
                  <>
                    <Button size="sm" variant="default" onClick={() => {
                      updateMutation.mutate({ id: v.id, result: 'signerat' });
                    }}>
                      Signerat avtal
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      updateMutation.mutate({ id: v.id, result: 'nej' });
                    }}>
                      Nej
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setUpdatingId(null)}>Avbryt</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setUpdatingId(v.id)}>Uppdatera</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
