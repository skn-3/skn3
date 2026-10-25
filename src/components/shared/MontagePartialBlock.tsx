import { ListChecks } from 'lucide-react';
import { formatDaySv } from '@/lib/dateSv';
import { hasMontagePartial } from '@/lib/montagePartial';

export function MontagePartialBlock({ caseData }: { caseData: { montage_partial_at?: string | null; montage_partial_note?: string | null; status: string } }) {
  if (!hasMontagePartial(caseData)) return null;
  return <section className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-warning-ink space-y-2">
    <h2 className="flex items-center gap-2 font-display font-semibold"><ListChecks className="h-5 w-5" />Delrapport</h2>
    <p className="text-sm whitespace-pre-wrap break-words">Allt är klart utom: {caseData.montage_partial_note}</p>
    {caseData.montage_partial_at && <p className="text-xs">{formatDaySv(caseData.montage_partial_at)}</p>}
  </section>;
}