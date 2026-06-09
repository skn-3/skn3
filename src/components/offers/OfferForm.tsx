import { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Save, FileDown, ChevronDown, ChevronRight, AlertTriangle, Send, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DEFAULT_OFFER_TERMS } from '@/lib/offerTerms';
import { calcOfferTotals, fmtKr, type OfferLineItem } from '@/lib/offerCalc';
import { buildOfferPdfBlob } from '@/lib/offerPdf';

type OfferRow = any;

interface OfferFormProps {
  offer: OfferRow | null;
  prefillCaseId?: string | null;
  prefillCustomer?: { name?: string; email?: string; phone?: string; address?: string } | null;
  currentUser: string;
  onSaved: () => void;
  onClose: () => void;
}

function makeId() {
  return 'l_' + Math.random().toString(36).slice(2, 10);
}

function emptyLine(): OfferLineItem {
  return { id: makeId(), description: '', is_labor: false, qty: 1, unit: 'st', unit_price: 0, amount: 0 };
}

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function OfferForm({ offer, prefillCaseId, prefillCustomer, currentUser, onSaved, onClose }: OfferFormProps) {
  const isEdit = !!offer?.id;
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(offer?.public_token || null);
  const [currentStatus, setCurrentStatus] = useState<string>(offer?.status || 'draft');
  const [pdfPath, setPdfPath] = useState<string | null>(offer?.pdf_path || null);
  const publicUrl = publicToken ? `${window.location.origin}/offert/${publicToken}` : null;
  const [termsOpen, setTermsOpen] = useState(false);

  const [customerType, setCustomerType] = useState<'privat' | 'foretag'>(offer?.customer_type || 'privat');
  const [name, setName] = useState(offer?.customer_name || prefillCustomer?.name || '');
  const [email, setEmail] = useState(offer?.customer_email || prefillCustomer?.email || '');
  const [phone, setPhone] = useState(offer?.customer_phone || prefillCustomer?.phone || '');
  const [address, setAddress] = useState(offer?.customer_address || prefillCustomer?.address || '');
  const [pnr, setPnr] = useState(offer?.customer_personnummer || '');
  const [fastighet, setFastighet] = useState(offer?.fastighetsbeteckning || '');
  const [title, setTitle] = useState(offer?.title || '');
  const [description, setDescription] = useState(offer?.description || '');
  const [items, setItems] = useState<OfferLineItem[]>(
    Array.isArray(offer?.line_items) && offer.line_items.length ? offer.line_items : [emptyLine()]
  );
  const [vatMode, setVatMode] = useState<'vanlig' | 'omvand'>(offer?.vat_mode || 'vanlig');
  const [rotEnabled, setRotEnabled] = useState<boolean>(!!offer?.rot_enabled);
  const [rotPercent, setRotPercent] = useState<number>(Number(offer?.rot_percent ?? 30));
  const [validUntil, setValidUntil] = useState<string>(offer?.valid_until || defaultValidUntil());
  const [paymentTerms, setPaymentTerms] = useState<string>(offer?.payment_terms || '10 dagar netto');
  const [terms, setTerms] = useState<string>(offer?.terms_text || DEFAULT_OFFER_TERMS);
  const [internalNotes, setInternalNotes] = useState<string>(offer?.internal_notes || '');

  const caseId = offer?.case_id || prefillCaseId || null;

  // Företag: tvinga av ROT
  useEffect(() => {
    if (customerType === 'foretag' && rotEnabled) setRotEnabled(false);
  }, [customerType, rotEnabled]);

  const totals = useMemo(
    () => calcOfferTotals(items, { vat_mode: vatMode, rot_enabled: rotEnabled, rot_percent: rotPercent }),
    [items, vatMode, rotEnabled, rotPercent]
  );

  const updateItem = (id: string, patch: Partial<OfferLineItem>) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const next = { ...it, ...patch };
      next.amount = Number(next.qty || 0) * Number(next.unit_price || 0);
      return next;
    }));
  };
  const addItem = () => setItems(prev => [...prev, emptyLine()]);
  const removeItem = (id: string) => setItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);

  const buildPayload = () => ({
    case_id: caseId,
    customer_type: customerType,
    customer_name: name || null,
    customer_email: email || null,
    customer_phone: phone || null,
    customer_address: address || null,
    customer_personnummer: customerType === 'privat' ? (pnr || null) : null,
    fastighetsbeteckning: customerType === 'privat' ? (fastighet || null) : null,
    title: title || null,
    description: description || null,
    line_items: items,
    vat_mode: vatMode,
    vat_rate: 25,
    rot_enabled: customerType === 'privat' ? rotEnabled : false,
    rot_percent: rotPercent,
    valid_until: validUntil || null,
    payment_terms: paymentTerms || null,
    terms_text: terms || null,
    internal_notes: internalNotes || null,
    total_ex_vat: totals.total_ex_vat,
    total_vat: totals.total_vat,
    total_incl_vat: totals.total_incl_vat,
    rot_base: totals.rot_base,
    rot_amount: totals.rot_amount,
    total_after_rot: totals.total_after_rot,
    status: offer?.status || 'draft',
  });

  const handleSave = async (closeAfter = false): Promise<string | null> => {
    if (!name.trim()) { toast.error('Ange kundens namn'); return null; }
    setSaving(true);
    try {
      const payload = buildPayload();
      let savedId = offer?.id || null;
      if (isEdit) {
        const { error } = await (supabase as any).from('offers').update(payload).eq('id', offer.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from('offers').insert({ ...payload, created_by: currentUser }).select('id').single();
        if (error) throw error;
        savedId = data?.id || null;
      }
      toast.success(isEdit ? 'Offert uppdaterad' : 'Offert sparad');
      onSaved();
      if (closeAfter) onClose();
      return savedId;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte spara offert');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePdf = async () => {
    setGenerating(true);
    try {
      const id = await handleSave(false);
      if (!id) return;
      // Fetch the saved row to ensure offer_number + created_at är aktuella
      const { data: saved, error: fErr } = await (supabase as any).from('offers').select('*').eq('id', id).single();
      if (fErr) throw fErr;
      const blob = await buildOfferPdfBlob(saved);
      const path = `offers/${id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from('case-documents')
        .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
      if (upErr) throw upErr;
      await (supabase as any).from('offers').update({ pdf_path: path }).eq('id', id);
      setPdfPath(path);
      const { data: signed } = await supabase.storage.from('case-documents').createSignedUrl(path, 3600);
      if (signed?.signedUrl) window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
      onSaved();
      toast.success('PDF genererad');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte generera PDF');
    } finally {
      setGenerating(false);
    }
  };

  const handleSendToCustomer = async () => {
    const id = offer?.id;
    if (!id) { toast.error('Spara offerten först'); return; }
    if (!email) { toast.error('Kunden saknar e-post'); return; }
    if (!pdfPath) { toast.error('Generera PDF först'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-offer', { body: { offer_id: id, origin: window.location.origin } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const tok = (data as any)?.public_token as string | undefined;
      if (tok) setPublicToken(tok);
      if (currentStatus !== 'accepted') setCurrentStatus('sent');
      toast.success(`Offert skickad till ${email}`);
      onSaved();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte skicka offert');
    } finally {
      setSending(false);
    }
  };

  const copyPublicUrl = async () => {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); toast.success('Länk kopierad'); }
    catch { toast.error('Kunde inte kopiera'); }
  };

  const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Utkast', cls: 'bg-muted text-muted-foreground' },
    sent: { label: 'Skickad', cls: 'bg-blue-100 text-blue-800' },
    accepted: { label: 'Accepterad', cls: 'bg-green-100 text-green-800' },
    declined: { label: 'Avböjd', cls: 'bg-red-100 text-red-800' },
  };
  const statusMeta = STATUS_BADGE[currentStatus] || STATUS_BADGE.draft;

  const canSend = isEdit && !!email && !!pdfPath;

  const isPrivat = customerType === 'privat';

  return (
    <div className="space-y-5">
      {/* Status + public link */}
      {isEdit && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Status:</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusMeta.cls}`}>{statusMeta.label}</span>
            {publicUrl && (
              <div className="flex-1 min-w-[200px] flex items-center gap-2 ml-2">
                <Input readOnly value={publicUrl} className="text-xs h-8" />
                <Button type="button" variant="outline" size="sm" onClick={copyPublicUrl} className="gap-1">
                  <Copy className="h-3 w-3" /> Kopiera
                </Button>
              </div>
            )}
          </div>
          {currentStatus === 'accepted' && (offer?.accept_name || offer?.accepted_at) && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              <span>
                Accepterad av <strong>{offer?.accept_name || '—'}</strong>
                {offer?.accepted_at ? ` • ${new Date(offer.accepted_at).toLocaleString('sv-SE')}` : ''}
              </span>
              {offer?.signed_pdf_path && (
                <button
                  type="button"
                  className="underline hover:text-green-900"
                  onClick={async () => {
                    const { data, error } = await supabase.storage.from('case-documents').createSignedUrl(offer.signed_pdf_path, 3600);
                    if (error || !data?.signedUrl) { toast.error('Kunde inte öppna signerad PDF'); return; }
                    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Öppna signerad PDF
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {/* Kundtyp */}
      <section className="space-y-2">

        <Label>Kundtyp</Label>
        <RadioGroup
          value={customerType}
          onValueChange={(v) => setCustomerType(v as any)}
          className="flex gap-4"
        >
          <label className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem value="privat" id="ct-privat" />
            <span>Privatperson</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem value="foretag" id="ct-foretag" />
            <span>Företag / BRF</span>
          </label>
        </RadioGroup>
      </section>

      {/* Kunduppgifter */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Namn *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <Label>E-post</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>Telefon</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div>
          <Label>Adress</Label>
          <Input value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        {isPrivat && (
          <>
            <div>
              <Label>Personnummer</Label>
              <Input value={pnr} onChange={e => setPnr(e.target.value)} placeholder="ÅÅÅÅMMDD-XXXX" />
            </div>
            <div>
              <Label>Fastighetsbeteckning</Label>
              <Input value={fastighet} onChange={e => setFastighet(e.target.value)} />
            </div>
          </>
        )}
      </section>

      {/* Titel + beskrivning */}
      <section className="space-y-3">
        <div>
          <Label>Titel</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="t.ex. Takbyte enplansvilla" />
        </div>
        <div>
          <Label>Beskrivning</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
        </div>
      </section>

      {/* Rader */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Rader</Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
            <Plus className="h-3 w-3" /> Lägg till rad
          </Button>
        </div>
        <div className="rounded-md border divide-y">
          {items.map((it, idx) => (
            <div key={it.id} className="p-3 grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-5">
                <Label className="text-xs">Benämning</Label>
                <Input value={it.description} onChange={e => updateItem(it.id, { description: e.target.value })} />
              </div>
              <div className="col-span-4 md:col-span-1">
                <Label className="text-xs">Antal</Label>
                <Input type="number" step="any" value={it.qty} onChange={e => updateItem(it.id, { qty: Number(e.target.value) })} />
              </div>
              <div className="col-span-4 md:col-span-1">
                <Label className="text-xs">Enhet</Label>
                <Input value={it.unit} onChange={e => updateItem(it.id, { unit: e.target.value })} />
              </div>
              <div className="col-span-4 md:col-span-2">
                <Label className="text-xs">À-pris</Label>
                <Input type="number" step="any" value={it.unit_price} onChange={e => updateItem(it.id, { unit_price: Number(e.target.value) })} />
              </div>
              <div className="col-span-8 md:col-span-2 text-right">
                <div className="text-xs text-muted-foreground">Summa</div>
                <div className="font-medium tabular-nums">{fmtKr(it.amount)}</div>
              </div>
              <div className="col-span-4 md:col-span-1 flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(it.id)} title="Ta bort rad" disabled={items.length <= 1}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="col-span-12 md:col-span-12 -mt-1">
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox checked={it.is_labor} onCheckedChange={v => updateItem(it.id, { is_labor: !!v })} />
                  Arbetskostnad (ingår i ROT-underlag)
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Moms + ROT */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Momsläge</Label>
          <RadioGroup value={vatMode} onValueChange={(v) => setVatMode(v as any)} className="flex flex-col gap-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <RadioGroupItem value="vanlig" id="vm-v" /> Vanlig moms (25%)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <RadioGroupItem value="omvand" id="vm-o" /> Omvänd byggmoms
            </label>
          </RadioGroup>
          {vatMode === 'omvand' && (
            <p className="text-xs text-muted-foreground">Omvänd betalningsskyldighet för moms tillämpas.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>ROT-avdrag</Label>
          {isPrivat ? (
            <>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={rotEnabled} onCheckedChange={v => setRotEnabled(!!v)} disabled={vatMode === 'omvand'} />
                Tillämpa ROT-avdrag på arbetskostnad
              </label>
              {rotEnabled && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Procent</Label>
                  <Input type="number" className="w-24" value={rotPercent} onChange={e => setRotPercent(Number(e.target.value))} />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">ROT gäller endast privatpersoner.</p>
          )}
        </div>
      </section>

      {/* Giltighet / betalning */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Giltig t.o.m.</Label>
          <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
        </div>
        <div>
          <Label>Betalningsvillkor</Label>
          <Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
        </div>
      </section>

      {/* Allmänna villkor (hopfällbar) */}
      <section>
        <Collapsible open={termsOpen} onOpenChange={setTermsOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-2 text-sm font-medium hover:text-primary">
              {termsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Allmänna villkor (redigerbara, visas på sida 2 i PDF)
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Textarea value={terms} onChange={e => setTerms(e.target.value)} rows={10} className="font-mono text-xs" />
          </CollapsibleContent>
        </Collapsible>
      </section>

      {/* Interna noteringar */}
      <section>
        <Label>Interna noteringar (visas EJ i PDF)</Label>
        <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2} />
      </section>

      {/* Summering */}
      <section className="rounded-md border bg-muted/30 p-4 space-y-1 text-sm">
        <div className="flex justify-between"><span>Summa ex moms</span><span className="tabular-nums">{fmtKr(totals.total_ex_vat)}</span></div>
        {vatMode === 'omvand' ? (
          <div className="flex justify-between text-muted-foreground"><span>Moms</span><span>Omvänd betalningsskyldighet</span></div>
        ) : (
          <div className="flex justify-between"><span>Moms 25%</span><span className="tabular-nums">{fmtKr(totals.total_vat)}</span></div>
        )}
        <div className="flex justify-between font-medium"><span>Summa inkl moms</span><span className="tabular-nums">{fmtKr(totals.total_incl_vat)}</span></div>
        {rotEnabled && vatMode === 'vanlig' && (
          <>
            <div className="flex justify-between text-muted-foreground pt-1 border-t mt-1"><span>Rotberättigad arbetskostnad</span><span className="tabular-nums">{fmtKr(totals.rot_base)}</span></div>
            <div className="flex justify-between text-primary"><span>Preliminärt ROT-avdrag ({rotPercent}%)</span><span className="tabular-nums">−{fmtKr(totals.rot_amount)}</span></div>
            <div className="flex justify-between font-semibold text-primary text-base pt-1"><span>Att betala efter ROT</span><span className="tabular-nums">{fmtKr(totals.total_after_rot)}</span></div>
            {totals.rot_amount > 50000 && (
              <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2 text-xs">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>ROT-avdraget överstiger 50 000 kr/person/år – kontrollera att kunden har avdragsutrymme.</span>
              </div>
            )}
          </>
        )}
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 justify-end pt-2 border-t sticky bottom-0 bg-background pb-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving || generating || sending}>Avbryt</Button>
        <Button type="button" variant="outline" onClick={() => handleSave(false)} disabled={saving || generating || sending} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? 'Sparar…' : 'Spara'}
        </Button>
        <Button type="button" variant="outline" onClick={handleGeneratePdf} disabled={saving || generating || sending} className="gap-2">
          <FileDown className="h-4 w-4" /> {generating ? 'Genererar…' : 'Generera & ladda ner PDF'}
        </Button>
        <Button
          type="button"
          onClick={handleSendToCustomer}
          disabled={saving || generating || sending || !canSend}
          className="gap-2"
          title={!isEdit ? 'Spara offerten först' : !email ? 'Kunden saknar e-post' : !pdfPath ? 'Generera PDF först' : 'Skicka till kund'}
        >
          <Send className="h-4 w-4" /> {sending ? 'Skickar…' : 'Skicka till kund'}
        </Button>
      </div>

    </div>
  );
}
