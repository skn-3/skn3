import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateVisit, type VisitRow } from '@/lib/supabaseClient';
import { LOST_REASONS, COMPETITORS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

interface LostVisitDialogProps {
  visit: VisitRow | null;
  onClose: () => void;
}

export function LostVisitDialog({ visit, onClose }: LostVisitDialogProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [reason, setReason] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [otherCompetitor, setOtherCompetitor] = useState('');
  const [comment, setComment] = useState('');

  const reset = () => {
    setReason('');
    setCompetitor('');
    setOtherCompetitor('');
    setComment('');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!visit) throw new Error('Inget besök valt');
      const reasonLabel = LOST_REASONS.find(r => r.value === reason)?.label || reason;
      let competitorValue: string | null = null;
      if (reason === 'konkurrent') {
        if (competitor === 'annan') {
          competitorValue = otherCompetitor.trim() || null;
        } else if (competitor) {
          competitorValue = COMPETITORS.find(c => c.value === competitor)?.label || competitor;
        }
      }
      await updateVisit(visit.id, {
        lost: true,
        lost_reason: reasonLabel,
        lost_competitor: competitorValue,
        lost_comment: comment.trim() || null,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast.success('Besök markerat som tappad');
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error('Kunde inte spara: ' + e.message),
  });

  const canSubmit = !!reason &&
    (reason !== 'konkurrent' || (!!competitor && (competitor !== 'annan' || !!otherCompetitor.trim())));

  return (
    <Sheet open={!!visit} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'h-[85vh] overflow-y-auto' : 'w-full sm:max-w-md overflow-y-auto'}
      >
        <SheetHeader>
          <SheetTitle>Markera besök som tappad</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label>Anledning *</Label>
            <Select value={reason} onValueChange={(v) => { setReason(v); if (v !== 'konkurrent') { setCompetitor(''); setOtherCompetitor(''); } }}>
              <SelectTrigger><SelectValue placeholder="Välj anledning..." /></SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {reason === 'konkurrent' && (
            <div className="space-y-1.5">
              <Label>Konkurrent *</Label>
              <Select value={competitor} onValueChange={(v) => { setCompetitor(v); if (v !== 'annan') setOtherCompetitor(''); }}>
                <SelectTrigger><SelectValue placeholder="Välj konkurrent..." /></SelectTrigger>
                <SelectContent>
                  {COMPETITORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {reason === 'konkurrent' && competitor === 'annan' && (
            <div className="space-y-1.5">
              <Label>Ange konkurrent *</Label>
              <Input value={otherCompetitor} onChange={(e) => setOtherCompetitor(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Kommentar</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { reset(); onClose(); }} disabled={mutation.isPending}>Avbryt</Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending ? 'Sparar...' : 'Bekräfta'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
