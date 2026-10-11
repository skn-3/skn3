import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CaseCombobox } from '@/components/shared/CaseCombobox';
import { fetchAllCases } from '@/lib/supabaseClient';
import { DEVIATION_RESPONSIBLE } from '@/lib/constants';
import {
  BALLS, PRIORITIES, TICKET_CATEGORIES, TICKET_QUERY_KEYS, createTicket, ticketNo, type Ball, type Priority, type Ticket,
} from '@/lib/tickets';
import { useStaff } from './ticketDialogs';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; currentUser: string; onCreated: (t: Ticket) => void }

const NONE = '__none__';

export function NewTicketDialog({ open, onOpenChange, currentUser, onCreated }: Props) {
  const qc = useQueryClient();
  const staff = useStaff(currentUser);
  const { data: cases = [] } = useQuery({ queryKey: ['cases_all_for_tickets'], queryFn: fetchAllCases, enabled: open });
  const [caseId, setCaseId] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('kundtjanst');
  const [description, setDescription] = useState('');
  const [responsible, setResponsible] = useState(NONE);
  const [priority, setPriority] = useState<Priority>('medium');
  const [ball, setBall] = useState<Ball>('oss');
  const [owner, setOwner] = useState(currentUser);
  const [nextStep, setNextStep] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCaseId(''); setTitle(''); setType('kundtjanst'); setDescription(''); setResponsible(NONE);
    setPriority('medium'); setBall('oss'); setOwner(currentUser); setNextStep(''); setDue('');
  }, [open, currentUser]);

  const save = async () => {
    if (!caseId) return toast.error('Välj ärende');
    if (!title.trim()) return toast.error('Skriv en titel');
    setBusy(true);
    try {
      const t = await createTicket({
        case_id: caseId, title, type, description: description.trim() || title.trim(),
        responsible: responsible === NONE ? null : responsible, priority, ball,
        owner: owner === NONE ? null : owner, next_step: nextStep.trim() || null, next_step_due: nextStep.trim() && due ? due : null,
        created_by: currentUser,
      });
      TICKET_QUERY_KEYS(t.id, t.case_id).forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success(`Ärende ${ticketNo(t)} skapat`);
      onOpenChange(false);
      onCreated(t);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte skapa ärendet');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nytt ärende</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">Ärende (adress) *</Label>
            <CaseCombobox cases={cases as any} value={caseId} onChange={setCaseId} placeholder="Sök adress eller kund…" />
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Titel *</Label>
            <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Kort beskrivning" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Kategori</Label>
              <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TICKET_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Ansvar</Label>
              <Select value={responsible} onValueChange={setResponsible}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>Ej angivet</SelectItem>{DEVIATION_RESPONSIBLE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Beskrivning</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Prioritet</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Bollen ligger hos</Label>
              <Select value={ball} onValueChange={(v) => setBall(v as Ball)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BALLS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Ägare</Label>
              <Select value={owner} onValueChange={setOwner}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>Ingen</SelectItem>{staff.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px] gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Nästa steg</Label>
              <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Valfritt" />
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Förfaller</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={save} disabled={busy}>Skapa ärende</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
