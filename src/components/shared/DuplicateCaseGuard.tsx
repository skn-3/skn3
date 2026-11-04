import { useCallback, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { findSameAddress, parseAddress } from '@/lib/caseMatching';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { caseStatusLabel } from '@/components/shared/CaseMatchCandidates';

export interface DuplicateCase {
  id: string;
  address: string;
  city?: string | null;
  customer_name?: string | null;
  status?: string | null;
  seller?: string | null;
}

/** Hämta ärenden med samma gata + husnummer (endast adress, kund, säljare och status). */
export async function findDuplicateCases(address: string, excludeId?: string | null): Promise<DuplicateCase[]> {
  const parsed = parseAddress(address);
  if (!parsed.valid) return [];
  const { data, error } = await (supabase as any)
    .from('cases')
    .select('id, address, city, customer_name, status, seller')
    .ilike('address', `%${parsed.number}%`)
    .limit(5000);
  if (error) throw error;
  return findSameAddress((data || []) as DuplicateCase[], address, excludeId ?? null);
}

/** "Ett ärende på Soprangränd 6 finns redan: Ulf Wencke, Montage klart (Daniel Malke)." */
export function duplicateCaseText(c: DuplicateCase) {
  const who = [c.customer_name, caseStatusLabel(c.status)].filter(Boolean).join(', ');
  return `Ett ärende på ${c.address} finns redan: ${who}${c.seller ? ` (${c.seller})` : ''}.`;
}

interface GuardState { matches: DuplicateCase[]; proceed: () => void }

interface Options {
  /** Körs innan navigering till det befintliga ärendet, t.ex. för att stänga formuläret. */
  onOpenCase?: () => void;
  /** Valfri extra knapp, t.ex. "Koppla till det ärendet" i nya kundtjänstärenden. */
  extraAction?: { label: string; run: (c: DuplicateCase) => void };
}

/**
 * Varning innan ett ärende skapas på en adress som redan finns. Blockerar inte,
 * men användaren måste välja "Öppna det ärendet" eller "Skapa ändå".
 */
export function useDuplicateCaseGuard(options: Options = {}): { guard: (address: string, proceed: () => void, excludeId?: string | null) => Promise<void>; dialog: ReactNode; checking: boolean } {
  const navigate = useNavigate();
  const [state, setState] = useState<GuardState | null>(null);
  const [checking, setChecking] = useState(false);

  const guard = useCallback(async (address: string, proceed: () => void, excludeId?: string | null) => {
    let matches: DuplicateCase[] = [];
    setChecking(true);
    try {
      matches = await findDuplicateCases(address, excludeId);
    } catch (e) {
      // Kontrollen är ett skydd, inte ett krav: ett uppslagsfel får inte stoppa sparandet.
      console.warn('Dubblettkontroll misslyckades', e);
    } finally {
      setChecking(false);
    }
    if (!matches.length) { proceed(); return; }
    setState({ matches, proceed });
  }, []);

  const first = state?.matches[0] ?? null;
  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(o) => { if (!o) setState(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning-ink" /> Ärendet kan redan finnas
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {state?.matches.slice(0, 3).map(c => <p key={c.id} className="text-foreground">{duplicateCaseText(c)}</p>)}
              {(state?.matches.length ?? 0) > 3 && <p>Ytterligare {(state?.matches.length ?? 0) - 3} ärenden på samma adress.</p>}
              <p>Kontrollera att det verkligen är ett nytt ärende innan du skapar det.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          {first && options.extraAction && (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => { const c = first; setState(null); options.extraAction!.run(c); }}
            >
              {options.extraAction.label}
            </Button>
          )}
          {first && (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => { const id = first.id; setState(null); options.onOpenCase?.(); navigate(`/?case=${id}`); }}
            >
              Öppna det ärendet
            </Button>
          )}
          <Button
            className="min-h-11"
            onClick={() => { const p = state?.proceed; setState(null); p?.(); }}
          >
            Skapa ändå
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { guard, dialog, checking };
}
