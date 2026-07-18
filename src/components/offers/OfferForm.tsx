import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Plus, Save, FileDown, ChevronDown, ChevronRight, AlertTriangle, Send, Copy, Upload, Loader2, Briefcase } from 'lucide-react';
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
import { buildOfferPdfBlob, offerFileName } from '@/lib/offerPdf';
import { createUppdragFromOffer, findUppdragForOffer } from '@/lib/uppdrag';

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
  const [currentId, setCurrentId] = useState<string | null>(offer?.id ?? null);
  const isEdit = !!currentId;
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
  const [handpenningPercent, setHandpenningPercent] = useState<number>(Number(offer?.handpenning_percent ?? 25));
  const [terms, setTerms] = useState<string>(offer?.terms_text || DEFAULT_OFFER_TERMS);
  const [internalNotes, setInternalNotes] = useState<string>(offer?.internal_notes || '');

  // ── UE-import state ──
  type UeSummaryRow = { id: string; label: string; amount: number; is_labor: boolean };
  type UeDetailRow = { address: string | null; category: string | null; description: string | null; amount: number | null };
  const [ueOpen, setUeOpen] = useState<boolean>(false);
  const [ueLoading, setUeLoading] = useState(false);
  const [ueError, setUeError] = useState<string | null>(null);
  const [ueSupplier, setUeSupplier] = useState<string | null>(offer?.ue_supplier || null);
  const [ueOfferNumber, setUeOfferNumber] = useState<string | null>(null);
  const [ueTotalExcl, setUeTotalExcl] = useState<number | null>(offer?.ue_total_excl != null ? Number(offer.ue_total_excl) : null);
  const [ueDocPath, setUeDocPath] = useState<string | null>(offer?.ue_document_path || null);
  const [markupPercent, setMarkupPercent] = useState<number>(Number(offer?.markup_percent ?? 20));
  const [ueSummary, setUeSummary] = useState<UeSummaryRow[]>([]);
  const [ueDetails, setUeDetails] = useState<UeDetailRow[]>([]);
  const [ueDetailsOpen, setUeDetailsOpen] = useState(false);
  const [ueSourceLoaded, setUeSourceLoaded] = useState<boolean>(offer?.source === 'ue_offer');
  const [ueDragActive, setUeDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uppdragInfo, setUppdragInfo] = useState<{ id: string; uppdrag_number: string | null } | null>(null);
  const [creatingUppdrag, setCreatingUppdrag] = useState(false);

  useEffect(() => {
    if (!currentId || currentStatus !== 'accepted') { setUppdragInfo(null); return; }
    let cancelled = false;
    findUppdragForOffer(currentId).then(r => { if (!cancelled) setUppdragInfo(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentId, currentStatus]);

  const handleCreateUppdrag = async () => {
    if (!currentId) return;
    setCreatingUppdrag(true);
    try {
      const { data: fresh, error } = await (supabase as any).from('offers').select('*').eq('id', currentId).single();
      if (error) throw error;
      const res = await createUppdragFromOffer(fresh, currentUser);
      setUppdragInfo(res);
      toast.success(`Uppdrag ${res.uppdrag_number || ''} skapat`);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte skapa uppdrag');
    } finally {
      setCreatingUppdrag(false);
    }
  };


  const caseId = offer?.case_id || prefillCaseId || null;

  // Företag: tvinga av ROT
  useEffect(() => {
    if (customerType === 'foretag' && rotEnabled) setRotEnabled(false);
  }, [customerType, rotEnabled]);

  const totals = useMemo(
    () => calcOfferTotals(items, { vat_mode: vatMode, rot_enabled: rotEnabled, rot_percent: rotPercent, handpenning_percent: handpenningPercent }),
    [items, vatMode, rotEnabled, rotPercent, handpenningPercent]
  );

  const updateItem = (id: string, patch: Partial<OfferLineItem>) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const next = { ...it, ...patch };
      if (!('amount' in patch)) {
        next.amount = Number(next.qty || 0) * Number(next.unit_price || 0);
      }
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
    handpenning_percent: handpenningPercent,
    terms_text: terms || null,
    internal_notes: internalNotes || null,
    total_ex_vat: totals.total_ex_vat,
    total_vat: totals.total_vat,
    total_incl_vat: totals.total_incl_vat,
    rot_base: totals.rot_base,
    rot_amount: totals.rot_amount,
    total_after_rot: totals.total_after_rot,
    status: offer?.status || 'draft',
    source: ueSourceLoaded ? 'ue_offer' : (offer?.source || 'manual'),
    ue_supplier: ueSupplier,
    ue_document_path: ueDocPath,
    ue_total_excl: ueTotalExcl,
    markup_percent: ueSourceLoaded ? markupPercent : (offer?.markup_percent ?? null),
  });


  const handleSave = async (closeAfter = false): Promise<string | null> => {
    if (!name.trim()) { toast.error('Ange kundens namn'); return null; }
    setSaving(true);
    try {
      const payload = buildPayload();
      let savedId = currentId;
      if (isEdit) {
        const { error } = await (supabase as any).from('offers').update(payload).eq('id', currentId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from('offers').insert({ ...payload, created_by: currentUser }).select('id').single();
        if (error) throw error;
        savedId = data?.id || null;
        if (savedId) setCurrentId(savedId);
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
    if (!email) { toast.error('Kunden saknar e-post'); return; }
    if (!pdfPath) { toast.error('Generera PDF först'); return; }
    // Spara alltid innan utskick — send-offer läser kunduppgifterna från databasen, inte från formuläret.
    const id = await handleSave(false);
    if (!id) return;
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

  // ── UE-import handlers ──
  const ueCustomerPrice = (amount: number) => Math.round(Number(amount || 0) * (1 + Number(markupPercent || 0) / 100));
  const ueSumExcl = ueSummary.reduce((s, r) => s + Number(r.amount || 0), 0);
  const ueSumCustomer = ueSummary.reduce((s, r) => s + ueCustomerPrice(Number(r.amount || 0)), 0);

  const handleUeUpload = async (file: File) => {
    setUeError(null);
    setUeLoading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `offers/ue/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('case-documents')
        .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' });
      if (upErr) throw upErr;
      setUeDocPath(path);

      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const file_base64 = dataUrl.split('base64,')[1] || '';

      const { data, error } = await supabase.functions.invoke('extract-ue-offer', {
        body: { file_base64, mime_type: file.type || 'application/pdf', file_name: file.name },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const d = data as any;
      setUeSupplier(d.supplier_name || null);
      setUeOfferNumber(d.offer_number || null);
      setUeTotalExcl(d.total_excl_vat != null ? Number(d.total_excl_vat) : null);
      const sum: UeSummaryRow[] = Array.isArray(d.summary) && d.summary.length
        ? d.summary.map((s: any) => ({ id: makeId(), label: String(s.label || ''), amount: Number(s.amount || 0), is_labor: !!s.is_labor }))
        : [{ id: makeId(), label: 'Entreprenad enligt offert', amount: Number(d.total_excl_vat || 0), is_labor: false }];
      setUeSummary(sum);
      setUeDetails(Array.isArray(d.line_items) ? d.line_items.map((li: any) => ({
        address: li.address ?? null, category: li.category ?? null, description: li.description ?? null, amount: li.amount != null ? Number(li.amount) : null,
      })) : []);
      toast.success('UE-offert inläst');
    } catch (e: any) {
      console.error(e);
      setUeError(e?.message || 'Kunde inte läsa offerten');
      toast.error(e?.message || 'Kunde inte läsa offerten');
    } finally {
      setUeLoading(false);
    }
  };

  const applyUeToOffer = () => {
    if (!ueSummary.length) return;
    const newItems: OfferLineItem[] = ueSummary.map(r => {
      const price = ueCustomerPrice(Number(r.amount || 0));
      return { id: makeId(), description: r.label, is_labor: !!r.is_labor, qty: 1, unit: 'st', unit_price: price, amount: price };
    });
    setItems(newItems);
    setUeSourceLoaded(true);
    setUeOpen(false);
    toast.success('Raderna lades in i offerten');
  };

  const updateUeRow = (id: string, patch: Partial<UeSummaryRow>) => {
    setUeSummary(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };
  const addUeRow = () => setUeSummary(prev => [...prev, { id: makeId(), label: '', amount: 0, is_labor: false }]);
  const removeUeRow = (id: string) => setUeSummary(prev => prev.filter(r => r.id !== id));


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
          {offer && (offer.sent_at || offer.accepted_at || (offer as any).declined_at) && (
            <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1">
              <div className="font-semibold text-sm mb-1">Historik</div>
              <div className="text-muted-foreground">Skapad: {new Date((offer as any).created_at).toLocaleString('sv-SE')}</div>
              {offer.sent_at && <div className="text-muted-foreground">Skickad till kund: {new Date(offer.sent_at).toLocaleString('sv-SE')}</div>}
              {offer.accepted_at && (
                <div className="text-green-700">
                  Accepterad: {new Date(offer.accepted_at).toLocaleString('sv-SE')} av {offer.accept_name || '—'}
                  {(offer as any).accept_ip ? ` · IP ${(offer as any).accept_ip}` : ''}
                  {(offer as any).accept_user_agent ? ` · ${String((offer as any).accept_user_agent).slice(0, 60)}...` : ''}
                </div>
              )}
              {(offer as any).declined_at && (
                <div className="text-red-700">
                  Avböjd: {new Date((offer as any).declined_at).toLocaleString('sv-SE')}
                  {(offer as any).decline_name ? ` av ${(offer as any).decline_name}` : ''}
                  {(offer as any).decline_reason ? ` — "${(offer as any).decline_reason}"` : ''}
                </div>
              )}
              {offer.signed_pdf_path && (
                <button
                  type="button"
                  className="underline text-green-700 hover:text-green-900 mt-1"
                  onClick={async () => {
                    const { data, error } = await supabase.storage.from('case-documents').createSignedUrl(offer.signed_pdf_path!, 3600, { download: offerFileName(offer as any, 'avtal') });
                    if (error || !data?.signedUrl) { toast.error('Kunde inte öppna avtalet'); return; }
                    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Öppna signerat avtal med verifikat
                </button>
              )}
            </div>
          )}
          {currentStatus === 'accepted' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {uppdragInfo ? (
                <span className="inline-flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  Uppdrag skapat: <strong>{uppdragInfo.uppdrag_number || uppdragInfo.id.slice(0, 8)}</strong>
                </span>
              ) : (
                <Button type="button" size="sm" onClick={handleCreateUppdrag} disabled={creatingUppdrag} className="gap-1">
                  <Briefcase className="h-3.5 w-3.5" /> {creatingUppdrag ? 'Skapar…' : 'Skapa uppdrag'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {/* UE-import */}
      <section className="rounded-md border bg-muted/20">
        <Collapsible open={ueOpen} onOpenChange={setUeOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40">
              <span className="flex items-center gap-2">
                {ueOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Importera från UE-offert (valfritt)
                {ueSourceLoaded && ueSupplier && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">· {ueSupplier}{ueTotalExcl != null ? ` · ${fmtKr(ueTotalExcl)} ex moms` : ''} · påslag {markupPercent}%</span>
                )}
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4 space-y-3">
            <div
              className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
                ueDragActive
                  ? 'border-primary bg-primary/10'
                  : 'border-muted-foreground/30 bg-muted/20 hover:bg-muted/40'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setUeDragActive(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setUeDragActive(true);
              }}
              onDragLeave={() => setUeDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setUeDragActive(false);
                const f = e.dataTransfer.files?.[0];
                if (!f) return;
                if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
                  handleUeUpload(f);
                } else {
                  toast.error('Endast PDF-filer är tillåtna');
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUeUpload(f);
                  e.target.value = '';
                }}
                disabled={ueLoading}
              />
              <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Dra och släpp UE-offerten (PDF) här – eller klicka för att välja fil
              </p>
            </div>
            {ueLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Läser offerten…
              </div>
            )}
            {ueError && <span className="text-sm text-destructive">{ueError}</span>}

            {ueSummary.length > 0 && (
              <>
                <div className="text-sm text-muted-foreground">
                  UE: <strong className="text-foreground">{ueSupplier || '—'}</strong>
                  {ueOfferNumber ? <> · Offertnr {ueOfferNumber}</> : null}
                  {ueTotalExcl != null ? <> · UE-summa ex moms {fmtKr(ueTotalExcl)}</> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Påslag %</Label>
                  <Input type="number" className="w-24" value={markupPercent} onChange={e => setMarkupPercent(Number(e.target.value))} />
                </div>

                {ueTotalExcl != null && Math.abs(ueSumExcl - ueTotalExcl) > 1 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Raderna summerar till {fmtKr(ueSumExcl)}, men UE-offerten anger {fmtKr(ueTotalExcl)}
                      (diff {fmtKr(Math.abs(ueSumExcl - ueTotalExcl))}). Justera raderna för rätt vinst.
                    </span>
                  </div>
                )}

                <div className="rounded-md border divide-y bg-background">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/40">
                    <div className="col-span-6">Benämning (visas för kunden)</div>
                    <div className="col-span-2 text-right">UE ex moms</div>
                    <div className="col-span-3 text-right">Kundpris ex moms</div>
                    <div className="col-span-1"></div>
                  </div>
                  {ueSummary.map((r) => (
                    <div key={r.id} className="px-3 py-2 space-y-1.5">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-6">
                          <Input value={r.label} onChange={e => updateUeRow(r.id, { label: e.target.value })} />
                        </div>
                        <div className="col-span-2">
                          <Input type="number" step="any" className="text-right" value={r.amount} onChange={e => updateUeRow(r.id, { amount: Number(e.target.value) })} />
                        </div>
                        <div className="col-span-3 text-right font-medium tabular-nums">{fmtKr(ueCustomerPrice(r.amount))}</div>
                        <div className="col-span-1 flex justify-end">
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeUeRow(r.id)} title="Ta bort">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground pl-1 cursor-pointer">
                        <Checkbox checked={r.is_labor} onCheckedChange={v => updateUeRow(r.id, { is_labor: !!v })} />
                        <span>Arbetskostnad (ingår i ROT-underlag)</span>
                      </label>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <Button type="button" variant="outline" size="sm" onClick={addUeRow} className="gap-1">
                    <Plus className="h-3 w-3" /> Lägg till rad
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    UE ex moms <span className="font-medium text-foreground tabular-nums">{fmtKr(ueSumExcl)}</span> · påslag {markupPercent}% · ditt pris ex moms <span className="font-medium text-foreground tabular-nums">{fmtKr(ueSumCustomer)}</span>
                    {' · '}
                    <span className="font-semibold text-green-600">
                      vår vinst {fmtKr(ueSumCustomer - ueSumExcl)} kr
                    </span>
                    <span className="text-muted-foreground">
                      {' '}(marginal {ueSumCustomer > 0 ? ((ueSumCustomer - ueSumExcl) / ueSumCustomer * 100).toFixed(1) : '0.0'} %)
                    </span>
                  </div>
                </div>

                {ueDetails.length > 0 && (
                  <Collapsible open={ueDetailsOpen} onOpenChange={setUeDetailsOpen}>
                    <CollapsibleTrigger asChild>
                      <button type="button" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                        {ueDetailsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        Visa detaljerade UE-rader ({ueDetails.length}) för avstämning
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="rounded-md border divide-y text-xs bg-background">
                        {ueDetails.map((d, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 px-3 py-1.5">
                            <div className="col-span-3 text-muted-foreground">{d.address || '—'}</div>
                            <div className="col-span-2 text-muted-foreground">{d.category || '—'}</div>
                            <div className="col-span-5">{d.description || '—'}</div>
                            <div className="col-span-2 text-right tabular-nums">{d.amount != null ? fmtKr(d.amount) : '—'}</div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                <div className="flex justify-end pt-1">
                  <Button type="button" onClick={applyUeToOffer} className="gap-2">
                    <Plus className="h-4 w-4" /> Lägg in i offerten
                  </Button>
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </section>

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
          <Input value={name} onChange={e => setName(e.target.value)} autoComplete="off" name="offer-customer-name" />
        </div>
        <div>
          <Label>E-post</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" name="offer-customer-email" />
        </div>
        <div>
          <Label>Telefon</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="off" name="offer-customer-phone" />
        </div>
        <div>
          <Label>Adress</Label>
          <Input value={address} onChange={e => setAddress(e.target.value)} autoComplete="off" name="offer-customer-address" />
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
              <p className="text-xs text-muted-foreground">Belopp anges exklusive moms. Kunden ser priserna inklusive moms i offerten (vid vanlig moms).</p>

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
              <div className="col-span-8 md:col-span-2">
                <Label className="text-xs">Summa</Label>
                <Input
                  type="number"
                  step="any"
                  className="text-right font-medium tabular-nums"
                  value={it.amount}
                  onChange={e => updateItem(it.id, { amount: Number(e.target.value) })}
                />
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
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Giltig t.o.m.</Label>
          <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
        </div>
        <div>
          <Label>Betalningsvillkor</Label>
          <Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
        </div>
        <div>
          <Label>Handpenning %</Label>
          <Input type="number" min={0} max={100} value={handpenningPercent} onChange={e => setHandpenningPercent(Number(e.target.value))} />
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
        {(() => {
          const rotActive = rotEnabled && vatMode === 'vanlig';
          return (
            <>
              <div className={`flex justify-between ${rotActive ? '' : 'font-semibold text-primary text-base'}`}>
                <span>Ordersumma innan avdrag</span>
                <span className="tabular-nums">{fmtKr(totals.total_incl_vat)}</span>
              </div>
              <div className="text-xs text-muted-foreground -mt-1">
                {vatMode === 'omvand' ? 'omvänd byggmoms' : <>varav moms <span className="tabular-nums">{fmtKr(totals.total_vat)}</span></>}
              </div>

              {rotActive && (
                <>
                  <div className="flex justify-between text-muted-foreground pt-2 border-t mt-2"><span>Rotberättigad arbetskostnad</span><span className="tabular-nums">{fmtKr(totals.rot_base)}</span></div>
                  <div className="flex justify-between text-primary"><span>Preliminärt ROT-avdrag ({rotPercent}%)</span><span className="tabular-nums">−{fmtKr(totals.rot_amount)}</span></div>
                  <div className="flex justify-between font-semibold text-primary text-base pt-1"><span>Total ordersumma efter ROT</span><span className="tabular-nums">{fmtKr(totals.total_after_rot)}</span></div>
                  {totals.rot_amount > 50000 && (
                    <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2 text-xs">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>ROT-avdraget överstiger 50 000 kr/person/år – kontrollera att kunden har avdragsutrymme.</span>
                    </div>
                  )}
                </>
              )}

              {handpenningPercent > 0 && (
                <>
                  <div className="flex justify-between pt-2 border-t mt-2"><span>Handpenning {handpenningPercent}%{rotEnabled ? ' (före ROT)' : ''}</span><span className="tabular-nums">{fmtKr(totals.handpenning)}</span></div>
                  <div className="flex justify-between"><span>Slutfaktura{rotActive ? ' (efter prel. ROT-avdrag)' : ''}</span><span className="tabular-nums">{fmtKr(totals.slutfaktura)}</span></div>
                </>
              )}
            </>
          );
        })()}
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
