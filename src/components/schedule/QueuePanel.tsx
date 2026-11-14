import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
import {
  QUEUE_HELP, QUEUE_LABELS, QUEUE_PAGE, moreLabel, queueCardMeta, queueTotal, searchQueue, waitIsLong, waitLabel,
  type QueueItem, type QueueName, type Queues,
} from '@/lib/schedule';
import { segmentClasses } from './eventStyle';

interface Props {
  queues: Queues;
  tab: QueueName;
  onTab: (q: QueueName) => void;
  selectedCaseId: string | null;
  onPick: (item: QueueItem) => void;
  /** Visas i sidopanel: stängknapp. */
  onClose?: () => void;
}

const ORDER: QueueName[] = ['km', 'montage', 'datum'];

export function QueuePanel({ queues, tab, onTab, selectedCaseId, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(QUEUE_PAGE);
  useEffect(() => { setShown(QUEUE_PAGE); }, [tab, query]);
  const items = useMemo(() => searchQueue(queues[tab], query), [queues, tab, query]);
  const visible = items.slice(0, shown);
  const remaining = items.length - visible.length;

  return (
    <section aria-labelledby="schedule-queue-title" className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 id="schedule-queue-title" className="font-display text-lg font-semibold">Att boka</h2>
        <Chip tone="warning" className="bg-gold-soft text-foreground font-mono">{queueTotal(queues)}</Chip>
        {onClose && (
          <Button variant="ghost" size="icon" className="ml-auto h-11 w-11" onClick={onClose} aria-label="Stäng Att boka">
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Kö">
        {ORDER.map(q => (
          <button key={q} type="button" aria-pressed={tab === q} onClick={() => onTab(q)} className={cn(segmentClasses(tab === q), 'flex-auto whitespace-nowrap px-2 text-[13px]')}>
            <span>{QUEUE_LABELS[q]}</span>
            <span className="font-mono text-xs">{queues[q].length}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{QUEUE_HELP[tab]}</p>

      <label className="relative block">
        <span className="sr-only">Sök adress, ort eller kund</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Sök adress, ort eller kund" className="h-11 pl-9 text-base" />
      </label>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
        {queues[tab].length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Kön är tom.</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Inga ärenden matchar sökningen.</p>
        ) : (
          visible.map(item => <QueueCard key={item.caseId} item={item} selected={item.caseId === selectedCaseId} onPick={onPick} />)
        )}
        {remaining > 0 && (
          <Button variant="outline" className="min-h-11" onClick={() => setShown(s => s + QUEUE_PAGE)}>{moreLabel(remaining)}</Button>
        )}
      </div>
    </section>
  );
}

function QueueCard({ item, selected, onPick }: { item: QueueItem; selected: boolean; onPick: (i: QueueItem) => void }) {
  const meta = queueCardMeta(item);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onPick(item)}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-xl border p-3 text-left motion-safe:transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        selected ? 'border-gold bg-gold-soft text-foreground' : 'border-border bg-card',
      )}
    >
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{item.address}</span>
        {item.units != null && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.units} enh</span>}
      </span>
      {meta && <span className="truncate text-sm text-muted-foreground">{meta}</span>}
      <span className="flex flex-wrap gap-1.5">
        <Chip className={waitIsLong(item.waitingDays) ? 'bg-gold-soft text-foreground' : undefined}>{waitLabel(item.waitingDays)}</Chip>
        <Chip>{item.team ?? 'Inget team'}</Chip>
        {item.deliveryLabel && <Chip tone="info">{item.deliveryLabel}</Chip>}
      </span>
    </button>
  );
}
