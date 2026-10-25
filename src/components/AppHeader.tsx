import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@/lib/constants';
import { LogOut, Eye, Calendar, KeyRound, Check, ChevronDown } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MyCalendarDialog } from '@/components/calendar/MyCalendarDialog';
import { ChangePinDialog } from '@/components/ChangePinDialog';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export interface HeaderViewOption {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

export interface HeaderAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}

interface AppHeaderProps {
  role: UserRole;
  onChangeRole: () => void;
  viewOptions?: HeaderViewOption[];
  /** Huvudmenyn på md+ (SellerNav / CoordinatorNav). På telefon ligger menyn i BottomNav i stället. */
  children?: React.ReactNode;
  /** Sidans huvudhandling, i guld. Visas i headern på md+, på telefon ligger den i BottomNav. */
  action?: HeaderAction;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ViewSwitcher({ options }: { options: HeaderViewOption[] }) {
  if (options.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="onDark" size="sm" aria-label="Byt vy" className="h-10 px-2.5 md:px-3">
          <Eye className="h-4 w-4" />
          <span className="hidden md:inline">Byt vy</span>
          <ChevronDown className="hidden md:block h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Byt vy</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuItem
            key={option.label}
            onClick={option.active ? undefined : option.onClick}
            className="flex items-center justify-between"
          >
            <span>{option.label}</span>
            {option.active && <Check className="h-4 w-4 text-primary" aria-label="Nuvarande vy" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 shrink-0 select-none">
      <img src="/brand/logo-stamp-vit-n3.png" alt="SmartKlimat N3prenad" className={compact ? 'h-8 w-8 object-contain' : 'h-9 w-9 object-contain'} />
      <span className="flex flex-col leading-none">
        <span className={`font-display font-bold text-white ${compact ? 'text-[15px]' : 'text-[17px]'}`}>SmartKlimat</span>
        <span className={`uppercase text-ink-muted ${compact ? 'text-[9.5px] tracking-[0.14em]' : 'text-[10.5px] tracking-[0.14em]'}`}>N3prenad</span>
      </span>
    </div>
  );
}

export function AppHeader({ role, onChangeRole, viewOptions = [], children, action }: AppHeaderProps) {
  const roleLabel = role.type === 'seller' ? 'Säljare' : role.type === 'coordinator' ? 'Koordinator' : 'Montör';
  const initials = getInitials(role.name);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-ink-deep text-white shadow-[0_1px_0_hsl(var(--ink-deep))]">
      <div className="mx-auto flex h-14 md:h-[60px] max-w-[1600px] items-center gap-3 md:gap-5 px-3 md:px-6">
        <div className="md:hidden"><Brand compact /></div>
        <div className="hidden md:block"><Brand /></div>

        {children && (
          <div className="hidden md:flex min-w-0 flex-1 items-stretch self-stretch overflow-x-auto">
            {children}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5 md:gap-2 shrink-0">
          {action && (
            <Button
              variant="gold"
              className={`hidden md:inline-flex h-10 ${action.active ? 'ring-2 ring-white/40' : ''}`}
              onClick={action.onClick}
              aria-pressed={action.active}
            >
              {action.icon}
              {action.label}
            </Button>
          )}
          <ViewSwitcher options={viewOptions} />
          <ThemeToggle userKey={role.name} onDark />
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-10 w-10 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center ring-2 ring-sage hover:ring-gold transition-colors"
                aria-label={`${role.name}, ${roleLabel.toLowerCase()} – användarmeny`}
              >
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-xs text-muted-foreground">{roleLabel}</div>
                <div className="text-sm font-semibold truncate">{role.name}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCalendarOpen(true)}>
                <Calendar className="h-4 w-4 mr-2" />
                Min kalender
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPinOpen(true)}>
                <KeyRound className="h-4 w-4 mr-2" />
                Byt PIN
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onChangeRole}>
                <LogOut className="h-4 w-4 mr-2" />
                Logga ut
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <MyCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} userName={role.name} />
      <ChangePinDialog open={pinOpen} onOpenChange={setPinOpen} userName={role.name} />
    </header>
  );
}
