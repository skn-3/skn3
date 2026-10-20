export type AOrderStatusKey = 'order' | 'invoiced' | 'paid';
export interface AOrderStatusGroup { key: AOrderStatusKey; label: string; total: number; byTeam: { team: string; count: number }[] }

const LABELS: Record<AOrderStatusKey, string> = { order: 'Order', invoiced: 'Fakturerad', paid: 'Betald' };

/** Tre grupper: Order (status 'order'), Fakturerad (status 'invoiced' utan paid_at), Betald (status 'invoiced' med paid_at). Krediterade räknas inte. */
export function summarizeAOrderStatuses(
  orders: { status?: string | null; paid_at?: string | null; montor_teams?: { name?: string | null } | null }[],
): AOrderStatusGroup[] {
  const counts: Record<AOrderStatusKey, Map<string, number>> = { order: new Map(), invoiced: new Map(), paid: new Map() };
  for (const o of orders) {
    let key: AOrderStatusKey | null = null;
    if (o.status === 'order') key = 'order';
    else if (o.status === 'invoiced') key = o.paid_at ? 'paid' : 'invoiced';
    if (!key) continue;
    const team = o.montor_teams?.name?.trim() || 'Ej tilldelad';
    counts[key].set(team, (counts[key].get(team) ?? 0) + 1);
  }
  return (['order', 'invoiced', 'paid'] as AOrderStatusKey[]).map((key) => {
    const byTeam = [...counts[key].entries()]
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team, 'sv'));
    return { key, label: LABELS[key], total: byTeam.reduce((s, t) => s + t.count, 0), byTeam };
  });
}
