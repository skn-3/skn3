import { MapPin, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/chip';
import type { ChatCase } from '@/hooks/useChatCases';

export function ChatCaseCard({ caseData, loading, onOpen }: { caseData?: ChatCase; loading?: boolean; onOpen: () => void }) {
  if (!caseData) return <div className="min-h-14 rounded-lg border bg-card p-3 text-sm text-muted-foreground">{loading ? 'Hämtar ärende…' : 'Ärende du inte har tillgång till'}</div>;
  return <Button variant="outline" onClick={onOpen} className="h-auto min-h-14 w-full gap-2 bg-card p-3 text-left text-card-foreground whitespace-normal">
    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
    <span className="min-w-0 flex-1 space-y-1">
      <span className="block font-semibold break-words">{caseData.address}</span>
      <span className="block text-xs font-normal text-muted-foreground break-words">{caseData.customer_name}{caseData.city ? ` · ${caseData.city}` : ''}</span>
      <StatusChip status={caseData.status} />
    </span>
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
  </Button>;
}