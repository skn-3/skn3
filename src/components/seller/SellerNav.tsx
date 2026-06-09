import { cn } from '@/lib/utils';

export type SellerTab = 'pipeline' | 'calendar' | 'visit' | 'dashboard' | 'offers' | 'economy' | 'admin';

interface SellerNavProps {
  active: SellerTab;
  onChange: (tab: SellerTab) => void;
  isAdmin?: boolean;
}

const PRIMARY_TABS: { value: SellerTab; label: string }[] = [
  { value: 'visit', label: 'Registrera besök' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'calendar', label: 'Kalender' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'offers', label: 'Offerter' },
];

export function SellerNav({ active, onChange, isAdmin }: SellerNavProps) {
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
        </button>
      ))}
    </nav>
  );
}
