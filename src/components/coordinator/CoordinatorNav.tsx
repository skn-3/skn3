import { cn } from '@/lib/utils';

export type CoordinatorTab = 'inbox' | 'pipeline' | 'calendar' | 'deviations' | 'offers' | 'uppdrag' | 'economy';

interface Props {
  active: CoordinatorTab;
  onChange: (t: CoordinatorTab) => void;
}

const TABS: { value: CoordinatorTab; label: string }[] = [
  { value: 'inbox', label: 'Min inkorg' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'calendar', label: 'Kalender' },
  { value: 'deviations', label: 'Reklamationer' },
  { value: 'offers', label: 'Offerter' },
  { value: 'uppdrag', label: 'Uppdrag' },
  { value: 'economy', label: 'Ekonomi' },
];

export function CoordinatorNav({ active, onChange }: Props) {
  return (
    <nav className="flex gap-1 px-3 md:px-0 overflow-x-auto">
      {TABS.map(t => (
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
