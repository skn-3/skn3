import { useRef, useState } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

import type { AOrderStatusGroup, AOrderStatusKey } from '@/lib/aOrderStatusSummary';
import { Button } from '@/components/ui/button';

const DOT: Record<AOrderStatusKey, string> = {
  order: 'bg-yellow-500',
  invoiced: 'bg-blue-600',
  paid: 'bg-emerald-600',
};

const INSTALLER_DOT: Record<AOrderStatusKey, string> = { order: 'bg-gold', invoiced: 'bg-ink', paid: 'bg-success' };

function Dot({ group, appearance }: { group: AOrderStatusGroup; appearance?: 'installer' }) {
  const [open, setOpen] = useState(false);
  const lastPointer = useRef<string>('mouse');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Button
          variant="ghost"
          type="button"
          aria-expanded={open}
          className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted/60 ${appearance === 'installer' ? 'h-11' : 'h-auto'}`}
          onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
          onClick={() => {
            if (lastPointer.current === 'mouse') setOpen(true);
            else setOpen((v) => !v);
          }}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${appearance === 'installer' ? INSTALLER_DOT[group.key] : DOT[group.key]}`} />
          <span className="font-medium tabular-nums">{group.total}</span>
          <span className="text-muted-foreground">{group.label}</span>
        </Button>
      </PopoverAnchor>

      <PopoverContent
        side="bottom"
        align="end"
        className="w-auto min-w-[160px] p-2.5 text-xs"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="font-medium mb-1">{group.label} · {group.total}</div>
        {group.total === 0 ? (
          <div className="text-muted-foreground">Inga A-ordrar</div>
        ) : (
          group.byTeam.map((t) => (
            <div key={t.team} className="flex justify-between gap-4">
              <span>{t.team}</span>
              <span className="tabular-nums">{t.count}</span>
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AOrderStatusDots({ groups, appearance }: { groups: AOrderStatusGroup[]; appearance?: 'installer' }) {
  return (
    <div className="inline-flex items-center gap-1">
      {groups.map((g) => <Dot key={g.key} group={g} appearance={appearance} />)}
    </div>
  );
}
