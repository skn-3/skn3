import { cn } from '@/lib/utils';

export type SellerTab = 'pipeline' | 'new' | 'visit' | 'dashboard';

interface SellerNavProps {
  active: SellerTab;
  onChange: (tab: SellerTab) => void;
}

export function SellerNav({ active, onChange }: SellerNavProps) {
  const tabs: { value: SellerTab; label: string }[] = [
    { value: 'pipeline', label: 'Pipeline' },
    { value: 'new', label: 'Nytt ärende' },
    { value: 'visit', label: 'Registrera besök' },
    { value: 'dashboard', label: 'Dashboard' },
  ];

  return (
    <nav className="flex gap-1 px-4 md:px-0 overflow-x-auto">
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
