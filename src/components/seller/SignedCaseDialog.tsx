import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCase, createCaseEvent, sendNotificationEmail, updateVisit, type VisitRow } from '@/lib/supabaseClient';
import { MONTORS, EMAIL_MAP, HOUR_RATE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
    google_drive_link: '',
    notes: '',
    media_consent: false,
    carry_help_needed: false,
  });

  const update = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value } as any));

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
        team: form.team || null,
        google_drive_link: form.google_drive_link || null,
        notes: form.notes || null,
        seller: sellerName,
        status: 'vantar_km',
        media_consent: form.media_consent,
        carry_help_needed: form.carry_help_needed,
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
            <Input type="number" value={form.tb_percent} onChange={(e) => update('tb_percent', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Extra timmar sålda (á {HOUR_RATE} kr/st)</Label>
            <Input type="number" value={form.extra_hours_sold} onChange={(e) => update('extra_hours_sold', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Montör</Label>
            <Select value={form.team} onValueChange={(v) => update('team', v)}>
              <SelectTrigger><SelectValue placeholder="Välj montör..." /></SelectTrigger>
              <SelectContent>
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
            Kan vi filma/fota hos kund?
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.carry_help_needed} onCheckedChange={(c) => update('carry_help_needed', c === true)} />
            Behövs bärhjälp?
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Avbryt</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.customer_name || !form.customer_phone || !form.address || !form.city || mutation.isPending}
          >
            {mutation.isPending ? 'Sparar...' : 'Skapa ärende'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
