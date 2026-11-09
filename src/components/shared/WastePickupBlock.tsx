import { useState } from 'react';
import { CheckCircle2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CaseRow } from '@/lib/supabaseClient';
import { formatDaySv } from '@/lib/dateSv';
import { wastePickupState } from '@/lib/wastePickup';
import { useWastePickup } from '@/hooks/useWastePickup';
import { WasteBookForm, WasteRequestFields } from '@/components/shared/WastePickupForms';

/** Skräphämtning i ärendepanelen. Renderas bara för personal (anroparen styr). */
export function WastePickupBlock({ caseData, currentUser }: { caseData: CaseRow; currentUser: string }) {
  const { request, book } = useWastePickup(currentUser);
  const [mode, setMode] = useState<'idle' | 'request' | 'book'>('idle');
  const [note, setNote] = useState('');
  const [earliest, setEarliest] = useState('');
  const state = wastePickupState(caseData);
  const c = caseData;

  return (
    <section className="p-4 space-y-2" aria-label="Skräphämtning">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Truck className="h-4 w-4" /> Skräphämtning (Ragn-Sells)
      </h3>

      {state === 'booked' && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Bokad till {formatDaySv(c.waste_pickup_date)} av {c.waste_pickup_booked_by || 'okänd'}</span>
        </div>
      )}

      {state === 'requested' && (
        <div className="space-y-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/40 px-3 py-2 text-sm">
          <div className="font-medium">
            Begärd av {c.waste_pickup_requested_by || 'okänd'} {formatDaySv(c.waste_pickup_requested_at)}
          </div>
          {c.waste_pickup_note && <p className="text-muted-foreground whitespace-pre-wrap">{c.waste_pickup_note}</p>}
          {c.waste_pickup_earliest && <p className="text-xs text-muted-foreground">Tidigast {formatDaySv(c.waste_pickup_earliest)}</p>}
          {mode === 'book' ? (
            <WasteBookForm
              idPrefix={`panel-book-${c.id}`}
              pending={book.isPending}
              onCancel={() => setMode('idle')}
              onSave={(date, n) => book.mutate({ c, date, note: n }, { onSuccess: () => setMode('idle') })}
            />
          ) : (
            <Button className="min-h-12 gap-2" onClick={() => setMode('book')}>
              <Truck className="h-4 w-4" /> Markera bokad
            </Button>
          )}
        </div>
      )}

      {state === 'none' && (
        mode === 'request' ? (
          <div className="space-y-3 rounded-lg border p-3">
            <WasteRequestFields idPrefix={`panel-req-${c.id}`} note={note} setNote={setNote} earliest={earliest} setEarliest={setEarliest} />
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-12"
                disabled={request.isPending}
                onClick={() => request.mutate({ c, note, earliest }, { onSuccess: () => { setMode('idle'); setNote(''); setEarliest(''); } })}
              >
                {request.isPending ? 'Skickar...' : 'Begär hämtning'}
              </Button>
              <Button variant="ghost" className="min-h-12" onClick={() => setMode('idle')}>Avbryt</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Ingen hämtning begärd.</span>
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setMode('request')}>
              <Truck className="h-4 w-4" /> Begär hämtning
            </Button>
          </div>
        )
      )}
    </section>
  );
}
