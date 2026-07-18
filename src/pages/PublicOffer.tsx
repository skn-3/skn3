import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, ChevronDown, ChevronRight, FileText, Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { buildOfferPdfBlob } from '@/lib/offerPdf';
import { SignaturePad } from '@/components/public/SignaturePad';
import { toast } from 'sonner';

type PublicOfferData = {
  offer_number: string | null;
  created_at: string;
  valid_until: string | null;
  payment_terms: string | null;
  customer_type: 'privat' | 'foretag';
  customer_name: string | null;
  customer_address: string | null;
  title: string | null;
  description: string | null;
  line_items: Array<{ id?: string; description: string; qty: number; unit: string; unit_price: number; amount: number; is_labor?: boolean }>;
  vat_mode: 'vanlig' | 'omvand';
  rot_enabled: boolean;
  rot_percent: number;
  handpenning_percent?: number;
  total_ex_vat: number;
  total_vat: number;
  total_incl_vat: number;
  rot_base: number;
  rot_amount: number;
  total_after_rot: number;
  terms_text: string | null;
  status: string;
  accepted_at: string | null;
  accept_name: string | null;
  declined_at?: string | null;

  customer_personnummer?: string | null;
  fastighetsbeteckning?: string | null;
  signed_url: string | null;       // unsigned offer PDF (signed download URL)
  signed_pdf_url: string | null;   // accepted/signed PDF (signed download URL)
};

const fmtKr = (n: number | null | undefined) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(Number(n || 0));

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('sv-SE') : '—');
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString('sv-SE') : '—');

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  sent: { text: 'Skickad', cls: 'bg-blue-100 text-blue-800' },
  accepted: { text: 'Accepterad', cls: 'bg-green-100 text-green-800' },
  expired: { text: 'Utgången', cls: 'bg-yellow-100 text-yellow-800' },
  declined: { text: 'Avböjd', cls: 'bg-muted text-muted-foreground' },
};


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

export default function PublicOffer() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicOfferData | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  // Accept form
  const [acceptName, setAcceptName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Decline form
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineName, setDeclineName] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);


  useEffect(() => {
    document.title = 'Din offert · SmartKlimat N3prenad';
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setError('Ogiltig länk'); setLoading(false); return; }
      try {
        const { data: res, error: invErr } = await supabase.functions.invoke('public-offer', { body: { token } });
        if (cancelled) return;
        if (invErr || !res || (res as any).error) {
          setError('Offerten kunde inte hittas eller har gått ut');
        } else {
          const d = res as PublicOfferData;
          setData(d);
          if (!acceptName) setAcceptName(d.customer_name || '');
        }
      } catch {
        if (!cancelled) setError('Offerten kunde inte hittas eller har gått ut');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAccept = async () => {
    if (!data || !token) return;
    if (!acceptedTerms) { toast.error('Du behöver bekräfta att du har läst villkoren'); return; }
    if (!acceptName.trim()) { toast.error('Ange ditt namn'); return; }

    setSubmitting(true);
    const acceptedAt = new Date().toISOString();
    let signedPdfBase64: string | undefined;

    try {
      const blob = await buildOfferPdfBlob(data as any, { signature: { name: acceptName.trim(), acceptedAt, userAgent: navigator.userAgent, imageDataUrl: signatureDataUrl || undefined } });
      signedPdfBase64 = await blobToBase64(blob);
    } catch (e) {
      console.error('PDF signering misslyckades, fortsätter med accept', e);
    }

    try {
      const { data: res, error: invErr } = await supabase.functions.invoke('accept-offer', {
        body: { token, name: acceptName.trim(), signed_pdf_base64: signedPdfBase64, origin: window.location.origin },
      });
      if (invErr || !res || (res as any).error) {
        throw new Error((res as any)?.error || 'Kunde inte registrera accept');
      }
      const out = res as { ok: boolean; accepted_at?: string; accept_name?: string; already?: boolean; expired?: boolean };
      if (out.expired) {
        setData(prev => prev ? { ...prev, status: 'expired' } : prev);
        toast.error('Offerten har gått ut');
        return;
      }
      // Re-fetch fresh state (gives us signed_pdf_url etc.)
      const { data: res2 } = await supabase.functions.invoke('public-offer', { body: { token } });
      if (res2 && !(res2 as any).error) {
        setData(res2 as PublicOfferData);
      } else {
        setData(prev => prev ? { ...prev, status: 'accepted', accepted_at: out.accepted_at || acceptedAt, accept_name: out.accept_name || acceptName.trim() } : prev);
      }
      toast.success('Tack! Offerten är accepterad.');
    } catch (e: any) {
      toast.error(e?.message || 'Något gick fel');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!data || !token) return;
    setDeclining(true);
    try {
      const { data: res, error: invErr } = await supabase.functions.invoke('decline-offer', {
        body: { token, name: declineName.trim() || undefined, reason: declineReason.trim() || undefined },
      });
      if (invErr || !res || (res as any).error) {
        throw new Error((res as any)?.error || 'Kunde inte registrera beskedet');
      }
      const out = res as { ok: boolean; expired?: boolean; status?: string; declined_at?: string };
      if (out.expired) {
        setData(prev => prev ? { ...prev, status: 'expired' } : prev);
        toast.error('Offerten har gått ut');
        return;
      }
      setData(prev => prev ? { ...prev, status: 'declined', declined_at: out.declined_at || new Date().toISOString() } : prev);
      toast.success('Tack för ditt besked.');
    } catch (e: any) {
      toast.error(e?.message || 'Något gick fel');
    } finally {
      setDeclining(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Laddar offert…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="max-w-md w-full bg-card rounded-xl border p-8 text-center shadow-sm">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-lg font-semibold mb-2">Offerten kunde inte hittas</h1>
          <p className="text-sm text-muted-foreground">Länken kan ha gått ut eller dragits tillbaka. Kontakta SmartKlimat N3prenad om du har frågor.</p>
          <p className="text-xs text-muted-foreground mt-4">n3prenad@smartklimat.org · 070-719 72 35</p>
        </div>
      </div>
    );
  }

  const status = STATUS_LABEL[data.status] || { text: data.status, cls: 'bg-muted text-muted-foreground' };
  const isAccepted = data.status === 'accepted';
  const pdfDownloadUrl = data.signed_pdf_url || data.signed_url;

  return (
    <div className="min-h-screen bg-muted/30 pb-12">
      {/* Header */}
      <header className="bg-[#22C55E] text-white">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="SmartKlimat" className="h-10 w-10 rounded-full bg-white p-1" />
            <div>
              <div className="font-bold text-lg leading-tight">SmartKlimat N3prenad</div>
              <div className="text-xs opacity-90">n3prenad@smartklimat.org</div>
            </div>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${status.cls}`}>{status.text}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 mt-6 space-y-4">
        {/* Offer title block */}
        <section className="bg-card rounded-xl border shadow-sm p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Offert</div>
              <h1 className="text-2xl font-bold mt-1">{data.offer_number || '—'}</h1>
              {data.title && <p className="text-base text-muted-foreground mt-1">{data.title}</p>}
            </div>
            <div className="text-sm text-right">
              <div className="text-muted-foreground">Datum</div>
              <div className="font-medium">{fmtDate(data.created_at)}</div>
              {data.valid_until && (
                <>
                  <div className="text-muted-foreground mt-2">Giltig t.o.m.</div>
                  <div className="font-medium">{fmtDate(data.valid_until)}</div>
                </>
              )}
            </div>
          </div>

          {pdfDownloadUrl && (
            <div className="mt-4">
              <Button asChild className="gap-2 bg-[#22C55E] hover:bg-[#16A34A]">
                <a href={pdfDownloadUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" /> Ladda ner PDF
                </a>
              </Button>
            </div>
          )}
        </section>

        {/* Parties */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border shadow-sm p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Från</div>
            <div className="font-semibold">SmartKlimat N3prenad AB</div>
            <div className="text-sm text-muted-foreground">Org.nr 559026-6630</div>
            <div className="text-sm text-muted-foreground">Morsstigen 3, 141 71 Segeltorp</div>
            <div className="text-sm text-muted-foreground mt-1">070-719 72 35</div>
            <div className="text-sm text-muted-foreground">n3prenad@smartklimat.org</div>
          </div>
          <div className="bg-card rounded-xl border shadow-sm p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Till</div>
            <div className="font-semibold">{data.customer_name || '—'}</div>
            {data.customer_address && <div className="text-sm text-muted-foreground">{data.customer_address}</div>}
            <div className="text-xs text-muted-foreground mt-1">{data.customer_type === 'privat' ? 'Privatperson' : 'Företag / BRF'}</div>
            {data.customer_type === 'privat' && data.customer_personnummer && (
              <div className="text-xs text-muted-foreground">Personnr: {data.customer_personnummer}</div>
            )}
            {data.customer_type === 'privat' && data.fastighetsbeteckning && (
              <div className="text-xs text-muted-foreground">Fastighet: {data.fastighetsbeteckning}</div>
            )}
          </div>
        </section>

        {/* Description */}
        {data.description && (
          <section className="bg-card rounded-xl border shadow-sm p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Beskrivning</div>
            <p className="text-sm whitespace-pre-wrap">{data.description}</p>
          </section>
        )}

        {/* Line items */}
        <section className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-muted-foreground">Specifikation</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Benämning</th>
                  <th className="text-right px-4 py-2">Antal</th>
                  <th className="text-left px-4 py-2">Enhet</th>
                  <th className="text-right px-4 py-2">À-pris</th>
                  <th className="text-right px-4 py-2">Summa {data.vat_mode === 'vanlig' ? '(inkl. moms)' : '(exkl. moms)'}</th>
                </tr>
              </thead>
              <tbody>
                {(data.line_items || []).map((it, idx) => (
                  <tr key={it.id || idx} className="border-t">
                    <td className="px-4 py-2">{it.description}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="px-4 py-2">{it.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtKr(Number(it.unit_price || 0) * (data.vat_mode === 'vanlig' ? 1.25 : 1))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtKr(Number(it.amount || 0) * (data.vat_mode === 'vanlig' ? 1.25 : 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Totals */}
        {(() => {
          const rotActive = data.rot_enabled && data.vat_mode === 'vanlig';
          const hpPercent = Number(data.handpenning_percent ?? 25);
          const payable = Number(data.total_after_rot || 0);
          const beforeRot = Number(data.total_incl_vat || 0) || (payable + Number(data.rot_amount || 0));
          const handpenning = Math.round(beforeRot * hpPercent / 100);
          const slutfaktura = payable - handpenning;
          return (
            <section className="bg-card rounded-xl border shadow-sm p-5 space-y-1 text-sm">
              {/* 1) Ordersumma innan avdrag */}
              <div className={`flex justify-between ${rotActive ? '' : 'font-bold text-base text-[#16A34A]'}`}>
                <span>Ordersumma innan avdrag</span>
                <span className="tabular-nums">{fmtKr(data.total_incl_vat)}</span>
              </div>
              <div className="text-xs text-muted-foreground -mt-1">
                {data.vat_mode === 'omvand' ? 'omvänd byggmoms' : <>varav moms <span className="tabular-nums">{fmtKr(data.total_vat)}</span></>}
              </div>

              {/* 2) ROT-block */}
              {rotActive && (
                <>
                  <div className="flex justify-between text-muted-foreground pt-2 border-t mt-2"><span>Rotberättigad arbetskostnad</span><span className="tabular-nums">{fmtKr(data.rot_base)}</span></div>
                  <div className="flex justify-between text-[#22C55E]"><span>Preliminärt ROT-avdrag ({data.rot_percent}%)</span><span className="tabular-nums">−{fmtKr(data.rot_amount)}</span></div>
                  <div className="flex justify-between font-bold text-base text-[#16A34A] pt-1"><span>Total ordersumma efter ROT</span><span className="tabular-nums">{fmtKr(payable)}</span></div>
                </>
              )}

              {/* 3) Handpenning + slutfaktura */}
              {hpPercent > 0 && (
                <>
                  <div className="flex justify-between pt-2 border-t mt-2"><span>Handpenning {hpPercent}%{rotActive ? ' (före ROT)' : ''}</span><span className="tabular-nums">{fmtKr(handpenning)}</span></div>
                  <div className="flex justify-between"><span>Slutfaktura{rotActive ? ' (efter prel. ROT-avdrag)' : ''}</span><span className="tabular-nums">{fmtKr(slutfaktura)}</span></div>
                </>
              )}
            </section>
          );
        })()}

        {/* Validity / payment */}
        <section className="bg-card rounded-xl border shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Giltig t.o.m.</div>
            <div className="font-medium mt-1">{fmtDate(data.valid_until)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Betalningsvillkor</div>
            <div className="font-medium mt-1">{data.payment_terms || '—'}</div>
          </div>
        </section>

        {/* Terms */}
        {data.terms_text && (
          <section className="bg-card rounded-xl border shadow-sm p-5">
            <Collapsible open={termsOpen} onOpenChange={setTermsOpen}>
              <CollapsibleTrigger asChild>
                <button type="button" className="flex items-center gap-2 text-sm font-medium hover:text-[#22C55E]">
                  {termsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Allmänna villkor
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans">{data.terms_text}</pre>
              </CollapsibleContent>
            </Collapsible>
          </section>
        )}

        {/* Accept / verification */}
        {isAccepted ? (
          <section className="bg-green-50 border border-green-200 rounded-xl shadow-sm p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-[#16A34A] mx-auto mb-2" />
            <h2 className="text-lg font-bold text-[#15803D]">Offerten är accepterad – tack!</h2>
            <p className="text-sm text-[#15803D]/90 mt-1">
              Accepterad av <strong>{data.accept_name || data.customer_name || '—'}</strong>, {fmtDateTime(data.accepted_at)}, offert {data.offer_number || '—'}.
            </p>
            {data.signed_pdf_url && (
              <div className="mt-4">
                <Button asChild variant="outline" className="gap-2">
                  <a href={data.signed_pdf_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" /> Ladda ner signerad PDF med verifikat
                  </a>
                </Button>
              </div>
            )}
          </section>
        ) : data.status === 'expired' ? (
          <section className="bg-yellow-50 border border-yellow-200 rounded-xl shadow-sm p-6 text-center">
            <Clock className="h-10 w-10 text-yellow-700 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-yellow-900">Offerten har gått ut</h2>
            {data.valid_until && (
              <p className="text-sm text-yellow-900/90 mt-1">Giltig t.o.m. {fmtDate(data.valid_until)}</p>
            )}
            <p className="text-sm text-yellow-900/90 mt-3">
              Vill du gå vidare? Kontakta oss så tar vi fram en uppdaterad offert.
            </p>
            <p className="text-xs text-yellow-900/80 mt-2">070-719 72 35 · n3prenad@smartklimat.org</p>
          </section>
        ) : data.status === 'declined' ? (
          <section className="bg-muted/40 border rounded-xl shadow-sm p-6 text-center">
            <XCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <h2 className="text-lg font-semibold">Tack för ditt besked.</h2>
            <p className="text-sm text-muted-foreground mt-1">Offerten är nu avböjd.</p>
            {data.declined_at && (
              <p className="text-xs text-muted-foreground mt-2">{fmtDateTime(data.declined_at)}</p>
            )}
          </section>
        ) : data.status === 'sent' ? (
          <>
            <section className="bg-card rounded-xl border shadow-sm p-5 md:p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold">Acceptera offerten</h2>
                <p className="text-sm text-muted-foreground mt-1">När du accepterar registreras tidpunkt och IP-adress, och du får en bekräftelse på e-post.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="accept-name">Ditt namn *</Label>
                  <Input
                    id="accept-name"
                    value={acceptName}
                    onChange={(e) => setAcceptName(e.target.value)}
                    placeholder="För- och efternamn"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label>Din signatur</Label>
                <SignaturePad name={acceptName} onChange={setSignatureDataUrl} />
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="accept-terms" checked={acceptedTerms} onCheckedChange={(v) => setAcceptedTerms(v === true)} className="mt-1" />
                <Label htmlFor="accept-terms" className="text-sm font-normal leading-relaxed cursor-pointer">
                  Jag har läst och accepterar offerten samt de allmänna villkoren.
                </Label>
              </div>
              <Button
                type="button"
                onClick={handleAccept}
                disabled={!acceptedTerms || !acceptName.trim() || !signatureDataUrl || submitting}
                className="bg-[#22C55E] hover:bg-[#16A34A] gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {submitting ? 'Registrerar…' : 'Acceptera offert'}
              </Button>
            </section>

            <section className="bg-card/60 rounded-xl border border-dashed p-4 md:p-5">
              <Collapsible open={declineOpen} onOpenChange={setDeclineOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {declineOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Tacka nej till offerten
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Du kan lämna ett kort meddelande om varför, så vet vi hur vi kan bli bättre. Båda fälten är frivilliga.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="decline-name" className="text-xs">Namn (frivilligt)</Label>
                      <Input
                        id="decline-name"
                        value={declineName}
                        onChange={(e) => setDeclineName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="decline-reason" className="text-xs">Orsak (frivilligt)</Label>
                    <Textarea
                      id="decline-reason"
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDecline}
                    disabled={declining}
                    className="gap-2"
                  >
                    {declining ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Skicka besked
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </section>
          </>
        ) : null}


        <footer className="text-center text-xs text-muted-foreground pt-4">
          SmartKlimat N3prenad AB · Org.nr 559026-6630
        </footer>
      </main>
    </div>
  );
}
