import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowDown, Award, BadgeCheck, Check, CheckCircle2, ChevronDown, ChevronUp, Clock, Download, FileText, Loader2, Lock, Percent, Phone, ShieldCheck, XCircle,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { buildOfferPdfBlob } from '@/lib/offerPdf';
import { daysLeft, fmtDateLong, fmtDateTimeSv, parseDescription, parseTerms } from '@/lib/offerText';
import { SignaturePad } from '@/components/public/SignaturePad';
import { toast } from 'sonner';
import { useForceLight } from '@/hooks/useForceLight';

type PublicOfferData = {
  id?: string | null;
  offer_number: string | null;
  created_at: string;
  sent_at?: string | null;
  created_by?: string | null;
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
  rot_persons?: number | null;
  rot_cap_per_person?: number | null;
  rot_used?: number | null;
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
  signed_url: string | null;       // offert-PDF (signerad nedladdningslänk)
  signed_pdf_url: string | null;   // accepterat avtal med verifikat
};

const COMPANY_PHONE = '070-719 72 35';
const COMPANY_EMAIL = 'n3prenad@smartklimat.org';

const fmtKr = (n: number | null | undefined) => Number(n || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) + ' kr';
const fmtAcceptedAt = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return `${fmtDateLong(d)} kl. ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}`;
};
const initialsOf = (name: string | null | undefined) => (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'N3';

const STATUS: Record<string, { text: string; cls: string }> = {
  sent: { text: 'Väntar på ditt svar', cls: 'bg-gold text-gold-foreground' },
  accepted: { text: 'Accepterad', cls: 'bg-success-soft text-success' },
  expired: { text: 'Utgången', cls: 'bg-warning-soft text-warning-ink' },
  declined: { text: 'Avböjd', cls: 'bg-white/15 text-white' },
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

/* ---------- Små byggstenar ---------- */
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-bold tracking-[.12em] uppercase text-gold-ink">{children}</div>
);
const Card = ({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) => (
  <section id={id} className={`bg-card border border-border rounded-2xl shadow-card p-5 md:p-7 ${className}`}>{children}</section>
);
const Num = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`font-mono tabular whitespace-nowrap ${className}`}>{children}</span>
);

function Description({ text }: { text: string }) {
  const blocks = parseDescription(text);
  return (
    <div className="text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === 'heading') return <h3 key={i} className="text-[15px] font-bold text-primary mt-4 mb-1.5 first:mt-0">{b.text}</h3>;
        if (b.type === 'para') return <p key={i} className="mb-2">{b.text}</p>;
        return (
          <ul key={i} className="mb-1">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2.5 py-[3px]"><span aria-hidden="true" className="text-sage flex-none">–</span><span>{it}</span></li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

function Terms({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const blocks = parseTerms(text);
  return (
    <div>
      <div className={`space-y-2 text-[13.5px] leading-relaxed text-muted-foreground ${open ? '' : 'relative max-h-[260px] overflow-hidden'}`}>
        {blocks.map((b, i) => (
          <p key={i}>
            {b.heading && <b className="text-foreground">{b.heading}. </b>}
            {b.lead && <b className="text-foreground">{b.lead} </b>}
            {b.body}
          </p>
        ))}
        {!open && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />}
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary underline underline-offset-4">
        {open ? <>Visa färre <ChevronUp className="h-4 w-4" /></> : <>Visa alla {blocks.length} punkter <ChevronDown className="h-4 w-4" /></>}
      </button>
    </div>
  );
}

export default function PublicOffer() {
  useForceLight();
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicOfferData | null>(null);

  // Accept
  const [acceptName, setAcceptName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Decline
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineName, setDeclineName] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);

  // Fast knapp på telefon tills signeringskortet syns
  const signRef = useRef<HTMLElement | null>(null);
  const [signInView, setSignInView] = useState(false);

  useEffect(() => { document.title = 'Din offert · SmartKlimat N3prenad'; }, []);

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

  useEffect(() => {
    const el = signRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setSignInView(e.isIntersecting), { rootMargin: '0px 0px -80px 0px', threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [data?.status, loading]);

  const scrollToSign = () => signRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
      if (invErr || !res || (res as any).error) throw new Error((res as any)?.error || 'Kunde inte registrera accept');
      const out = res as { ok: boolean; accepted_at?: string; accept_name?: string; already?: boolean; expired?: boolean };
      if (out.expired) {
        setData((prev) => (prev ? { ...prev, status: 'expired' } : prev));
        toast.error('Offerten har gått ut');
        return;
      }
      const { data: res2 } = await supabase.functions.invoke('public-offer', { body: { token } });
      if (res2 && !(res2 as any).error) setData(res2 as PublicOfferData);
      else setData((prev) => (prev ? { ...prev, status: 'accepted', accepted_at: out.accepted_at || acceptedAt, accept_name: out.accept_name || acceptName.trim() } : prev));
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      if (invErr || !res || (res as any).error) throw new Error((res as any)?.error || 'Kunde inte registrera beskedet');
      const out = res as { ok: boolean; expired?: boolean; status?: string; declined_at?: string };
      if (out.expired) {
        setData((prev) => (prev ? { ...prev, status: 'expired' } : prev));
        toast.error('Offerten har gått ut');
        return;
      }
      setData((prev) => (prev ? { ...prev, status: 'declined', declined_at: out.declined_at || new Date().toISOString() } : prev));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success('Tack för ditt besked.');
    } catch (e: any) {
      toast.error(e?.message || 'Något gick fel');
    } finally {
      setDeclining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Laddar offert…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full bg-card rounded-2xl border border-border p-8 text-center shadow-card">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h1 className="font-display text-xl font-bold mb-2">Offerten kunde inte hittas</h1>
          <p className="text-sm text-muted-foreground">Länken kan ha gått ut eller dragits tillbaka. Kontakta SmartKlimat N3prenad om du har frågor.</p>
          <p className="text-xs text-muted-foreground mt-4">{COMPANY_EMAIL} · {COMPANY_PHONE}</p>
        </div>
      </div>
    );
  }

  /* ---------- Beräkningar (samma regler som offerCalc/PDF) ---------- */
  const status = STATUS[data.status] || { text: data.status, cls: 'bg-white/15 text-white' };
  const isSent = data.status === 'sent';
  const isAccepted = data.status === 'accepted';
  const rotActive = data.rot_enabled && data.vat_mode === 'vanlig';
  const inclVat = data.vat_mode === 'vanlig';
  const priceFactor = inclVat ? 1.25 : 1;
  const hpPercent = Number(data.handpenning_percent ?? 25);
  const orderSum = Number(data.total_incl_vat || 0);
  const payable = rotActive ? Number(data.total_after_rot || 0) : orderSum;
  const handpenning = Math.round(orderSum * hpPercent / 100);
  const slutfaktura = payable - handpenning;
  const payLabel = rotActive ? 'Att betala efter ROT-avdrag' : inclVat ? 'Att betala inkl. moms' : 'Att betala, omvänd byggmoms';
  const simpleItems = (data.line_items || []).every((it) => Number(it.qty || 1) === 1);
  const left = daysLeft(data.valid_until);
  const validShare = (() => {
    if (left == null) return 0;
    const start = new Date(data.created_at).getTime();
    const end = new Date(data.valid_until!).getTime();
    const total = Math.max(1, end - start);
    return Math.min(1, Math.max(0, (Date.now() - start) / total));
  })();
  const rotUncapped = rotActive ? Math.round(Number(data.rot_base || 0) * Number(data.rot_percent || 0) / 100) : 0;
  const rotCapped = rotActive && Number(data.rot_amount || 0) < rotUncapped;
  const rotPersons = Math.max(1, Math.floor(Number(data.rot_persons ?? 1) || 1));
  const seller = data.created_by || null;
  const pdfUrl = data.signed_pdf_url || data.signed_url;
  const firstName = (data.accept_name || data.customer_name || '').split(/\s+/)[0] || '';

  /* ---------- Delade block ---------- */
  const summaryCard = (
    <Card className="!p-5 md:!p-6">
      <SectionLabel>{payLabel}</SectionLabel>
      <div className="font-display text-[34px] font-bold leading-none tracking-tight mt-1.5 mb-1 tabular">{fmtKr(payable)}</div>
      {rotActive && <div className="text-[13px] text-muted-foreground mb-3">{fmtKr(orderSum)} inkl. moms − {fmtKr(data.rot_amount)} prel. ROT</div>}
      {!rotActive && <div className="text-[13px] text-muted-foreground mb-3">{inclVat ? `varav moms ${fmtKr(data.total_vat)}` : 'Omvänd byggmoms – köparen redovisar momsen'}</div>}
      {hpPercent > 0 && (
        <>
          <div className="flex justify-between gap-3 text-[13.5px] py-2 border-t border-border"><span className="text-muted-foreground">Handpenning {hpPercent} % vid beställning</span><Num>{fmtKr(handpenning)}</Num></div>
          <div className="flex justify-between gap-3 text-[13.5px] py-2 border-t border-border"><span className="text-muted-foreground">Slutfaktura efter utfört arbete</span><Num>{fmtKr(slutfaktura)}</Num></div>
        </>
      )}
      {isSent && (
        <div className="flex flex-col gap-2.5 mt-4">
          <Button variant="gold" size="xl" className="w-full gap-2" onClick={scrollToSign}><ArrowDown className="h-4 w-4" /> Acceptera och signera</Button>
          {pdfUrl && (
            <Button asChild variant="outline" size="lg" className="w-full gap-2">
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /> Ladda ner offerten (PDF)</a>
            </Button>
          )}
        </div>
      )}
      {!isSent && (
        <div className="flex flex-col gap-2.5 mt-4">
          {pdfUrl && (
            <Button asChild variant={isAccepted ? 'gold' : 'outline'} size="lg" className="w-full gap-2">
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /> {isAccepted && data.signed_pdf_url ? 'Ladda ner signerat avtal (PDF)' : 'Ladda ner offerten (PDF)'}</a>
            </Button>
          )}
          {isAccepted && (
            <Button asChild variant="outline" size="lg" className="w-full gap-2">
              <a href={`tel:${COMPANY_PHONE.replace(/[^\d+]/g, '')}`}><Phone className="h-4 w-4" /> Ring {seller || 'oss'}</a>
            </Button>
          )}
        </div>
      )}
      {data.valid_until && isSent && (
        <div className="mt-4 rounded-xl bg-gold-soft px-3.5 py-3 text-[13px]">
          <b>Giltig till {fmtDateLong(data.valid_until)}</b>{left != null && left >= 0 && <> · {left === 0 ? 'sista dagen' : `${left} ${left === 1 ? 'dag' : 'dagar'} kvar`}</>}
          <div className="h-1.5 rounded-full bg-white mt-2 overflow-hidden"><div className="h-full rounded-full bg-gold-ink" style={{ width: `${Math.max(3, Math.round(validShare * 100))}%` }} /></div>
        </div>
      )}
      <div className="flex items-center gap-3 mt-4">
        <span className="h-10 w-10 rounded-full bg-primary text-primary-foreground ring-2 ring-sage inline-flex items-center justify-center text-[13px] font-bold flex-none">{initialsOf(seller)}</span>
        <div className="min-w-0">
          <div className="text-sm font-bold">{seller ? `${seller}, din kontakt` : 'SmartKlimat N3prenad'}</div>
          <div className="text-[12.5px] text-muted-foreground truncate"><a href={`tel:${COMPANY_PHONE.replace(/[^\d+]/g, '')}`} className="hover:text-foreground">{COMPANY_PHONE}</a> · <a href={`mailto:${COMPANY_EMAIL}`} className="hover:text-foreground">{COMPANY_EMAIL}</a></div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className={`min-h-screen bg-background ${isSent ? 'pb-28 lg:pb-12' : 'pb-12'}`}>
      {/* Header + hero */}
      <header className="bg-ink-deep text-white relative overflow-hidden">
        <img src="/brand/logo-stamp-guld.png" alt="" aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 w-[420px] h-[420px] opacity-[.07] -rotate-6 select-none" />
        <div className="max-w-[1040px] mx-auto px-4 md:px-6 relative">
          <div className="flex items-center justify-between gap-4 h-[68px]">
            <div className="flex items-center gap-3">
              <img src="/brand/logo-stamp-vit-n3.png" alt="SmartKlimat N3prenad" className="h-9 w-9 object-contain" />
              <div className="leading-none">
                <div className="font-display text-[17px] font-bold">SmartKlimat</div>
                <div className="text-[10px] tracking-[.14em] uppercase text-ink-muted mt-0.5">N3prenad</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-ink-muted">
              <span className="hidden sm:inline">Offert <Num className="text-white">{data.offer_number || '—'}</Num></span>
              <span className={`inline-flex items-center gap-2 h-[30px] px-3 rounded-full text-[13px] font-bold ${status.cls}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status.text}</span>
            </div>
          </div>

          {isAccepted ? (
            <div className="py-8 md:py-10 text-center animate-fade-up">
              <div className="mx-auto h-16 w-16 rounded-full bg-gold text-ink-deep inline-flex items-center justify-center shadow-[0_0_0_10px_rgba(220,190,110,.18)]"><Check className="h-8 w-8" strokeWidth={3} /></div>
              <h1 className="font-display text-[28px] md:text-[36px] font-bold leading-tight mt-4">Tack{firstName ? ` ${firstName}` : ''}, offerten är accepterad</h1>
              <p className="text-ink-muted text-sm md:text-[15px] mt-2">Signerad <b className="text-white font-semibold">{fmtAcceptedAt(data.accepted_at)}</b> · offert {data.offer_number || '—'}<br />Bekräftelsen och avtalet är skickade till din e-post.</p>
            </div>
          ) : (
            <div className="pt-6 pb-10 md:pt-8 md:pb-12 animate-fade-up">
              <div className="text-[11px] md:text-xs font-semibold tracking-[.1em] uppercase text-ink-muted">Offert {data.offer_number || ''}{data.customer_name ? ` till ${data.customer_name}` : ''}{data.customer_address ? ` · ${data.customer_address}` : ''}</div>
              <h1 className="font-display text-[26px] md:text-[38px] font-bold leading-[1.1] tracking-tight mt-2 mb-3 max-w-[760px]">{data.title || `Offert ${data.offer_number || ''}`}</h1>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] md:text-sm text-ink-muted">
                <span>Skickad <b className="text-white font-semibold">{fmtDateLong(data.sent_at || data.created_at)}</b>{seller ? ` av ${seller}` : ''}</span>
                {data.valid_until && <span>Giltig till <b className="text-white font-semibold">{fmtDateLong(data.valid_until)}</b></span>}
                {data.payment_terms && <span>Betalning <b className="text-white font-semibold">{data.payment_terms}</b></span>}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1040px] mx-auto px-4 md:px-6">
        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 lg:items-start -mt-4 pt-0">
          {/* Sidopanel: överst på telefon, fast till höger på dator */}
          <aside className="lg:order-2 lg:sticky lg:top-5 mt-4 lg:mt-0">
            {summaryCard}
          </aside>

          <div className="lg:order-1 space-y-4 mt-4 lg:mt-0">
            {isAccepted && (
              <Card>
                <SectionLabel>Vad händer nu</SectionLabel>
                <h2 className="font-display text-[22px] font-bold mt-1 mb-4">Nästa steg</h2>
                <ol className="flex flex-col">
                  {[
                    { title: 'Offerten accepterad', sub: `${fmtDateLong(data.accepted_at)} · signerad digitalt`, state: 'done' },
                    { title: 'Vi hör av oss och planerar', sub: `${seller || 'Vi'} ringer dig inom några dagar.${hpPercent > 0 ? ` Handpenning ${fmtKr(handpenning)} faktureras med ${data.payment_terms || '10 dagar netto'}.` : ''}`, state: 'now' },
                    { title: 'Arbetet utförs', sub: 'Startdatum bokas tillsammans med dig.', state: 'next' },
                    { title: 'Slutfaktura', sub: `${fmtKr(hpPercent > 0 ? slutfaktura : payable)} efter utfört arbete${rotActive ? ', med ROT-avdraget draget' : ''}.`, state: 'next' },
                  ].map((s, i, arr) => (
                    <li key={i} className="flex gap-3.5">
                      <div className="flex flex-col items-center">
                        <span className={`h-7 w-7 rounded-full inline-flex items-center justify-center text-xs font-bold flex-none ${s.state === 'done' ? 'bg-primary text-primary-foreground' : s.state === 'now' ? 'bg-gold text-gold-foreground shadow-[0_0_0_5px_hsl(var(--gold-soft))]' : 'bg-card border-2 border-border text-muted-foreground'}`}>
                          {s.state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                        </span>
                        {i < arr.length - 1 && <span className={`w-0.5 flex-1 my-1 ${s.state === 'done' ? 'bg-primary' : 'bg-border'}`} />}
                      </div>
                      <div className={i < arr.length - 1 ? 'pb-4' : ''}>
                        <div className="text-[14.5px] font-bold">{s.title}</div>
                        <div className="text-[13px] text-muted-foreground">{s.sub}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            {data.status === 'expired' && (
              <Card className="border-warning/60 bg-warning-soft/40">
                <div className="flex items-start gap-3">
                  <Clock className="h-6 w-6 text-warning-ink flex-none mt-0.5" />
                  <div>
                    <h2 className="font-display text-xl font-bold">Offerten har gått ut</h2>
                    {data.valid_until && <p className="text-sm text-muted-foreground mt-1">Den gällde till och med {fmtDateLong(data.valid_until)}.</p>}
                    <p className="text-sm mt-2">Vill du gå vidare? Ring {seller || 'oss'} på <a className="font-semibold underline underline-offset-4" href={`tel:${COMPANY_PHONE.replace(/[^\d+]/g, '')}`}>{COMPANY_PHONE}</a> så tar vi fram en uppdaterad offert.</p>
                  </div>
                </div>
              </Card>
            )}

            {data.status === 'declined' && (
              <Card>
                <div className="flex items-start gap-3">
                  <XCircle className="h-6 w-6 text-muted-foreground flex-none mt-0.5" />
                  <div>
                    <h2 className="font-display text-xl font-bold">Tack för ditt besked</h2>
                    <p className="text-sm text-muted-foreground mt-1">Offerten är avböjd{data.declined_at ? ` ${fmtDateTimeSv(data.declined_at, false)}` : ''}. Ändrar du dig är du välkommen att höra av dig till {seller || 'oss'} på {COMPANY_PHONE}.</p>
                  </div>
                </div>
              </Card>
            )}

            {data.description && (
              <Card>
                <SectionLabel>Omfattning</SectionLabel>
                <h2 className="font-display text-[22px] font-bold mt-1 mb-3">Det här ingår i offerten</h2>
                <Description text={data.description} />
              </Card>
            )}

            <Card>
              <SectionLabel>Pris</SectionLabel>
              <h2 className="font-display text-[22px] font-bold mt-1 mb-3">Pris och betalning</h2>
              <div className="border-t border-border">
                {(data.line_items || []).map((it, idx) => (
                  <div key={it.id || idx} className="flex items-center justify-between gap-4 py-3 border-b border-border">
                    <div className="min-w-0">
                      <div className="font-semibold text-[15px]">{it.description}</div>
                      {!simpleItems && <div className="text-xs text-muted-foreground mt-0.5"><Num>{Number(it.qty || 0).toLocaleString('sv-SE')} {it.unit}</Num> × <Num>{fmtKr(Number(it.unit_price || 0) * priceFactor)}</Num></div>}
                      {rotActive && it.is_labor && <div className="text-xs font-bold text-sage mt-0.5">ROT-berättigat arbete</div>}
                    </div>
                    <Num className="text-[15px]">{fmtKr(Number(it.amount || 0) * priceFactor)}</Num>
                  </div>
                ))}
              </div>
              <div className="ml-auto w-full sm:max-w-[400px] mt-4">
                <div className="flex justify-between text-sm py-1"><span>{inclVat ? 'Ordersumma inkl. moms' : 'Ordersumma exkl. moms'}</span><Num>{fmtKr(orderSum)}</Num></div>
                <div className="flex justify-between text-[13px] text-muted-foreground py-1"><span>{inclVat ? 'varav moms 25 %' : 'Omvänd byggmoms – köparen redovisar momsen'}</span>{inclVat && <Num>{fmtKr(data.total_vat)}</Num>}</div>
                {rotActive && (
                  <>
                    <div className="flex justify-between text-[13px] text-muted-foreground py-1"><span>ROT-berättigad arbetskostnad</span><Num>{fmtKr(data.rot_base)}</Num></div>
                    <div className="flex justify-between text-sm font-bold text-success py-1"><span>Preliminärt ROT-avdrag {data.rot_percent} %{rotCapped ? ' (begränsat)' : ''}</span><Num>−{fmtKr(data.rot_amount)}</Num></div>
                  </>
                )}
                <div className="flex items-center justify-between gap-3 bg-primary text-primary-foreground rounded-xl px-4 py-3.5 my-3">
                  <b className="text-[15px]">{payLabel}</b>
                  <span className="font-display text-2xl font-bold text-gold tabular whitespace-nowrap">{fmtKr(payable)}</span>
                </div>
                {hpPercent > 0 && (
                  <div className="flex flex-col gap-2">
                    {[
                      { n: 1, t: `Handpenning ${hpPercent} %`, s: `Faktureras vid beställning${rotActive ? ' · beräknad på summan före ROT' : ''}`, v: handpenning },
                      { n: 2, t: 'Slutfaktura', s: `Efter utfört arbete${rotActive ? ' · hela ROT-avdraget dras här' : ''}`, v: slutfaktura },
                    ].map((p) => (
                      <div key={p.n} className="flex items-start gap-3">
                        <span className="h-6 w-6 rounded-full bg-gold-soft text-gold-ink text-xs font-bold inline-flex items-center justify-center flex-none mt-0.5">{p.n}</span>
                        <div className="flex-1 min-w-0"><div className="text-sm font-bold">{p.t}</div><div className="text-[12.5px] text-muted-foreground">{p.s}</div></div>
                        <Num className="text-sm font-bold">{fmtKr(p.v)}</Num>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {rotActive && (
                <p className="text-[12.5px] text-muted-foreground mt-4">
                  {rotCapped && <>ROT-avdraget är begränsat till {fmtKr(data.rot_amount)} ({rotPersons} {rotPersons === 1 ? 'person' : 'personer'} × {fmtKr(Number(data.rot_cap_per_person ?? 50000))} per år{Number(data.rot_used || 0) > 0 ? `, minus ${fmtKr(data.rot_used)} redan utnyttjat` : ''}). {data.rot_percent} % av arbetskostnaden hade varit {fmtKr(rotUncapped)}. </>}
                  ROT-avdraget är preliminärt och förutsätter att du har avdragsutrymme hos Skatteverket. Endast arbetskostnad är ROT-berättigad.
                </p>
              )}
            </Card>

            {!isAccepted && (
              <Card>
                <SectionLabel>Så går det till</SectionLabel>
                <h2 className="font-display text-[22px] font-bold mt-1 mb-4">Tre steg från offert till färdigt jobb</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { t: 'Acceptera digitalt', s: 'Skriv ditt namn och signera här på sidan. Du får bekräftelse och avtalet på e-post direkt.' },
                    { t: 'Vi planerar tillsammans', s: `${seller || 'Vi'} ringer dig inom några dagar.${hpPercent > 0 ? ' Handpenningen faktureras och vi bokar start.' : ' Vi bokar start.'}` },
                    { t: 'Utförande och slutfaktura', s: `Arbetet utförs enligt offerten. Slutfakturan kommer efter avslutat jobb${rotActive ? ', med ROT-avdraget draget' : ''}.` },
                  ].map((s, i) => (
                    <div key={i} className="rounded-xl bg-background p-4">
                      <span className="h-[30px] w-[30px] rounded-full bg-primary text-primary-foreground text-[13px] font-bold inline-flex items-center justify-center mb-2.5">{i + 1}</span>
                      <div className="text-[15px] font-bold mb-1">{s.t}</div>
                      <div className="text-[13px] text-muted-foreground">{s.s}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  {[
                    { icon: Award, t: '3 års garanti på arbetet' },
                    { icon: ShieldCheck, t: 'Ansvarsförsäkrade' },
                    { icon: BadgeCheck, t: 'Godkänd för F-skatt' },
                    ...(rotActive ? [{ icon: Percent, t: 'ROT dras direkt på fakturan' }] : []),
                  ].map(({ icon: Icon, t }) => (
                    <span key={t} className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full bg-success-soft text-primary text-[13px] font-semibold"><Icon className="h-3.5 w-3.5" />{t}</span>
                  ))}
                </div>
              </Card>
            )}

            {data.terms_text && (
              <Card>
                <SectionLabel>Villkor</SectionLabel>
                <h2 className="font-display text-[22px] font-bold mt-1 mb-3">Allmänna villkor</h2>
                <Terms text={data.terms_text} />
              </Card>
            )}

            {isSent && (
              <Card id="signera" className="scroll-mt-4">
                <section ref={signRef}>
                  <SectionLabel>Signering · offert {data.offer_number || ''}</SectionLabel>
                  <h2 className="font-display text-[22px] font-bold mt-1 mb-1">Acceptera och signera</h2>
                  <p className="text-[13.5px] text-muted-foreground mb-4">{payLabel}: <b className="text-foreground">{fmtKr(payable)}</b>.{hpPercent > 0 && <> Handpenning {fmtKr(handpenning)} vid beställning.</>}</p>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="accept-name" className="text-[13px] font-semibold">Ditt namn</Label>
                      <Input id="accept-name" value={acceptName} onChange={(e) => setAcceptName(e.target.value)} placeholder="För- och efternamn" autoComplete="name" className="mt-1.5 h-12 text-base rounded-xl" />
                    </div>
                    <SignaturePad name={acceptName} onChange={setSignatureDataUrl} />
                    <div className="flex items-start gap-3">
                      <Checkbox id="accept-terms" checked={acceptedTerms} onCheckedChange={(v) => setAcceptedTerms(v === true)} className="mt-0.5 h-5 w-5 rounded-md" />
                      <Label htmlFor="accept-terms" className="text-sm font-normal leading-relaxed cursor-pointer">
                        Jag har läst och accepterar offerten <b>{data.offer_number || ''}</b> och de allmänna villkoren.
                      </Label>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                      <Button
                        type="button"
                        variant="gold"
                        size="xl"
                        onClick={handleAccept}
                        disabled={!acceptedTerms || !acceptName.trim() || !signatureDataUrl || submitting}
                        className="gap-2 w-full sm:w-auto"
                      >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {submitting ? 'Registrerar…' : 'Acceptera offerten'}
                      </Button>
                      <span className="text-[13.5px] text-muted-foreground">Vill du tacka nej? <button type="button" onClick={() => setDeclineOpen((o) => !o)} className="font-bold text-primary underline underline-offset-4">Lämna besked här</button></span>
                    </div>
                    <div className="flex items-start gap-2.5 text-[12.5px] text-muted-foreground">
                      <Lock className="h-4 w-4 text-sage flex-none mt-0.5" />
                      <span>Accepten registreras med tidpunkt och IP-adress och gäller som skriftlig överenskommelse. Du får bekräftelsen och det signerade avtalet (PDF) på e-post direkt efteråt.</span>
                    </div>
                  </div>

                  {declineOpen && (
                    <div className="mt-5 rounded-xl border border-dashed border-border-strong bg-background p-4 space-y-3 animate-fade-in">
                      <div className="text-sm font-bold">Tacka nej till offerten</div>
                      <p className="text-xs text-muted-foreground">Lämna gärna ett kort meddelande om varför, så vet vi hur vi kan bli bättre. Båda fälten är frivilliga.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="decline-name" className="text-xs">Namn (frivilligt)</Label>
                          <Input id="decline-name" value={declineName} onChange={(e) => setDeclineName(e.target.value)} className="mt-1" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="decline-reason" className="text-xs">Orsak (frivilligt)</Label>
                        <Textarea id="decline-reason" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={3} className="mt-1" />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={handleDecline} disabled={declining} className="gap-2">
                          {declining ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Skicka besked
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDeclineOpen(false)}>Avbryt</Button>
                      </div>
                    </div>
                  )}
                </section>
              </Card>
            )}
          </div>
        </div>

        <footer className="text-center text-xs text-muted-foreground pt-8">
          SmartKlimat N3prenad AB · Org.nr 559026-6630 · Morsstigen 3, 141 71 Segeltorp · Godkänd för F-skatt
        </footer>
      </main>

      {/* Fast knapp på telefon: syns tills signeringskortet är i bild */}
      {isSent && !signInView && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-card/95 backdrop-blur border-t border-border px-4 pt-3 safe-bottom shadow-[0_-8px_24px_rgba(21,33,27,.08)]">
          <div className="flex items-center gap-3 pb-3">
            <div className="min-w-0">
              <div className="font-display text-[19px] font-bold leading-none tabular">{fmtKr(payable)}</div>
              <div className="text-[11px] text-muted-foreground truncate">{rotActive ? 'efter prel. ROT-avdrag' : inclVat ? 'inkl. moms' : 'exkl. moms'}</div>
            </div>
            <Button variant="gold" size="lg" className="flex-1 gap-2" onClick={scrollToSign}>Acceptera och signera <ArrowDown className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
