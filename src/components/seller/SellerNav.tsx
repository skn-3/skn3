import { cn } from '@/lib/utils';

type Tab = 'pipeline' | 'new' | 'dashboard';

interface SellerNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function SellerNav({ active, onChange }: SellerNavProps) {
  const tabs: { value: Tab; label: string }[] = [
    { value: 'pipeline', label: 'Pipeline' },
    { value: 'new', label: 'Nytt ärende' },
    { value: 'dashboard', label: 'Dashboard' },
  ];

  return (
    <nav className="flex gap-1 px-4 md:px-0">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
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
