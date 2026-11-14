import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { updatePopupEnabled, useCalendarSettings } from '@/hooks/useCalendar';
import { isLocalSkip } from '@/lib/booking/messages';
import {
  KIND_TEXT, OVERVIEW_TEXTS as T, STATUS_TEXT, actionFor, lastFetchedText, remindConfirm, remindCount, statusOf, summaryLine,
  type OverviewStatus,
} from '@/lib/calendar/overview';
import type { OverviewRow } from '@/lib/calendar/types';

async function connect<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('calendar-connect', { body });
  if (error) throw error;
  return data as T;
}

const STATUS_CLASS: Record<OverviewStatus, string> = {
  connected: 'bg-success-soft text-primary',
  not_connected: 'bg-gold-soft text-foreground',
  no_login: 'bg-muted text-muted-foreground',
};

function StatusPill({ row }: { row: OverviewRow }) {
  const s = statusOf(row);
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', STATUS_CLASS[s])}>
      {s === 'connected' && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
      {STATUS_TEXT[s]}
    </span>
  );
}

interface Props { currentUser: string; isAdmin: boolean }

/** Adminöversikten "Kalenderkoppling" (admin och koordinator). */
export function CalendarConnectionsAdmin({ currentUser, isAdmin }: Props) {
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: ['calendar-overview'], queryFn: () => connect<{ rows: OverviewRow[] }>({ action: 'overview' }) });
  const settings = useCalendarSettings();
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null);
  const rows = overview.data?.rows ?? [];
  const now = new Date();
  const toRemind = remindCount(rows);
  const refresh = () => qc.invalidateQueries({ queryKey: ['calendar-overview'] });

  const toggle = useMutation({
    mutationFn: (v: boolean) => updatePopupEnabled(v, currentUser),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-settings'] }),
    onError: (e: Error) => toast.error(`Inställningen kunde inte sparas: ${e.message}`),
  });

  const send = useMutation({
    mutationFn: (name: string) => connect<{ sent?: boolean; to?: string; reason?: string; skipped?: string }>({ action: 'send_guide', user_name: name }),
    onSuccess: (r, name) => {
      if (r.sent) toast.success(`Guiden skickad till ${r.to}`);
      else if (isLocalSkip(r)) toast.info(`Mejl skickas inte i testmiljön (${name}).`);
      else if (r.reason === 'no_email') toast.warning(`${name}: ${T.missingEmail}`);
      refresh();
    },
    onError: (e: Error) => toast.error(`Guiden kunde inte skickas: ${e.message}`),
  });

  const rotate = useMutation({
    mutationFn: (name: string) => connect<{ ok: boolean }>({ action: 'rotate', user_name: name }),
    onSuccess: (_r, name) => { toast.success(`Ny länk skapad för ${name}`); setConfirmRotate(null); refresh(); },
    onError: (e: Error) => toast.error(`Ny länk kunde inte skapas: ${e.message}`),
  });

  const remindAll = useMutation({
    mutationFn: () => connect<{ sent: number; without_email: number; skipped?: string; skipped_count?: number }>({ action: 'remind_all' }),
    onSuccess: (r) => {
      setConfirmAll(false);
      if (r.skipped) toast.info(`Mejl skickas inte i testmiljön (${r.skipped_count} mottagare).`);
      else toast.success(`Guiden skickad till ${r.sent}. ${r.without_email} saknar mejladress.`);
      refresh();
    },
    onError: (e: Error) => toast.error(`Påminnelsen kunde inte skickas: ${e.message}`),
  });

  const actionCell = (row: OverviewRow) => {
    const a = actionFor(row);
    if (a.action === 'rotate') {
      if (!isAdmin && row.name !== currentUser) return <span className="text-sm text-muted-foreground">Bara admin</span>;
      if (confirmRotate === row.name) {
        return (
          <div role="alertdialog" aria-label="Ny länk" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive-soft p-2.5 text-sm">
            <p>{T.rotateConfirm}</p>
            <div className="flex gap-2">
              <Button variant="destructive" className="h-11" disabled={rotate.isPending} onClick={() => rotate.mutate(row.name)}>Ny länk</Button>
              <Button variant="outline" className="h-11" onClick={() => setConfirmRotate(null)}>Avbryt</Button>
            </div>
          </div>
        );
      }
      return <Button variant="outline" className="h-11" onClick={() => setConfirmRotate(row.name)}>{a.label}</Button>;
    }
    return (
      <div className="space-y-1">
        <Button variant="outline" className="h-11" disabled={a.disabled || (send.isPending && send.variables === row.name)} onClick={() => send.mutate(row.name)}>
          {send.isPending && send.variables === row.name && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {a.label}
        </Button>
        {a.note && <p className="text-xs text-muted-foreground">{a.note}</p>}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">{T.title}</h1>
        {overview.data && <p className="text-[15px] text-muted-foreground">{summaryLine(rows)}</p>}
      </header>

      <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-border bg-card p-4">
        <label className="flex min-h-11 flex-1 items-center gap-3 text-[15px] font-semibold">
          <Switch checked={settings.data?.popup_enabled ?? true} disabled={toggle.isPending || settings.isLoading} onCheckedChange={(v) => toggle.mutate(v)} />
          {T.toggle}
        </label>
        {confirmAll ? (
          <div role="alertdialog" aria-label={T.remindAll} className="flex flex-wrap items-center gap-2 rounded-lg border border-gold bg-gold-soft p-2.5 text-sm text-foreground">
            <p className="font-semibold">{remindConfirm(toRemind)}</p>
            <Button className="h-11" disabled={remindAll.isPending} onClick={() => remindAll.mutate()}>{remindAll.isPending ? 'Skickar...' : 'Skicka'}</Button>
            <Button variant="outline" className="h-11" onClick={() => setConfirmAll(false)}>Avbryt</Button>
          </div>
        ) : (
          <Button variant="outline" className="h-11" disabled={toRemind === 0} onClick={() => setConfirmAll(true)}>{T.remindAll}</Button>
        )}
      </div>

      {overview.isLoading ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Hämtar...</p>
      ) : overview.isError ? (
        <p className="text-destructive">Översikten kunde inte hämtas.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-[14px] border border-border bg-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.06em] text-muted-foreground">
                <tr>{T.columns.map((c) => <th key={c} scope="col" className="px-4 py-3 font-semibold">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.name} className="align-top">
                    <th scope="row" className="px-4 py-3 font-semibold">{r.name}</th>
                    <td className="px-4 py-3">{KIND_TEXT[r.kind]}</td>
                    <td className="px-4 py-3"><StatusPill row={r} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{lastFetchedText(r, now)}</td>
                    <td className="px-4 py-3">{actionCell(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.name} className="space-y-2 rounded-[14px] border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-sm text-muted-foreground">{KIND_TEXT[r.kind]}</p>
                  </div>
                  <StatusPill row={r} />
                </div>
                <p className="text-sm text-muted-foreground">{lastFetchedText(r, now)}</p>
                {actionCell(r)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
