// "Nästa lön" – preliminär förhandsvisning av nästa lönekörning. Används i adminfliken och på Min lön.
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Chip } from '@/components/ui/chip';
import type { Tone } from '@/lib/statusTheme';
import { monthLabel } from '@/lib/consultantPay';
import { fmtKr } from './consultantApi';

export const PAYOUT_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Utkast', tone: 'neutral' },
  invoiced: { label: 'Fakturerad', tone: 'info' },
  sent: { label: 'Skickad', tone: 'sage' },
  paid: { label: 'Betald', tone: 'success' },
};

export interface ExistingPayoutSummary { invoice_number?: number | null; status?: string | null; net_amount?: number | null }

interface Props {
  preview: any | null;
  loading: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
  onStart?: (folderId: string) => void;
  existingPayout?: ExistingPayoutSummary | null;
  footnote?: string;
}

const fmtDateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function Row({ label, value, strong, big }: { label: string; value: string; strong?: boolean; big?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 ${strong ? 'border-t border-border pt-2 mt-1' : ''}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${big ? 'text-2xl font-semibold' : strong ? 'font-semibold' : 'text-sm'}`}>{value}</span>
    </div>
  );
}

export function NextPayoutCard({ preview, loading, refreshing, onRefresh, onStart, existingPayout, footnote }: Props) {
  const p = preview;
  const title = `Nästa lön${p?.payout_month ? ` · ${monthLabel(p.payout_month)}` : ''}`;

  const actions = (
    <div className="flex flex-wrap gap-2 pt-4">
      {onStart && p?.state === 'ready' && p.folder_id && (
        <Button onClick={() => onStart(p.folder_id)}><Play className="h-4 w-4 mr-1" />Starta körning</Button>
      )}
      <Button variant="outline" onClick={onRefresh} disabled={refreshing || loading}>
        {refreshing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}Uppdatera
      </Button>
    </div>
  );

  let body: React.ReactNode;
  if (loading && !p) {
    body = (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-72" />
        <div className="grid md:grid-cols-2 gap-6 pt-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-28 w-full" /></div>
      </div>
    );
  } else if (!p) {
    body = <p className="text-sm text-muted-foreground">Ingen förhandsvisning ännu. Tryck Uppdatera för att läsa Drive.</p>;
  } else if (p.state === 'already_invoiced') {
    const st = PAYOUT_STATUS[existingPayout?.status ?? ''];
    body = (
      <div className="space-y-1">
        <p className="font-medium">
          Senaste körningen är klar: faktura {existingPayout?.invoice_number ?? '—'} · {st?.label ?? existingPayout?.status ?? '—'} · netto {fmtKr(existingPayout?.net_amount)}
        </p>
        <p className="text-sm text-muted-foreground">Inget nytt underlag i Drive ännu.</p>
      </div>
    );
  } else if (p.state === 'no_provision') {
    body = (
      <div className="space-y-1">
        <p className="font-medium">Mappen {p.folder_name} finns men saknar provisions-PDF.</p>
        <p className="text-sm text-muted-foreground">{p.deduction_file_count ?? 0} kvittofiler i mappen.</p>
      </div>
    );
  } else if (p.state === 'no_folder') {
    body = <p className="font-medium">Ingen månadsmapp hittades i Drive.{p.error ? ` ${p.error}.` : ''}</p>;
  } else if (p.state === 'error') {
    body = (
      <div className="space-y-1">
        <p className="font-medium text-destructive">Förhandsvisningen kunde inte tas fram.</p>
        {p.error && <p className="text-sm text-muted-foreground">{p.error}</p>}
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        {p.tb_needs_review && (
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="warning">Underlaget behöver granskas</Chip>
            {p.tb_note && <span className="text-xs text-muted-foreground">{p.tb_note}</span>}
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-6 md:gap-10">
          <div>
            <div className="text-xs text-muted-foreground">Täckningsbidrag</div>
            <div className="text-3xl font-semibold tabular-nums">{fmtKr(p.tb_amount)}</div>
            <div className="text-sm text-muted-foreground tabular-nums mt-1">{p.tier_pct} % → {fmtKr(p.commission_gross)}</div>
          </div>
          <div className="space-y-1.5">
            <Row label="Provision" value={fmtKr(p.commission_gross)} />
            <Row label="− Standardavdrag" value={`−${fmtKr(p.standard_deductions)}`} />
            <div className="text-xs text-muted-foreground">Kvitton: {p.deduction_file_count ?? 0} filer – tolkas vid körningen</div>
            <Row label="= Preliminärt netto" value={fmtKr(p.net_estimate)} strong big />
            <Row label="+ Moms" value={fmtKr(p.vat_estimate)} />
            <Row label="= Totalt" value={fmtKr(p.total_estimate)} strong />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="p-5 md:p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          {p?.folder_name && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {p.folder_name}{p.provision_file_name ? ` · underlag ${p.provision_file_name}` : ''} · tolkat {fmtDateTime(p.computed_at)}
            </p>
          )}
          {footnote && <p className="text-xs text-muted-foreground mt-1">{footnote}</p>}
        </div>
        {body}
        {actions}
      </CardContent>
    </Card>
  );
}
