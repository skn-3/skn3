import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { buildOrderConfirmationPdfBlob, plannedExecution } from '@/lib/orderConfirmationPdf';
import { orderConfirmationPdfName } from '@/lib/pdfNames';
import { openDocumentInNewTab } from '@/lib/openDocument';

interface Props { offer: any | null; open: boolean; onOpenChange: (v: boolean) => void; currentUser: string; onSent?: () => void }

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = String(r.result || '');
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.slice(idx + 'base64,'.length) : result);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function OrderConfirmationDialog({ offer, open, onOpenChange, currentUser, onSent }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | 'preview' | 'send'>(null);
  if (!offer) return null;

  const accepted = offer.status === 'accepted' && !!offer.accepted_at;
  const hasEmail = !!offer.customer_email;
  const sent = !!offer.confirmation_sent_at;
  const build = () => buildOrderConfirmationPdfBlob(offer, { name: offer.accept_name || offer.customer_name || '', acceptedAt: offer.accepted_at });

  const preview = async () => {
    setBusy('preview');
    try {
      const ok = await openDocumentInNewTab(async () => URL.createObjectURL(await build()));
      if (!ok) toast.error('Kunde inte öppna förhandsgranskningen');
    } finally { setBusy(null); }
  };

  const send = async () => {
    setBusy('send');
    try {
      const pdf_base64 = await blobToBase64(await build());
      const { data, error } = await supabase.functions.invoke('send-order-confirmation', {
        body: { offer_id: offer.id, pdf_base64, file_name: orderConfirmationPdfName(offer, new Date().toISOString()), sent_by: currentUser, origin: window.location.origin },
      });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Orderbekräftelse skickad till ' + ((data as any)?.sent_to || offer.customer_email));
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['case_offers'] });
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte skicka orderbekräftelsen');
    } finally { setBusy(null); }
  };

  const openSent = () => openDocumentInNewTab(async () => {
    const { data, error } = await supabase.storage.from('case-documents')
      .createSignedUrl(offer.confirmation_pdf_path, 600, { download: orderConfirmationPdfName(offer, offer.confirmation_sent_at) });
    if (error) throw error;
    return data?.signedUrl ?? null;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Orderbekräftelse {offer.offer_number}</DialogTitle>
          {hasEmail ? (
            <DialogDescription>Skickas till {offer.customer_email} med orderbekräftelsen och det signerade avtalet som PDF-bilagor.</DialogDescription>
          ) : (
            <DialogDescription className="text-destructive">Kunden saknar e-post – lägg till den på offerten först.</DialogDescription>
          )}
        </DialogHeader>
        {!accepted ? (
          <p className="text-sm text-muted-foreground">Offerten måste vara accepterad först.</p>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              {sent ? (
                <div className="text-green-700 dark:text-green-300">
                  Skickad {new Date(offer.confirmation_sent_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })} av {offer.confirmation_sent_by || '—'} till {offer.confirmation_sent_to || '—'}
                  {offer.confirmation_pdf_path && (
                    <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => void openSent()}>Öppna skickad PDF</Button>
                  )}
                </div>
              ) : (
                <div className="text-muted-foreground">Inte skickad ännu.</div>
              )}
              <p className="text-xs text-muted-foreground">
                Er kontakt i bekräftelsen: Johannes Klum · Planerat utförande: {plannedExecution(offer) ?? 'Bokas tillsammans med dig'} (hämtas ur offerttexten)
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" disabled={!!busy} onClick={() => void preview()}>
                {busy === 'preview' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Förhandsgranska PDF
              </Button>
              <Button disabled={!!busy || !hasEmail} onClick={() => void send()}>
                {busy === 'send' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{sent ? 'Skicka igen' : 'Skicka till kund'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
