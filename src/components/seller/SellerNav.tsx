import type { LucideIcon } from 'lucide-react';
import {
  Columns3, MessageSquare, Truck, CalendarDays, LayoutDashboard, FileText, ClipboardList, PhoneCall, Wallet, Settings, ChevronDown, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountPill } from '@/components/ui/chip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BottomNavItem } from '@/components/BottomNav';

export type SellerTab = 'pipeline' | 'arenden' | 'deliveries' | 'calendar' | 'visit' | 'dashboard' | 'offers' | 'aorders' | 'futurejobs' | 'economy' | 'admin' | 'mypay';

interface NavItem { value: SellerTab; label: string; icon: LucideIcon }

// Fyra huvudflikar i headern, resten bakom "Mer". "Registrera besök" är en handling
// (guldknappen), inte en vy, och ligger därför inte här.
export const SELLER_PRIMARY: NavItem[] = [
  { value: 'pipeline', label: 'Pipeline', icon: Columns3 },
  { value: 'arenden', label: 'Ärenden', icon: MessageSquare },
  { value: 'deliveries', label: 'Leveranser', icon: Truck },
  { value: 'calendar', label: 'Kalender', icon: CalendarDays },
];

export const SELLER_MORE: NavItem[] = [
  { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { value: 'offers', label: 'Offerter', icon: FileText },
  { value: 'aorders', label: 'A-ordrar', icon: ClipboardList },
  { value: 'futurejobs', label: 'Återkontakter', icon: PhoneCall },
];

export const SELLER_MYPAY: NavItem = { value: 'mypay', label: 'Min lön', icon: Wallet };

export const SELLER_ADMIN: NavItem[] = [
  { value: 'economy', label: 'Ekonomi', icon: Wallet },
  { value: 'admin', label: 'Admin', icon: Settings },
];

interface SellerNavProps {
  active: SellerTab;
  onChange: (tab: SellerTab) => void;
  isAdmin?: boolean;
  futureJobsDue?: number;
  showMyPay?: boolean;
}

/** Flikarna som BottomNav använder på telefon – samma källa som headern. */
export function sellerBottomNavItems(isAdmin: boolean, futureJobsDue: number, showMyPay = false): { items: BottomNavItem[]; more: BottomNavItem[] } {
  const toItem = (n: NavItem): BottomNavItem => ({
    key: n.value, label: n.label, icon: n.icon,
    badge: n.value === 'futurejobs' ? futureJobsDue : undefined,
    badgeTone: 'warning',
  });
  const primary = SELLER_PRIMARY.map(toItem);
  const more = [...SELLER_MORE, ...(showMyPay ? [SELLER_MYPAY] : []), ...(isAdmin ? SELLER_ADMIN : [])].map(toItem);
  // Tre direkt (guldknappen tar den fjärde platsen), Kalender flyttar till "Mer".
  return { items: primary.slice(0, 3), more: [...primary.slice(3), ...more] };
}

export function SellerNav({ active, onChange, isAdmin, futureJobsDue = 0, showMyPay }: SellerNavProps) {
  const more = [...SELLER_MORE, ...(showMyPay ? [SELLER_MYPAY] : []), ...(isAdmin ? SELLER_ADMIN : [])];
  const activeMore = more.find((m) => m.value === active);
  const moreBadge = futureJobsDue;

  return (
    <nav className="flex items-stretch gap-0.5 h-full" aria-label="Huvudmeny">
      {SELLER_PRIMARY.map((t) => {
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
            {moreBadge > 0 && !activeMore && <CountPill tone="onDark">{moreBadge}</CountPill>}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {more.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.value;
            return (
              <DropdownMenuItem key={t.value} onClick={() => onChange(t.value)} className="flex items-center gap-2.5 py-2.5">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{t.label}</span>
                {t.value === 'futurejobs' && futureJobsDue > 0 && <CountPill tone="warning">{futureJobsDue}</CountPill>}
                {isActive && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
