import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCase, createCaseEvent, updateVisit, type VisitRow } from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { sendKlimatEvent } from '@/lib/klimat';
import { detectGotland } from '@/lib/constants';
import { GotlandBadge } from '@/components/shared/GotlandBadge';
import {
  buildSignedCaseRecord,
  emptySignedCaseFields,
  isEmailInvalid,
  signedCaseFieldsValid,
  type SignedCaseFieldValues,
} from '@/lib/signedCase';
import { SignedCaseFields } from '@/components/seller/SignedCaseFields';
import { logActivity } from '@/lib/activityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatAmount } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { useDuplicateCaseGuard } from '@/components/shared/DuplicateCaseGuard';

function formFromVisit(visit: VisitRow | null) {
  return {
    customer_name: visit?.customer_name || '',
    customer_email: '',
    address: visit?.address || '',
    ...emptySignedCaseFields(),
    order_value: visit?.order_value ? String(visit.order_value) : '',
  };
}

interface SignedCaseDialogProps {
  visit: VisitRow | null;
  sellerName: string;
  onClose: () => void;
}

/**
 * "Signerat avtal" från uppföljningslistan. Samma fält och ärendepost som Signerat i VisitForm
 * (SignedCaseFields + buildSignedCaseRecord). Kunden fick sin QR-kod redan vid besöket, så ingen
 * ny QR visas här; finns den kvar att hämta syns den i ärendets klimatruta.
 */
export function SignedCaseDialog({ visit, sellerName, onClose }: SignedCaseDialogProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [form, setForm] = useState(() => formFromVisit(visit));
  const [offerNumberTouched, setOfferNumberTouched] = useState(false);
  // Dialogen är monterad även när den är stängd: fyll i på nytt från varje besök som öppnas.
  useEffect(() => {
    setForm(formFromVisit(visit));
    setOfferNumberTouched(false);
  }, [visit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const isGotland = detectGotland(form.city, form.address);
  const emailInvalid = isEmailInvalid(form.customer_email);
  const canSubmit =
    !!form.customer_name.trim() && !!form.address.trim() && !emailInvalid && signedCaseFieldsValid(form);
  const ovNum = form.order_value === '' ? 0 : Number(form.order_value);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dupGuard = useDuplicateCaseGuard({ onOpenCase: onClose });
  const handleSubmit = () => {
    // Varna innan sparandet om gata + husnummer redan finns på ett ärende.
    void dupGuard.guard(form.address, () => {
      if (ovNum > 500_000) {
        setConfirmOpen(true);
        return;
      }
      mutation.mutate();
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!visit) throw new Error('Inget besök valt');
      const newCase = await createCase(buildSignedCaseRecord(form, sellerName) as any);

      await updateVisit(visit.id, { result: 'signerat', case_id: newCase.id } as any);

      if (form.future_job && form.future_job_description.trim() && form.future_job_date) {
        const { error: fjErr } = await supabase.from('future_jobs').insert({
          case_id: newCase.id,
          customer_name: form.customer_name,
          address: form.address || null,
          phone: null,
          seller: sellerName,
          description: form.future_job_description.trim(),
          contact_date: form.future_job_date,
          created_by: sellerName,
        });
        if (fjErr) console.error('future_jobs insert failed:', fjErr);
      }

      await createCaseEvent({
        case_id: newCase.id,
        event_type: 'status_change',
        description: 'Ärende skapat från uppföljning',
        created_by: sellerName,
      });
      // Montörmailet skickas när montage-montör tilldelas i "Komplettera ärendet" (efter KM).

      // Anonym trädhändelse (signering) — ingen kunddata skickas. Servern räknar in besöksträdet.
      const klimat = await sendKlimatEvent({
        eventType: 'signing',
        caseId: newCase.id,
        visitId: visit.id,
        treeCount: Math.max(1, Math.floor(Number(form.units) || 1)),
        seller: sellerName,
        eventRef: `signing-${newCase.id}`,
      });

      return { newCase, klimat };
    },
    onSuccess: ({ newCase, klimat }) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['climate_events'] });
      logActivity({
        action: 'followup_signed_case_created',
        category: 'case',
        description: `Signerat avtal från uppföljning + ärende skapat — ${form.address}`,
        case_id: newCase.id,
        metadata: { visit_id: visit?.id },
      });
      const trees = klimat?.total_trees;
      toast.success(trees ? `Ärende skapat – ${trees} träd registrerade på kunden` : 'Ärende skapat');
      onClose();
    },
    onError: (err: Error) => {
      toast.error('Kunde inte skapa ärende: ' + err.message);
    },
  });

  return (
    <Sheet open={!!visit} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'h-[90vh] overflow-y-auto' : 'w-full sm:max-w-xl overflow-y-auto'}
      >
        <SheetHeader>
          <SheetTitle>Skapa ärende från signerat avtal</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="signed-dialog-name">Kundnamn *</Label>
              <Input id="signed-dialog-name" value={form.customer_name} onChange={(e) => update('customer_name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signed-dialog-address">Adress *</Label>
              <Input
                id="signed-dialog-address"
                value={form.address}
                onChange={(e) => {
                  const newAddr = e.target.value;
                  setForm((f) => {
                    let nextCity = f.city;
                    if (!nextCity.trim()) {
                      const idx = newAddr.lastIndexOf(',');
                      if (idx !== -1) nextCity = newAddr.substring(idx + 1).trim();
                    }
                    return { ...f, address: newAddr, city: nextCity };
                  });
                }}
              />
              {isGotland && <div className="mt-2"><GotlandBadge /></div>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signed-dialog-email">E-post</Label>
              <Input
                id="signed-dialog-email"
                type="email"
                value={form.customer_email}
                onChange={(e) => update('customer_email', e.target.value)}
                aria-invalid={emailInvalid}
              />
              {emailInvalid && <p className="text-xs text-destructive">Ange en giltig e-postadress.</p>}
            </div>
          </div>

          <SignedCaseFields
            values={form}
            onChange={(key: keyof SignedCaseFieldValues, value) => update(key, value)}
            offerNumberTouched={offerNumberTouched}
            onOfferNumberTouched={() => setOfferNumberTouched(true)}
          />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Avbryt</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || mutation.isPending || dupGuard.checking}>
              {mutation.isPending ? 'Sparar...' : 'Skapa ärende'}
            </Button>
          </div>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bekräfta ordervärde</AlertDialogTitle>
              <AlertDialogDescription>
                Du har angett {formatAmount(ovNum)} — stämmer det? Detta är ovanligt högt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt, rätta värdet</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setConfirmOpen(false); mutation.mutate(); }}>
                Ja, värdet stämmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
      {dupGuard.dialog}
    </Sheet>
  );
}
