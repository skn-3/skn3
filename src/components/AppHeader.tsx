import { Button } from '@/components/ui/button';
import type { UserRole } from '@/lib/constants';
import { LogOut, Eye } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AppHeaderProps {
  role: UserRole;
  onChangeRole: () => void;
  toggleView?: { label: string; onClick: () => void };
  children?: React.ReactNode;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppHeader({ role, onChangeRole, toggleView, children }: AppHeaderProps) {
  const roleLabel = role.type === 'seller' ? 'Säljare' : 'Montör';
  const initials = getInitials(role.name);

  return (
    <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
      {/* Mobile: two rows */}
      <div className="md:hidden">
        <div className="flex h-12 items-center justify-between px-3">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" alt="SmartKlimat" className="h-9 w-9 rounded-full object-contain shrink-0" />
          </div>
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
              {toggleView && (
                <DropdownMenuItem onClick={toggleView.onClick}>
                  <Eye className="h-4 w-4 mr-2" />
                  {toggleView.label}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onChangeRole}>
                <LogOut className="h-4 w-4 mr-2" />
                Byt roll
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {children && (
          <div className="border-t px-1 py-1">
            {children}
          </div>
        )}
      </div>

      {/* Desktop: single row */}
      <div className="hidden md:flex h-14 items-center justify-between px-6 gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <img src="/logo.png" alt="SmartKlimat" className="h-10 w-10 rounded-full object-contain" />
          <span className="text-lg font-bold text-card-foreground">SmartKlimat</span>
        </div>

        <div className="flex-1 min-w-0">{children}</div>

        <div className="flex items-center gap-3 shrink-0">
          {toggleView && (
            <Button variant="outline" size="sm" onClick={toggleView.onClick}>
              <Eye className="h-4 w-4 mr-1" /> {toggleView.label}
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {roleLabel}: <strong className="text-card-foreground">{role.name}</strong>
          </span>
          <Button variant="ghost" size="sm" onClick={onChangeRole}>
            <LogOut className="h-4 w-4 mr-1" />
            Byt roll
          </Button>
        </div>
      </div>
    </header>
  );
}
