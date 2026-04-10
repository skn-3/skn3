import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCases, type CaseRow } from '@/lib/supabaseClient';
import type { UserRole } from '@/lib/constants';
import { STATUS_LABELS } from '@/lib/constants';
import { AppHeader } from '@/components/AppHeader';
import { CaseDetailPanel } from '@/components/shared/CaseDetailPanel';
import { MapPin, User, Phone, Calendar, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface MontorViewProps {
  role: UserRole;
  onChangeRole: () => void;
}

const statusOrder = ['vantar_km', 'km_bokad', 'km_klar', 'vantar_godkannande', 'godkand', 'i_produktion', 'leverans_klar', 'montage_bokat', 'montage_klart', 'fakturerad', 'pausad'];

export function MontorView({ role, onChangeRole }: MontorViewProps) {
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);

  const { data: cases, isLoading } = useQuery({
    queryKey: ['cases', 'montor', role.name],
    queryFn: () => fetchCases({ team: role.name }),
  });

  const sorted = [...(cases || [])].sort((a, b) => {
    return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader role={role} onChangeRole={onChangeRole} />

      <main className="py-4 md:py-6 max-w-2xl mx-auto px-4">
        <h2 className="text-xl font-bold text-foreground mb-4">Mina ärenden</h2>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-20">Inga ärenden tilldelade.</p>
        ) : (
          <div className="space-y-3">
            {sorted.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCase(c)}
                className="w-full text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-card-foreground">{c.address}</h3>
                  <Badge variant="secondary">{STATUS_LABELS[c.status] || c.status}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{c.customer_name}</div>
                  <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{c.customer_phone}</div>
                  {c.km_date && <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />KM: {c.km_date}</div>}
                  {c.montage_date && <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Montage: {c.montage_date}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {selectedCase && (
        <CaseDetailPanel
          caseData={selectedCase}
          currentUser={role.name}
          isSeller={false}
          onClose={() => setSelectedCase(null)}
        />
      )}
    </div>
  );
}
