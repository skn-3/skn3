import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCase, createCaseEvent, sendNotificationEmail, updateVisit, type VisitRow } from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { MONTORS, EMAIL_MAP, HOUR_RATE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatAmount } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

interface SignedCaseDialogProps {
  visit: VisitRow | null;
  sellerName: string;
  onClose: () => void;
}

export function SignedCaseDialog({ visit, sellerName, onClose }: SignedCaseDialogProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [form, setForm] = useState({
    customer_name: visit?.customer_name || '',
    customer_phone: '',
    customer_email: '',
    address: visit?.address || '',
    city: '',
    offer_number: '',
    order_value: visit?.order_value ? String(visit.order_value) : '',
    tb_percent: '',
    extra_hours_sold: '0',
    team: '',
    km_team: '',
    google_drive_link: '',
    notes: '',
    units: '',
    media_consent: false,
    carry_help_needed: false,
    scheduled_delivery: false,
  });

  const update = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value } as any));

  const tbNum = form.tb_percent === '' ? null : Number(form.tb_percent);
  const tbInvalid = tbNum != null && (isNaN(tbNum) || tbNum < 0 || tbNum > 100);
  const ovNum = form.order_value === '' ? 0 : Number(form.order_value);
  const unitsNum = form.units === '' ? NaN : Number(form.units);
  const unitsValid = Number.isFinite(unitsNum) && unitsNum >= 1 && Number.isInteger(unitsNum);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSubmit = () => {
    if (ovNum > 500_000) {
      setConfirmOpen(true);
      return;
    }
    mutation.mutate();
  };


  const mutation = useMutation({
    mutationFn: async () => {
      if (!visit) throw new Error('Inget besök valt');
      const newCase = await createCase({
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email || null,
        address: form.address,
        city: form.city,
        offer_number: form.offer_number || null,
        order_value: form.order_value ? Number(form.order_value) : null,
        tb_percent: form.tb_percent ? Number(form.tb_percent) : null,
        extra_hours_sold: Number(form.extra_hours_sold) || 0,
        units: Math.max(1, Math.floor(Number(form.units))),
        team: form.team || null,
        km_team: form.km_team || null,
        google_drive_link: form.google_drive_link || null,
        notes: form.notes || null,
        seller: sellerName,
        status: 'vantar_km',
        media_consent: form.media_consent,
        carry_help_needed: form.carry_help_needed,
        scheduled_delivery: form.scheduled_delivery,
      } as any);

      await updateVisit(visit.id, { result: 'signerat', case_id: newCase.id } as any);

      await createCaseEvent({
        case_id: newCase.id,
        event_type: 'status_change',
        description: 'Ärende skapat från uppföljning',
        created_by: sellerName,
      });

      if (form.team && EMAIL_MAP[form.team]) {
        try {
          await sendNotificationEmail({
            to: EMAIL_MAP[form.team],
            subject: `NYTT ÄRENDE — ${form.address}`,
            body: `
              <h2>Nytt ärende tilldelat</h2>
              <table style="border-collapse:collapse;width:100%">
                <tr><td style="padding:4px 8px;font-weight:bold">Adress:</td><td style="padding:4px 8px">${form.address}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Kund:</td><td style="padding:4px 8px">${form.customer_name}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Telefon:</td><td style="padding:4px 8px">${form.customer_phone}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Säljare:</td><td style="padding:4px 8px">${sellerName}</td></tr>
                ${form.notes ? `<tr><td style="padding:4px 8px;font-weight:bold">Anteckning:</td><td style="padding:4px 8px">${form.notes}</td></tr>` : ''}
              </table>
              <p style="margin-top:16px"><strong>Vänligen boka kontrollmätning.</strong></p>
            `,
          });
          await createCaseEvent({
            case_id: newCase.id,
            event_type: 'notification',
            description: `Mail skickat till ${EMAIL_MAP[form.team]} (nytt ärende)`,
            created_by: sellerName,
          });
        } catch (emailErr) {
          console.error('Email notification failed:', emailErr);
          toast.warning('Ärendet skapades men mailet kunde inte skickas');
        }
      }

      // Fire-and-forget klimatkompensering
      try {
        supabase.functions.invoke('klimatkompensera', { body: { case_id: newCase.id } })
          .catch((e) => console.warn('[klimatkompensera] auto-invoke failed', e));
      } catch (e) {
        console.warn('[klimatkompensera] auto-invoke threw', e);
      }

      return newCase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      toast.success('Ärende skapat!');
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kundnamn *</Label>
            <Input value={form.customer_name} onChange={(e) => update('customer_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon *</Label>
            <Input value={form.customer_phone} onChange={(e) => update('customer_phone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>E-post</Label>
            <Input value={form.customer_email} onChange={(e) => update('customer_email', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Adress *</Label>
            <Input
              value={form.address}
              onChange={(e) => {
                const newAddr = e.target.value;
                setForm((f) => {
                  let nextCity = f.city;
                  if (!nextCity.trim()) {
                    const idx = newAddr.lastIndexOf(',');
                    if (idx !== -1) nextCity = newAddr.substring(idx + 1).trim();
                  }
                  return { ...f, address: newAddr, city: nextCity } as any;
                });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ort *</Label>
            <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Offertnummer</Label>
            <Input value={form.offer_number} onChange={(e) => update('offer_number', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ordervärde (kr) <span className="text-muted-foreground text-xs ml-1">ex moms</span></Label>
            <Input type="number" value={form.order_value} onChange={(e) => update('order_value', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>TB (%)</Label>
            <Input type="number" min={0} max={100} value={form.tb_percent} onChange={(e) => update('tb_percent', e.target.value)} />
            {tbInvalid && (
              <p className="text-xs text-destructive">TB% måste vara mellan 0 och 100. Skrev du 160 istället för 16?</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Extra timmar sålda (á {HOUR_RATE} kr/st)</Label>
            <Input type="number" value={form.extra_hours_sold} onChange={(e) => update('extra_hours_sold', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>KM-montör (valfritt)</Label>
            <Select value={form.km_team || '__none__'} onValueChange={(v) => update('km_team', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Ingen vald" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Ingen vald —</SelectItem>
                {MONTORS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Montage-montör (valfritt)</Label>
            <Select value={form.team || '__none__'} onValueChange={(v) => update('team', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Ingen vald" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Ingen vald —</SelectItem>
                {MONTORS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Google Drive-länk</Label>
            <Input value={form.google_drive_link} onChange={(e) => update('google_drive_link', e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Anteckning</Label>
          <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} />
        </div>

        <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground">Att tänka på vid montage</h3>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.media_consent} onCheckedChange={(c) => update('media_consent', c === true)} />
            Foto/film överenskommet med kund
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.carry_help_needed} onCheckedChange={(c) => update('carry_help_needed', c === true)} />
            Behövs bärhjälp?
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-2">
              <Checkbox checked={form.scheduled_delivery} onCheckedChange={(c) => update('scheduled_delivery', c === true)} />
              Tidsstyrd leverans (tidslossning)
            </span>
            {form.scheduled_delivery && (
              <span className="text-xs text-muted-foreground pl-6">Tiden anges senare, veckan innan leverans</span>
            )}
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Avbryt</Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.customer_name || !form.customer_phone || !form.address || !form.city || tbInvalid || mutation.isPending}
          >
            {mutation.isPending ? 'Sparar...' : 'Skapa ärende'}
          </Button>
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
    </Sheet>
  );
}
