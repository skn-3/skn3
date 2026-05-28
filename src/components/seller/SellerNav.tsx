import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

export type SellerTab = 'pipeline' | 'calendar' | 'visit' | 'dashboard' | 'import' | 'clean-addresses' | 'validate' | 'activity-log';

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
];

const ADMIN_TABS: { value: SellerTab; label: string }[] = [
  { value: 'import', label: 'Importera ärende' },
  { value: 'clean-addresses', label: 'Städa adresser' },
  { value: 'validate', label: 'Validera pipeline' },
  { value: 'activity-log', label: 'Aktivitetslogg' },
];

export function SellerNav({ active, onChange, isAdmin }: SellerNavProps) {
  const isMobile = useIsMobile();

  const tabBtn = (t: { value: SellerTab; label: string }) => (
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
  );

  // Mobile: collapse admin tabs into a "Mer ▾" dropdown so nothing gets clipped.
  if (isMobile) {
    const activeAdmin = ADMIN_TABS.find(t => t.value === active);
    const visibleTabs = [...PRIMARY_TABS];
    // If an admin tab is active, surface it inline so the active state is always visible.
    if (activeAdmin) visibleTabs.push(activeAdmin);

    return (
      <nav className="flex gap-1 px-3 md:px-0 overflow-x-auto items-center">
        {visibleTabs.map(tabBtn)}
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
                'text-muted-foreground hover:bg-muted'
              )}
            >
              Mer <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ADMIN_TABS.map(t => (
                <DropdownMenuItem
                  key={t.value}
                  onSelect={() => onChange(t.value)}
                  className={cn(active === t.value && 'bg-muted font-medium')}
                >
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    );
  }

  const tabs = [...PRIMARY_TABS, ...(isAdmin ? ADMIN_TABS : [])];
  return (
    <nav className="flex gap-1 px-3 md:px-0 overflow-x-auto">
      {tabs.map(tabBtn)}
    </nav>
  );
}
