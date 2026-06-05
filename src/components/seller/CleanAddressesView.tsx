import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllCases, updateCase, createCaseEvent } from '@/lib/supabaseClient';
import { logActivity } from '@/lib/activityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, MapPin, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatAmount } from '@/lib/utils';
import {
  extractCityFromAddress,
  normalizeCityKey,
  cityDisplayName,
  KNOWN_CITIES,
} from '@/lib/city';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function suggestCity(address: string): string {
  if (!address) return '';
  const last = extractCityFromAddress(address);
  if (last) return cityDisplayName(last);
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

  // Hittar ärenden där city är ifyllt men inte kanoniskt
  const normalizationGroups = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      target: string;
      variants: Map<string, { count: number; value: number; ids: string[] }>;
    }>();
    (allCases || []).forEach(c => {
      const raw = ((c as any).city || '').trim();
      if (!raw) return;
      const target = cityDisplayName(raw);
      if (!target) return;
      if (raw === target) return; // redan kanoniskt
      const key = normalizeCityKey(raw);
      if (!key) return;
      let g = groups.get(key);
      if (!g) {
        g = { key, target, variants: new Map() };
        groups.set(key, g);
      }
      let v = g.variants.get(raw);
      if (!v) {
        v = { count: 0, value: 0, ids: [] };
        g.variants.set(raw, v);
      }
      v.count++;
      v.value += Number((c as any).order_value) || 0;
      v.ids.push(c.id);
    });
    return [...groups.values()]
      .map(g => ({
        ...g,
        variantList: [...g.variants.entries()]
          .map(([variant, d]) => ({ variant, ...d }))
          .sort((a, b) => b.count - a.count),
        totalCount: [...g.variants.values()].reduce((s, v) => s + v.count, 0),
      }))
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [allCases]);

  // Local edits per case id
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [pendingNormalize, setPendingNormalize] = useState<{ key?: string; label: string; cases: { id: string; oldVal: string; address: string }[] } | null>(null);

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
    const raw = (edits[id] || '').trim();
    if (!raw) {
      toast.error('Ort saknas');
      return;
    }
    const value = cityDisplayName(raw) || raw;
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
      const raw = (edits[c.id] || '').trim();
      const value = cityDisplayName(raw) || raw;
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

  const openNormalizeGroup = (g: typeof normalizationGroups[number]) => {
    const cases: { id: string; oldVal: string; address: string }[] = [];
    g.variantList.forEach(v => {
      v.ids.forEach(id => {
        const c = (allCases || []).find(x => x.id === id);
        if (c) cases.push({ id, oldVal: v.variant, address: c.address });
      });
    });
    setPendingNormalize({ key: g.key, label: g.target, cases });
  };

  const openNormalizeAll = () => {
    const cases: { id: string; oldVal: string; address: string }[] = [];
    normalizationGroups.forEach(g => {
      g.variantList.forEach(v => {
        v.ids.forEach(id => {
          const c = (allCases || []).find(x => x.id === id);
          if (c) cases.push({ id, oldVal: v.variant, address: c.address });
        });
      });
    });
    setPendingNormalize({ label: 'alla orter', cases });
  };

  const applyNormalize = async () => {
    if (!pendingNormalize) return;
    setNormalizing(true);
    let ok = 0;
    let fail = 0;
    for (const item of pendingNormalize.cases) {
      const c = (allCases || []).find(x => x.id === item.id);
      if (!c) { fail++; continue; }
      const target = cityDisplayName(((c as any).city || '').trim());
      if (!target || target === ((c as any).city || '').trim()) continue;
      try {
        await updateCase(item.id, { city: target } as any);
        createCaseEvent({
          case_id: item.id,
          event_type: 'update',
          description: `Ort normaliserad: ${item.oldVal} → ${target}`,
          created_by: currentUser,
        }).catch(() => {});
        logActivity({
          action: 'city_normalized',
          category: 'data',
          case_id: item.id,
          description: `Normaliserade ort: ${item.oldVal} → ${target} på ${item.address}`,
          metadata: { old: item.oldVal, new: target },
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setNormalizing(false);
    setPendingNormalize(null);
    queryClient.invalidateQueries({ queryKey: ['cases_all'] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    if (fail === 0) toast.success(`${ok} ärenden normaliserade`);
    else toast.warning(`${ok} normaliserade, ${fail} misslyckades`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-4 md:px-0">
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

      {/* ---- Normalisera orter ---- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Wand2 className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Normalisera orter</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
              {normalizationGroups.reduce((s, g) => s + g.totalCount, 0)} ärenden att rätta
            </span>
            <Button
              size="sm"
              onClick={openNormalizeAll}
              disabled={normalizationGroups.length === 0 || normalizing}
            >
              Normalisera alla
            </Button>
          </div>
        </div>

        {normalizationGroups.length === 0 ? (
          <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 px-4 py-3 text-sm text-green-700 dark:text-green-300">
            Alla orter är redan kanoniska ✓
          </div>
        ) : (
          <div className="space-y-3">
            {normalizationGroups.map(g => (
              <div key={g.key} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Kanoniskt namn</div>
                    <div className="font-semibold text-card-foreground">{g.target}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openNormalizeGroup(g)} disabled={normalizing}>
                    Normalisera ({g.totalCount})
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-1 pr-3">Variant</th>
                      <th className="py-1 pr-3">Antal</th>
                      <th className="py-1 pr-3">Ordervärde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.variantList.map(v => (
                      <tr key={v.variant} className="border-t">
                        <td className="py-1 pr-3 font-medium">{v.variant}</td>
                        <td className="py-1 pr-3">{v.count}</td>
                        <td className="py-1 pr-3">{formatAmount(v.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingNormalize} onOpenChange={(o) => !o && setPendingNormalize(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Normalisera orter</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingNormalize
                ? `${pendingNormalize.cases.length} ärenden kommer få sitt ort-fält rättat till kanoniskt namn (${pendingNormalize.label}). Adress-strängen rörs inte.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={normalizing}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); applyNormalize(); }} disabled={normalizing}>
              {normalizing ? 'Normaliserar...' : 'Ja, normalisera'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
