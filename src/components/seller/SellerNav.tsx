import { cn } from '@/lib/utils';

export type SellerTab = 'pipeline' | 'deliveries' | 'calendar' | 'visit' | 'dashboard' | 'offers' | 'aorders' | 'futurejobs' | 'economy' | 'admin';

interface SellerNavProps {
  active: SellerTab;
  onChange: (tab: SellerTab) => void;
  isAdmin?: boolean;
  futureJobsDue?: number;
}

const PRIMARY_TABS: { value: SellerTab; label: string }[] = [
  { value: 'visit', label: 'Registrera besök' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'deliveries', label: 'Leveranser' },
  { value: 'calendar', label: 'Kalender' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'offers', label: 'Offerter' },
  
  { value: 'aorders', label: 'A-ordrar' },
  { value: 'futurejobs', label: 'Återkontakter' },
];

export function SellerNav({ active, onChange, isAdmin, futureJobsDue = 0 }: SellerNavProps) {
  const tabs: { value: SellerTab; label: string }[] = [
    ...PRIMARY_TABS,
    ...(isAdmin ? [{ value: 'economy' as SellerTab, label: 'Ekonomi' }] : []),
    ...(isAdmin ? [{ value: 'admin' as SellerTab, label: 'Admin' }] : []),
  ];

  return (
    <nav className="flex gap-1 px-3 md:px-0 overflow-x-auto">
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
            active === t.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          {t.label}
          {t.value === 'futurejobs' && futureJobsDue > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
              {futureJobsDue}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
