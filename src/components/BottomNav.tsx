import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Menu, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Bottenmenyn på telefon (< 768 px). Fem platser: fyra flikar och "Mer",
// eller tre flikar, en upphöjd guldknapp i mitten (sidans huvudhandling) och "Mer".

export interface BottomNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeTone?: 'danger' | 'warning';
}

export interface BottomNavAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
}

interface Props {
  /** Flikarna som syns direkt (max 4 utan action, max 3 med action). */
  items: BottomNavItem[];
  /** Flikarna bakom "Mer". */
  more?: BottomNavItem[];
  active: string;
  onChange: (key: string) => void;
  action?: BottomNavAction;
}

function Badge({ n, tone }: { n?: number; tone?: 'danger' | 'warning' }) {
  if (!n || n <= 0) return null;
  return (
    <span
      className={cn(
        'absolute -top-0.5 right-1/2 translate-x-3 min-w-4 h-4 px-1 rounded-full font-mono text-[10px] font-semibold leading-4 text-center',
        tone === 'warning' ? 'bg-gold text-gold-foreground' : 'bg-destructive text-destructive-foreground',
      )}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function BottomNav({ items, more = [], active, onChange, action }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const activeInMore = more.find((m) => m.key === active);
  const visible = action ? items.slice(0, 3) : items.slice(0, 4);
  const hasMore = more.length > 0 || items.length > visible.length;
  const hidden = [...items.slice(visible.length), ...more];

  const tab = (it: BottomNavItem) => {
    const isActive = active === it.key;
    const Icon = it.icon;
    return (
      <button
        key={it.key}
        type="button"
        onClick={() => onChange(it.key)}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-semibold transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 2} />
        <span className="truncate max-w-full">{it.label}</span>
        <Badge n={it.badge} tone={it.badgeTone} />
      </button>
    );
  };

  const cols = (action ? 1 : 0) + visible.length + (hasMore ? 1 : 0);

  return (
    <>
      <nav
        aria-label="Huvudmeny"
        className="fixed inset-x-0 bottom-0 z-40 md:hidden border-t border-border bg-card/95 backdrop-blur safe-bottom"
      >
        <div className="grid items-end gap-1 px-2 pt-1.5 pb-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {visible.slice(0, action ? 2 : visible.length).map(tab)}
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              aria-pressed={action.active}
              className="flex min-h-12 flex-col items-center justify-end gap-1 text-[11px] font-bold text-foreground"
            >
              <span
                className={cn(
                  '-mt-7 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gold text-gold-foreground shadow-lift transition-transform active:scale-95',
                  action.active && 'ring-4 ring-primary/20',
                )}
              >
                <action.icon className="h-6 w-6" strokeWidth={2.6} />
              </span>
              <span>{action.label}</span>
            </button>
          )}
          {action && visible.slice(2).map(tab)}
          {hasMore && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                'relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-semibold',
                activeInMore ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Menu className="h-[22px] w-[22px]" strokeWidth={activeInMore ? 2.4 : 2} />
              <span className="truncate max-w-full">{activeInMore ? activeInMore.label : 'Mer'}</span>
              <Badge n={hidden.reduce((s, m) => s + (m.badge || 0), 0)} tone="warning" />
            </button>
          )}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom,0px)]">
          <SheetHeader className="px-5 pt-4 pb-2 text-left">
            <SheetTitle className="font-display text-lg">Fler vyer</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-1 gap-1 px-3 pb-4">
            {hidden.map((it) => {
              const Icon = it.icon;
              const isActive = active === it.key;
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => { onChange(it.key); setMoreOpen(false); }}
                  className={cn(
                    'flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold transition-colors',
                    isActive ? 'bg-success-soft text-primary' : 'text-foreground hover:bg-accent',
                  )}
                >
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex-1">{it.label}</span>
                  {!!it.badge && it.badge > 0 && (
                    <span className={cn('rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold', it.badgeTone === 'warning' ? 'bg-warning-soft text-warning-ink' : 'bg-destructive-soft text-destructive')}>{it.badge}</span>
                  )}
                  {isActive && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
