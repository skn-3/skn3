import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type Product = {
  id?: string;
  name: string;
  price: number;
  category?: string | null;
  is_active: boolean;
  sort_order?: number;
};

export function AOrderPricesAdmin() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Product>>({});
  const [newP, setNewP] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['admin_a_order_products'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('a_order_products').select('*').order('category').order('sort_order').order('name');
      if (error) throw error;
      return data as Product[];
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) {
      const k = p.category || 'Övrigt';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return Array.from(m.entries());
  }, [products]);

  function patch(id: string, p: Partial<Product>) {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] || products.find(x => x.id === id)!), ...p } }));
  }

  async function save(id: string) {
    const d = drafts[id];
    if (!d) return;
    if (!d.name?.trim()) { toast.error('Namn krävs'); return; }
    const { error } = await (supabase as any).from('a_order_products').update({
      name: d.name, price: Number(d.price) || 0, category: d.category || null, is_active: d.is_active,
    }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Sparat');
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
    qc.invalidateQueries({ queryKey: ['admin_a_order_products'] });
    qc.invalidateQueries({ queryKey: ['a_order_products'] });
  }

  async function createNew() {
    if (!newP) return;
    if (!newP.name?.trim()) { toast.error('Namn krävs'); return; }
    const { error } = await (supabase as any).from('a_order_products').insert({
      name: newP.name, price: Number(newP.price) || 0, category: newP.category || null, is_active: newP.is_active, sort_order: 0,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Produkt tillagd');
    setNewP(null);
    qc.invalidateQueries({ queryKey: ['admin_a_order_products'] });
    qc.invalidateQueries({ queryKey: ['a_order_products'] });
  }

  function prodRow(p: Product) {
    const id = p.id!;
    const v = drafts[id] || p;
    const dirty = !!drafts[id];
    return (
      <tr key={id} className="border-t">
        <td className="p-2"><Input className="h-8" value={v.name} onChange={e => patch(id, { name: e.target.value })} /></td>
        <td className="p-2"><Input className="h-8 w-28" type="number" step="0.01" value={v.price} onChange={e => patch(id, { price: Number(e.target.value) || 0 })} /></td>
        <td className="p-2"><Input className="h-8 w-40" value={v.category || ''} onChange={e => patch(id, { category: e.target.value })} /></td>
        <td className="p-2 text-center"><Switch checked={v.is_active} onCheckedChange={c => patch(id, { is_active: c })} /></td>
        <td className="p-2 text-right">
          <Button size="sm" variant={dirty ? 'default' : 'ghost'} disabled={!dirty} onClick={() => save(id)} className="gap-1">
            <Save className="h-3 w-3" /> Spara
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Prislista A-order</h3>
        <Button size="sm" onClick={() => setNewP({ name: '', price: 0, category: '', is_active: true })} className="gap-1">
          <Plus className="h-4 w-4" /> Lägg till produkt
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Namn</th>
              <th className="p-2 text-left">Pris (kr)</th>
              <th className="p-2 text-left">Kategori</th>
              <th className="p-2 text-center">Aktiv</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Laddar...</td></tr>}
            {grouped.map(([cat, list]) => (
              <>
                <tr key={`h-${cat}`} className="bg-muted/30"><td colSpan={5} className="p-2 font-semibold text-xs uppercase text-muted-foreground">{cat}</td></tr>
                {list.map(prodRow)}
              </>
            ))}
            {newP && (
              <tr className="border-t bg-amber-50">
                <td className="p-2"><Input className="h-8" placeholder="Namn *" value={newP.name} onChange={e => setNewP({ ...newP, name: e.target.value })} /></td>
                <td className="p-2"><Input className="h-8 w-28" type="number" step="0.01" value={newP.price} onChange={e => setNewP({ ...newP, price: Number(e.target.value) || 0 })} /></td>
                <td className="p-2"><Input className="h-8 w-40" placeholder="Kategori" value={newP.category || ''} onChange={e => setNewP({ ...newP, category: e.target.value })} /></td>
                <td className="p-2 text-center"><Switch checked={newP.is_active} onCheckedChange={c => setNewP({ ...newP, is_active: c })} /></td>
                <td className="p-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setNewP(null)}>Avbryt</Button>
                  <Button size="sm" onClick={createNew}>Lägg till</Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
