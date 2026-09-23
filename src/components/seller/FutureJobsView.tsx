import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { differenceInCalendarDays } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2, Check, Trash2, ChevronDown, CalendarPlus } from 'lucide-react';
import { FutureJobDialog } from './FutureJobDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { CaseRow } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

export interface FutureJobRow {
  id: string;
  case_id: string | null;
  customer_name: string;
  address: string | null;
  phone: string | null;
  seller: string;
  description: string;
  contact_date: string;
  status: string;
  created_at: string;
}

export async function fetchFutureJobs(): Promise<FutureJobRow[]> {
  const { data, error } = await supabase
    .from('future_jobs')
    .select('*')
    .order('contact_date', { ascending: true });
  if (error) throw error;
  return (data || []) as FutureJobRow[];
}

export function countDueFutureJobs(rows: FutureJobRow[] | undefined): number {
  if (!rows) return 0;
  const today = new Date().toISOString().split('T')[0];
  return rows.filter(r => r.status === 'open' && r.contact_date <= today).length;
}

export function countdown(dateStr: string): { label: string; cls: string } {
  const days = differenceInCalendarDays(new Date(dateStr + 'T00:00:00'), new Date(new Date().toDateString()));
  if (days < 0) return { label: `Försenad ${Math.abs(days)} dagar`, cls: 'border-red-400 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300' };
  if (days === 0) return { label: 'Idag', cls: 'border-amber-400 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' };
  return { label: `Om ${days} dagar`, cls: 'border-border bg-muted text-muted-foreground' };
}

interface Props {
  currentUser: string;
  onSelectCase?: (c: CaseRow) => void;
}

export function FutureJobsView({ currentUser, onSelectCase }: Props) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<'mina' | 'alla'>('mina');
  const [dropTarget, setDropTarget] = useState<FutureJobRow | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['future_jobs'],
    queryFn: fetchFutureJobs,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('future_jobs').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['future_jobs'] });
      toast.success('Uppdaterad');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCase = async (caseId: string) => {
    if (!onSelectCase) return;
    const { data } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle();
    if (data) onSelectCase(data as CaseRow);
    else toast.info('Kunde inte hitta ärendet');
  };

  const filtered = (rows || []).filter(r => scope === 'alla' || r.seller === currentUser);
  const open = filtered.filter(r => r.status === 'open');
  const handled = filtered.filter(r => r.status !== 'open');

  const renderRow = (r: FutureJobRow, muted = false) => {
    const cd = countdown(r.contact_date);
    return (
      <div key={r.id} className={cn('rounded-lg border bg-card p-3 space-y-1.5', muted && 'opacity-60')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">
            {r.case_id && onSelectCase ? (
              <button className="text-primary underline underline-offset-2 hover:no-underline" onClick={() => openCase(r.case_id!)}>
                {r.customer_name}{r.address ? ` — ${r.address}` : ''}
              </button>
            ) : (
              <span>{r.customer_name}{r.address ? ` — ${r.address}` : ''}</span>
            )}
          </div>
          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', cd.cls)}>
            {muted ? (r.status === 'contacted' ? 'Kontaktad' : 'Borttagen') : cd.label}
          </span>
        </div>
        <p className="text-sm text-card-foreground whitespace-pre-wrap">{r.description}</p>
        <p className="text-xs text-muted-foreground">
          {r.seller} · planerad kontakt {r.contact_date}{r.phone ? ` · ${r.phone}` : ''}
        </p>
        {!muted && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: r.id, status: 'contacted' })}>
              <Check className="h-4 w-4 mr-1" /> Markera kontaktad
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDropTarget(r)}>
              <Trash2 className="h-4 w-4 mr-1" /> Ta bort
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-3 md:px-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold mr-auto">Återkontakter</h2>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <CalendarPlus className="h-4 w-4 mr-1" /> Ny återkontakt
        </Button>
        <Button size="sm" variant={scope === 'mina' ? 'default' : 'outline'} onClick={() => setScope('mina')}>Mina</Button>
        <Button size="sm" variant={scope === 'alla' ? 'default' : 'outline'} onClick={() => setScope('alla')}>Alla</Button>
      </div>

      <FutureJobDialog open={newOpen} onOpenChange={setNewOpen} currentUser={currentUser} />

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga öppna återkontakter.</p>
          ) : (
            <div className="space-y-2">{open.map(r => renderRow(r))}</div>
          )}

          {handled.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronDown className="h-4 w-4" /> Hanterade ({handled.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {handled.map(r => renderRow(r, true))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      <AlertDialog open={!!dropTarget} onOpenChange={(o) => { if (!o) setDropTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort återkontakt?</AlertDialogTitle>
            <AlertDialogDescription>
              {dropTarget?.customer_name} tas bort från listan över återkontakter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (dropTarget) setStatus.mutate({ id: dropTarget.id, status: 'dropped' }); setDropTarget(null); }}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
