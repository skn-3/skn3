import { useQuery } from '@tanstack/react-query';
import { fetchCases } from '@/lib/supabaseClient';
import { STATUS_LABELS } from '@/lib/constants';
import { Loader2 } from 'lucide-react';

interface SellerDashboardProps {
  sellerName: string;
}

export function SellerDashboard({ sellerName }: SellerDashboardProps) {
  const { data: cases, isLoading } = useQuery({
    queryKey: ['cases', sellerName],
    queryFn: () => fetchCases({ seller: sellerName }),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const totalValue = (cases || []).reduce((sum, c) => sum + (Number(c.order_value) || 0), 0);
  const statusCounts = (cases || []).reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 px-4 md:px-0">
      <h2 className="text-xl font-bold text-foreground">Dashboard</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Totalt antal ärenden</p>
          <p className="text-3xl font-bold text-card-foreground">{cases?.length || 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Totalt ordervärde</p>
          <p className="text-3xl font-bold text-primary">{totalValue.toLocaleString('sv-SE')} kr</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Genomsnittligt ordervärde</p>
          <p className="text-3xl font-bold text-card-foreground">
            {cases?.length ? Math.round(totalValue / cases.length).toLocaleString('sv-SE') : 0} kr
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Per status</h3>
        <div className="space-y-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="flex items-center justify-between text-sm">
              <span className="text-card-foreground">{STATUS_LABELS[status] || status}</span>
              <span className="font-medium text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
