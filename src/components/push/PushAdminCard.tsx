import { useQuery } from '@tanstack/react-query';
import { Bell, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Chip } from '@/components/ui/chip';
import { pushAdminSummary, pushDevicesText, pushLastSuccessText, pushRoleLabel, sortPushAdminRows, type PushAdminRow } from '@/lib/push/admin';

/** Kortet "Notiser" i Kalenderkoppling: vilka som har slagit på notiser (admin och koordinator). */
export function PushAdminCard() {
  const q = useQuery({
    queryKey: ['push-admin-overview'],
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PushAdminRow[]> => {
      const { data, error } = await supabase.rpc('push_admin_overview');
      if (error) throw error;
      return sortPushAdminRows(((data ?? []) as PushAdminRow[]).map((r) => ({ ...r, devices: Number(r.devices) || 0 })));
    },
  });
  const rows = q.data ?? [];
  const now = new Date();
  return (
    <section aria-labelledby="push-admin-title" className="space-y-3 rounded-[14px] border border-border bg-card p-4 md:p-5">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Bell className="h-5 w-5" aria-hidden="true" /></span>
        <div className="space-y-0.5">
          <h2 id="push-admin-title" className="font-display text-xl font-bold">Notiser</h2>
          <p className="text-[15px] text-muted-foreground">{q.data ? pushAdminSummary(rows) : 'Vilka som får chattmeddelanden som notiser på telefon eller dator.'}</p>
        </div>
      </header>
      {q.isLoading ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Hämtar...</p>
      ) : q.isError ? (
        <p className="text-destructive">Översikten över notiser kunde inte hämtas.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.user_id} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="text-sm text-muted-foreground">{pushRoleLabel(r)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{r.devices > 0 ? `Senaste utskick: ${pushLastSuccessText(r.last_success_at, now)}` : ''}</span>
                <Chip tone={r.devices > 0 ? 'success' : 'warning'}>{pushDevicesText(r.devices)}</Chip>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
