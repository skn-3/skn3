// Typ av Mockfjärds-utbetalning. Bara 'montage' betyder att montaget är betalt
// (signalen "MF betald · dags att fakturera montör"). KM och extrajobb är redan
// självfakturerade till montören via Utbetalningar.
export type PayoutKind = 'montage' | 'km' | 'extra';

type Line = { name?: string | null; note?: string | null };

/** Samma regel som backfillen: 'km' om minst en rad och ALLA rader nämner kontrollmätning. */
export function classifyPayoutKind(lines: Line[] | null | undefined): 'montage' | 'km' {
  if (!Array.isArray(lines) || lines.length === 0) return 'montage';
  return lines.every(l => `${l?.name ?? ''} ${l?.note ?? ''}`.toLowerCase().includes('kontrollmätning')) ? 'km' : 'montage';
}

export const payoutKindOf = (d: { payout_kind?: string | null }): PayoutKind =>
  (d.payout_kind === 'km' || d.payout_kind === 'extra') ? d.payout_kind : 'montage';

type PayoutDoc = { case_id: string | null; payout_kind?: string | null; invoice_date?: string | null; created_at?: string | null };

/** Senaste datum per ärende, separat för montage- och KM-utbetalningar. */
export function paidDatesByCase(docs: PayoutDoc[]) {
  const montage = new Map<string, string>();
  const km = new Map<string, string>();
  for (const d of docs) {
    if (!d.case_id) continue;
    const kind = payoutKindOf(d);
    const m = kind === 'montage' ? montage : kind === 'km' ? km : null;
    if (!m) continue;
    const date = d.invoice_date || (d.created_at ? String(d.created_at).slice(0, 10) : '');
    const prev = m.get(d.case_id);
    if (!prev || date > prev) m.set(d.case_id, date);
  }
  return { montage, km };
}
