import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@/lib/constants';
import { LogOut, Eye, Calendar, KeyRound, Check } from 'lucide-react';
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

export interface HeaderViewOption {
  label: string;
  onClick?: () => void;
  active?: boolean;
}
interface AppHeaderProps {
  role: UserRole;
  onChangeRole: () => void;
  viewOptions?: HeaderViewOption[];
  children?: React.ReactNode;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ViewSwitcher({ options, compact = false }: { options: HeaderViewOption[]; compact?: boolean }) {
  if (options.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Byt vy" className={compact ? 'h-9 px-2' : undefined}>
          <Eye className="h-4 w-4 mr-1.5" />
          Byt vy
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

export function AppHeader({ role, onChangeRole, viewOptions = [], children }: AppHeaderProps) {
  const roleLabel = role.type === 'seller' ? 'Säljare' : role.type === 'coordinator' ? 'Koordinator' : 'Montör';
  const initials = getInitials(role.name);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
      {/* Compact: two rows, used until the complete desktop row fits */}
      <div className="2xl:hidden">
        <div className="flex h-12 items-center justify-between px-3">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" alt="SmartKlimat" className="h-9 w-9 rounded-full object-contain shrink-0 dark:hidden" />
            <img src="/brand/logo-stamp-vit-n3.png" alt="SmartKlimat" className="h-9 w-9 rounded-full object-contain shrink-0 hidden dark:block" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ViewSwitcher options={viewOptions} compact />
            <ThemeToggle userKey={role.name} withPromo />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-9 w-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center hover:opacity-90 transition-opacity"
                  aria-label="Användarmeny"
                >
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-xs text-muted-foreground">{roleLabel}</div>
                  <div className="text-sm font-medium truncate">{role.name}</div>
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
                <DropdownMenuItem onClick={onChangeRole}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Logga ut
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {children && (
          <div className="border-t px-1 py-1">
            {children}
          </div>
        )}
      </div>

      {/* Desktop: single row */}
      <div className="hidden 2xl:flex h-14 items-center justify-between px-6 gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <img src="/logo.png" alt="SmartKlimat" className="h-10 w-10 rounded-full object-contain dark:hidden" />
          <img src="/brand/logo-stamp-vit-n3.png" alt="SmartKlimat" className="h-10 w-10 rounded-full object-contain hidden dark:block" />
          <span className="text-lg font-bold text-card-foreground">SmartKlimat</span>
        </div>

        <div className="flex-1 min-w-0">{children}</div>

        <div className="flex items-center gap-3 shrink-0">
          <ViewSwitcher options={viewOptions} />
          <span className="text-sm text-muted-foreground">
            {roleLabel}: <strong className="text-card-foreground">{role.name}</strong>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setCalendarOpen(true)}>
            <Calendar className="h-4 w-4 mr-1" />
            Min kalender
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPinOpen(true)}>
            <KeyRound className="h-4 w-4 mr-1" />
            Byt PIN
          </Button>
          <Button variant="ghost" size="sm" onClick={onChangeRole}>
            <LogOut className="h-4 w-4 mr-1" />
            Logga ut
          </Button>
          <ThemeToggle userKey={role.name} withPromo />
        </div>
      </div>
      <MyCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} userName={role.name} />
      <ChangePinDialog open={pinOpen} onOpenChange={setPinOpen} userName={role.name} />
    </header>
  );
}
