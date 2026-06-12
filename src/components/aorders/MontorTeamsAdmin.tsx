import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type Team = {
  id?: string;
  name: string;
  company_name?: string | null;
  org_nr?: string | null;
  address?: string | null;
  email?: string | null;
  invoice_email?: string | null;
  bankgiro?: string | null;
  invoice_prefix?: string | null;
  next_invoice_number?: number | null;
  is_active: boolean;
};

const EMPTY: Team = { name: '', company_name: '', org_nr: '', address: '', email: '', invoice_email: '', bankgiro: '', invoice_prefix: '', next_invoice_number: 1, is_active: true };

export function MontorTeamsAdmin() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Team>>({});
  const [newTeam, setNewTeam] = useState<Team | null>(null);

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['admin_montor_teams'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('montor_teams').select('*').order('name');
      if (error) throw error;
      return data as Team[];
    },
  });

  function patch(id: string, p: Partial<Team>) {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] || teams.find(t => t.id === id)!), ...p } }));
  }

  async function save(id: string) {
    const d = drafts[id];
    if (!d) return;
    if (!d.name?.trim()) { toast.error('Namn krävs'); return; }
    const { error } = await (supabase as any).from('montor_teams').update({
      name: d.name, company_name: d.company_name || null, org_nr: d.org_nr || null,
      address: d.address || null, email: d.email || null, invoice_email: d.invoice_email || null,
      bankgiro: d.bankgiro || null, invoice_prefix: d.invoice_prefix || null,
      next_invoice_number: Math.max(1, Number(d.next_invoice_number) || 1),
      is_active: d.is_active,
    }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Sparat');
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
    qc.invalidateQueries({ queryKey: ['admin_montor_teams'] });
    qc.invalidateQueries({ queryKey: ['montor_teams'] });
  }

  async function createNew() {
    if (!newTeam) return;
    if (!newTeam.name?.trim()) { toast.error('Namn krävs'); return; }
    const { error } = await (supabase as any).from('montor_teams').insert({
      name: newTeam.name, company_name: newTeam.company_name || null, org_nr: newTeam.org_nr || null,
      address: newTeam.address || null, email: newTeam.email || null, invoice_email: newTeam.invoice_email || null,
      bankgiro: newTeam.bankgiro || null, invoice_prefix: newTeam.invoice_prefix || null,
      next_invoice_number: Math.max(1, Number(newTeam.next_invoice_number) || 1),
      is_active: newTeam.is_active,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Team tillagt');
    setNewTeam(null);
    qc.invalidateQueries({ queryKey: ['admin_montor_teams'] });
    qc.invalidateQueries({ queryKey: ['montor_teams'] });
  }

  function row(t: Team) {
    const id = t.id!;
    const v = drafts[id] || t;
    const dirty = !!drafts[id];
    return (
      <tr key={id} className="border-t">
        <td className="p-2"><Input className="h-8" value={v.name} onChange={e => patch(id, { name: e.target.value })} /></td>
        <td className="p-2"><Input className="h-8" value={v.company_name || ''} onChange={e => patch(id, { company_name: e.target.value })} /></td>
        <td className="p-2"><Input className="h-8" value={v.org_nr || ''} onChange={e => patch(id, { org_nr: e.target.value })} /></td>
        <td className="p-2"><Input className="h-8" value={v.address || ''} onChange={e => patch(id, { address: e.target.value })} /></td>
        <td className="p-2"><Input className="h-8" value={v.email || ''} onChange={e => patch(id, { email: e.target.value })} /></td>
        <td className="p-2"><Input className="h-8" value={v.invoice_email || ''} onChange={e => patch(id, { invoice_email: e.target.value })} placeholder="(samma)" /></td>
        <td className="p-2"><Input className="h-8" value={v.bankgiro || ''} onChange={e => patch(id, { bankgiro: e.target.value })} /></td>
        <td className="p-2"><Input className="h-8 w-20" value={v.invoice_prefix || ''} onChange={e => patch(id, { invoice_prefix: e.target.value })} /></td>
        <td className="p-2"><Input className="h-8 w-20" type="number" min={1} value={v.next_invoice_number ?? 1} onChange={e => patch(id, { next_invoice_number: Number(e.target.value) || 1 })} /></td>
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
        <h3 className="text-lg font-semibold">Montörsteam</h3>
        <Button size="sm" onClick={() => setNewTeam({ ...EMPTY })} className="gap-1"><Plus className="h-4 w-4" /> Lägg till team</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Namn</th>
              <th className="p-2 text-left">Bolag</th>
              <th className="p-2 text-left">Org.nr</th>
              <th className="p-2 text-left">Adress</th>
              <th className="p-2 text-left">E-post</th>
              <th className="p-2 text-left">Bankgiro</th>
              <th className="p-2 text-left">Prefix</th>
              <th className="p-2 text-center">Aktiv</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Laddar...</td></tr>}
            {!isLoading && teams.map(row)}
            {newTeam && (
              <tr className="border-t bg-amber-50">
                <td className="p-2"><Input className="h-8" placeholder="Namn *" value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} /></td>
                <td className="p-2"><Input className="h-8" value={newTeam.company_name || ''} onChange={e => setNewTeam({ ...newTeam, company_name: e.target.value })} /></td>
                <td className="p-2"><Input className="h-8" value={newTeam.org_nr || ''} onChange={e => setNewTeam({ ...newTeam, org_nr: e.target.value })} /></td>
                <td className="p-2"><Input className="h-8" value={newTeam.address || ''} onChange={e => setNewTeam({ ...newTeam, address: e.target.value })} /></td>
                <td className="p-2"><Input className="h-8" value={newTeam.email || ''} onChange={e => setNewTeam({ ...newTeam, email: e.target.value })} /></td>
                <td className="p-2"><Input className="h-8" value={newTeam.bankgiro || ''} onChange={e => setNewTeam({ ...newTeam, bankgiro: e.target.value })} /></td>
                <td className="p-2"><Input className="h-8 w-20" value={newTeam.invoice_prefix || ''} onChange={e => setNewTeam({ ...newTeam, invoice_prefix: e.target.value })} /></td>
                <td className="p-2 text-center"><Switch checked={newTeam.is_active} onCheckedChange={c => setNewTeam({ ...newTeam, is_active: c })} /></td>
                <td className="p-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setNewTeam(null)}>Avbryt</Button>
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
