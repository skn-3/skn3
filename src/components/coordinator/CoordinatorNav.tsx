import type { LucideIcon } from 'lucide-react';
import { Inbox, Columns3, CalendarDays, MessageSquare, FileText, ClipboardList, Wallet, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BottomNavItem } from '@/components/BottomNav';

export type CoordinatorTab = 'inbox' | 'pipeline' | 'calendar' | 'deviations' | 'offers' | 'aorders' | 'economy';

interface NavItem { value: CoordinatorTab; label: string; icon: LucideIcon }

export const COORDINATOR_PRIMARY: NavItem[] = [
  { value: 'inbox', label: 'Min inkorg', icon: Inbox },
  { value: 'pipeline', label: 'Pipeline', icon: Columns3 },
  { value: 'deviations', label: 'Ärenden', icon: MessageSquare },
  { value: 'calendar', label: 'Kalender', icon: CalendarDays },
];

export const COORDINATOR_MORE: NavItem[] = [
  { value: 'offers', label: 'Offerter', icon: FileText },
  { value: 'aorders', label: 'A-ordrar', icon: ClipboardList },
  { value: 'economy', label: 'Ekonomi', icon: Wallet },
];

interface Props {
  active: CoordinatorTab;
  onChange: (t: CoordinatorTab) => void;
}

/** Flikarna som BottomNav använder på telefon – samma källa som headern. */
export function coordinatorBottomNavItems(): { items: BottomNavItem[]; more: BottomNavItem[] } {
  const toItem = (n: NavItem): BottomNavItem => ({ key: n.value, label: n.label, icon: n.icon });
  return { items: COORDINATOR_PRIMARY.map(toItem), more: COORDINATOR_MORE.map(toItem) };
}

export function CoordinatorNav({ active, onChange }: Props) {
  const activeMore = COORDINATOR_MORE.find((m) => m.value === active);

  return (
    <nav className="flex items-stretch gap-0.5 h-full" aria-label="Huvudmeny">
      {COORDINATOR_PRIMARY.map((t) => {
        const isActive = active === t.value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative inline-flex items-center gap-2 px-3 lg:px-3.5 text-sm whitespace-nowrap transition-colors',
              isActive
                ? 'text-white font-semibold shadow-[inset_0_-3px_0_hsl(var(--gold))]'
                : 'text-ink-muted font-medium hover:text-white',
            )}
          >
            <Icon className={cn('h-[17px] w-[17px]', isActive && 'text-gold')} strokeWidth={isActive ? 2.3 : 2} />
            <span className="hidden lg:inline">{t.label}</span>
          </button>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'relative inline-flex items-center gap-2 px-3 lg:px-3.5 text-sm whitespace-nowrap transition-colors',
              activeMore ? 'text-white font-semibold shadow-[inset_0_-3px_0_hsl(var(--gold))]' : 'text-ink-muted font-medium hover:text-white',
            )}
            aria-label="Fler vyer"
          >
            {activeMore ? <activeMore.icon className="h-[17px] w-[17px] text-gold" strokeWidth={2.3} /> : null}
            <span>{activeMore ? activeMore.label : 'Mer'}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {COORDINATOR_MORE.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.value;
            return (
              <DropdownMenuItem key={t.value} onClick={() => onChange(t.value)} className="flex items-center gap-2.5 py-2.5">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{t.label}</span>
                {isActive && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
