import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logActivity } from '@/lib/activityLog';
import { COORDINATOR_EMAIL } from '@/lib/constants';
import { buildMontageReportPdf } from '@/lib/montageReportPdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, Download, Send } from 'lucide-react';
import { toast } from 'sonner';

async function collect(caseId: string) {
  const [lRes, dRes] = await Promise.all([
    (supabase as any).from('litteror').select('*').eq('case_id', caseId).order('sort_order'),
    (supabase as any).from('deviations').select('created_at, description, action_type').eq('case_id', caseId).order('created_at'),
  ]);
  if (lRes.error) throw lRes.error;
  if (dRes.error) throw dRes.error;
  return { litteror: lRes.data ?? [], deviations: dRes.data ?? [] };
}

export function MontageReportButton({ caseData }: { caseData: any }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(COORDINATOR_EMAIL);
  const [note, setNote] = useState('');

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { litteror, deviations } = await collect(caseData.id);
      const doc = buildMontageReportPdf({ caseData, litteror, deviations });
      const pdf_base64 = doc.output('datauristring').split(',')[1];
      const { data, error } = await supabase.functions.invoke('send-montage-report', {
        body: { case_id: caseData.id, to: to.trim(), note: note.trim() || undefined, pdf_base64 },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      logActivity({
        category: 'case',
        action: 'montage_report_sent',
        description: `Skickade montagerapport för ${caseData.address} till ${to.trim()}`,
        case_id: caseData.id,
        metadata: { to: to.trim() },
      });
    },
    onSuccess: () => { toast.success('Montagerapport skickad'); setOpen(false); setNote(''); },
    onError: (e: Error) => toast.error(`Kunde inte skicka: ${e.message}`),
  });

  const download = async () => {
    try {
      const { litteror, deviations } = await collect(caseData.id);
      const doc = buildMontageReportPdf({ caseData, litteror, deviations });
      doc.save(`Montagerapport_${(caseData.address || 'arende').replace(/\s+/g, '_')}.pdf`);
    } catch {
      toast.error('Kunde inte bygga PDF');
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4 mr-1" /> Montagerapport
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skicka montagerapport — {caseData.address}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Rapporten innehåller ärendeinfo, kontrollmätningens slutliga littera med montörens justeringar, samt avvikelser. Inga interna kostnader.
            </p>
            <div className="space-y-2">
              <Label htmlFor="mr-to">Mottagare</Label>
              <Input id="mr-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="namn@mockfjards.se" />
              <p className="text-xs text-muted-foreground">CC går automatiskt till daniel@malke.se och mf@malke.se.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mr-note">Meddelande (valfritt)</Label>
              <Textarea id="mr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Eventuell kommentar i mailet..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={download}>
              <Download className="h-4 w-4 mr-1" /> Ladda ner PDF
            </Button>
            <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || !to.includes('@')}>
              <Send className="h-4 w-4 mr-1" /> {sendMutation.isPending ? 'Skickar...' : 'Skicka'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
