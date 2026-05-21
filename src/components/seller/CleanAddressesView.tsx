import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllCases, updateCase, createCaseEvent } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { formatAmount } from '@/lib/utils';

const KNOWN_CITIES = [
  'Nykvarn', 'Tullinge', 'Lidingö', 'Stockholm', 'Danderyd', 'Ekerö', 'Vällingby',
  'Järfälla', 'Spånga', 'Norsborg', 'Rönninge', 'Södertälje', 'Huddinge', 'Täby',
  'Solna', 'Sundbyberg', 'Bromma', 'Nacka', 'Tyresö', 'Haninge', 'Botkyrka',
  'Sollentuna', 'Upplands Väsby',
];

function suggestCity(address: string): string {
  if (!address) return '';
  if (address.includes(',')) {
    const after = address.substring(address.lastIndexOf(',') + 1).trim();
    if (after) return after;
  }
  const lower = address.toLowerCase();
  for (const c of KNOWN_CITIES) {
    if (lower.endsWith(c.toLowerCase())) return c;
  }
  return '';
}

interface Props {
  currentUser: string;
}

export function CleanAddressesView({ currentUser }: Props) {
  const queryClient = useQueryClient();
  const { data: allCases, isLoading } = useQuery({
    queryKey: ['cases_all'],
    queryFn: fetchAllCases,
  });

  const missing = useMemo(() => {
    return (allCases || [])
      .filter(c => {
        const city = ((c as any).city || '').trim();
        return !city;
      })
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [allCases]);

  // Local edits per case id
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  // Initialize edits with suggestions when data loads/changes
  const initializedKey = useMemo(() => missing.map(c => c.id).join(','), [missing]);
  useMemo(() => {
    setEdits(prev => {
      const next = { ...prev };
      missing.forEach(c => {
        if (next[c.id] === undefined) {
          next[c.id] = suggestCity(c.address);
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializedKey]);

  const saveOne = async (id: string, address: string) => {
    const value = (edits[id] || '').trim();
    if (!value) {
      toast.error('Ort saknas');
      return;
    }
    setSavingId(id);
    try {
      await updateCase(id, { city: value } as any);
      await createCaseEvent({
        case_id: id,
        event_type: 'update',
        description: `Ort tillagd: ${value}`,
        created_by: currentUser,
      });
      toast.success(`Ort sparad för ${address}`);
      queryClient.invalidateQueries({ queryKey: ['cases_all'] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      setEdits(prev => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    } catch (e: any) {
      toast.error('Kunde inte spara: ' + e.message);
    } finally {
      setSavingId(null);
    }
  };

  const saveAll = async () => {
    const toSave = missing.filter(c => (edits[c.id] || '').trim() !== '');
    if (toSave.length === 0) {
      toast.error('Inga rader att spara — fyll i ort först');
      return;
    }
    setSavingAll(true);
    let ok = 0;
    let fail = 0;
    for (const c of toSave) {
      const value = (edits[c.id] || '').trim();
      try {
        await updateCase(c.id, { city: value } as any);
        await createCaseEvent({
          case_id: c.id,
          event_type: 'update',
          description: `Ort tillagd: ${value}`,
          created_by: currentUser,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setSavingAll(false);
    queryClient.invalidateQueries({ queryKey: ['cases_all'] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    if (fail === 0) toast.success(`${ok} ärenden uppdaterade`);
    else toast.warning(`${ok} sparade, ${fail} misslyckades`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 px-4 md:px-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Städa adresser</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
            {missing.length} ärenden saknar ort
          </span>
          <Button
            onClick={saveAll}
            disabled={savingAll || missing.length === 0}
            size="sm"
          >
            {savingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Spara alla
          </Button>
        </div>
      </div>

      {missing.length === 0 ? (
        <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          Inga ärenden saknar ort — allt är städat ✓
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="px-3 py-2">Adress</th>
                <th className="px-3 py-2">Säljare</th>
                <th className="px-3 py-2">Ordervärde</th>
                <th className="px-3 py-2">Förslag</th>
                <th className="px-3 py-2">Ort</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {missing.map(c => {
                const suggestion = suggestCity(c.address);
                const val = edits[c.id] ?? suggestion;
                return (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2 font-medium text-card-foreground">{c.address}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.seller || '–'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatAmount(Number(c.order_value) || 0)}</td>
                    <td className="px-3 py-2 text-muted-foreground italic">
                      {suggestion || '–'}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={val}
                        onChange={(e) => setEdits(prev => ({ ...prev, [c.id]: e.target.value }))}
                        className="h-8 w-40"
                        placeholder="Ange ort..."
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveOne(c.id, c.address)}
                        disabled={savingId === c.id || !(edits[c.id] ?? suggestion).trim()}
                      >
                        {savingId === c.id ? 'Sparar...' : 'Spara'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
