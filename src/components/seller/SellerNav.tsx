import { cn } from '@/lib/utils';

export type SellerTab = 'pipeline' | 'calendar' | 'visit' | 'dashboard' | 'import' | 'clean-addresses' | 'validate';

interface SellerNavProps {
  active: SellerTab;
  onChange: (tab: SellerTab) => void;
  isAdmin?: boolean;
}

export function SellerNav({ active, onChange, isAdmin }: SellerNavProps) {
  const tabs: { value: SellerTab; label: string }[] = [
    { value: 'pipeline', label: 'Pipeline' },
    { value: 'calendar', label: 'Kalender' },
    { value: 'visit', label: 'Registrera besök' },
    { value: 'dashboard', label: 'Dashboard' },
    ...(isAdmin ? [
      { value: 'import' as SellerTab, label: 'Importera ärende' },
      { value: 'clean-addresses' as SellerTab, label: 'Städa adresser' },
      { value: 'validate' as SellerTab, label: 'Validera pipeline' },
    ] : []),
  ];

  return (
    <nav className="flex gap-1 px-3 md:px-0 overflow-x-auto">
      {tabs.map((t) => (
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
