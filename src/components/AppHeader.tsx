import { Button } from '@/components/ui/button';
import type { UserRole } from '@/lib/constants';
import { LogOut } from 'lucide-react';

interface AppHeaderProps {
  role: UserRole;
  onChangeRole: () => void;
  children?: React.ReactNode;
}

export function AppHeader({ role, onChangeRole, children }: AppHeaderProps) {
  const roleLabel = role.type === 'seller' ? 'Säljare' : 'Montör';

  return (
    <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="SmartKlimat" className="h-10 w-10 rounded-full object-contain" />
          <span className="text-lg font-bold text-card-foreground hidden sm:inline">SmartKlimat</span>
        </div>

        {children}

        <div className="flex items-center gap-3">
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
