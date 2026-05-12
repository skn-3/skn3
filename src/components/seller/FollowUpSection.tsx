import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateVisit, type VisitRow } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { CalendarClock, ChevronDown, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { SignedCaseDialog } from './SignedCaseDialog';

const STORAGE_KEY = 'followup-collapsed';

interface FollowUpSectionProps {
  visits: VisitRow[];
  sellerName: string;
}

export function FollowUpSection({ visits, sellerName }: FollowUpSectionProps) {
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [signedVisit, setSignedVisit] = useState<VisitRow | null>(null);

  // Filter out lost visits
  const activeVisits = visits.filter(v => !v.lost);

  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved === 'true';
    return activeVisits.length > 5;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      await updateVisit(id, updates as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast.success('Besök uppdaterat');
      setUpdatingId(null);
    },
  });

  const lostMutation = useMutation({
    mutationFn: async (id: string) => {
      await updateVisit(id, { lost: true } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast.success('Besök markerat som tappad');
    },
  });

  const today = new Date();

  if (activeVisits.length === 0) return null;

  return (
    <div className="mx-4 md:mx-0 rounded-xl border border-yellow-300 bg-yellow-50 p-4 space-y-3">
      <button
        type="button"
        className="w-full flex items-center gap-2 text-sm font-semibold text-yellow-800 cursor-pointer hover:text-yellow-900 transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <CalendarClock className="h-4 w-4" />
        Att följa upp ({activeVisits.length})
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {activeVisits.map((v) => {
            const followUpDate = v.follow_up_date ? new Date(v.follow_up_date) : null;
            const isPast = followUpDate && followUpDate < today;
            const daysSince = Math.floor((today.getTime() - new Date(v.date).getTime()) / (1000 * 60 * 60 * 24));

            return (
              <div key={v.id} className="flex items-center justify-between bg-white rounded-lg p-3 text-sm border border-yellow-200">
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground">{v.address}</div>
                  <div className="text-muted-foreground">{v.customer_name}</div>
                  <div className="flex gap-2 items-center">
                    {followUpDate && (
                      <span className={isPast ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                        Återkoppla: {new Date(v.follow_up_date!).toLocaleDateString('sv-SE')}
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
                        setSignedVisit(v);
                        setUpdatingId(null);
                      }}>
                        Signerat avtal
                      </Button>
                      <Button size="sm" variant="outline" disabled={updateMutation.isPending} onClick={() => {
                        updateMutation.mutate({ id: v.id, updates: { result: 'nej' } });
                      }}>
                        Nej
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setUpdatingId(null)}>Avbryt</Button>
                    </>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setUpdatingId(v.id)}>Uppdatera</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={lostMutation.isPending}
                        onClick={() => lostMutation.mutate(v.id)}
                        title="Markera som tappad"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Tappad
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
