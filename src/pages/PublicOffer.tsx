import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  total_ex_vat: number;
  total_vat: number;
  total_incl_vat: number;
  rot_base: number;
  rot_amount: number;
  total_after_rot: number;
  terms_text: string | null;
  status: string;
  accepted_at: string | null;
  signed_pdf_url: string | null;
};

const fmtKr = (n: number | null | undefined) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(Number(n || 0));

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('sv-SE') : '—');

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  sent: { text: 'Skickad', cls: 'bg-blue-100 text-blue-800' },
  accepted: { text: 'Accepterad', cls: 'bg-green-100 text-green-800' },
};

export default function PublicOffer() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicOfferData | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

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
          setData(res as PublicOfferData);
        }
      } catch {
        if (!cancelled) setError('Offerten kunde inte hittas eller har gått ut');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

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

          {data.signed_pdf_url && (
            <div className="mt-4">
              <Button asChild className="gap-2 bg-[#22C55E] hover:bg-[#16A34A]">
                <a href={data.signed_pdf_url} target="_blank" rel="noopener noreferrer">
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
                  <th className="text-right px-4 py-2">Summa</th>
                </tr>
              </thead>
              <tbody>
                {(data.line_items || []).map((it, idx) => (
                  <tr key={it.id || idx} className="border-t">
                    <td className="px-4 py-2">{it.description}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="px-4 py-2">{it.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtKr(it.unit_price)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtKr(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Totals */}
        <section className="bg-card rounded-xl border shadow-sm p-5 space-y-1 text-sm">
          <div className="flex justify-between"><span>Summa ex moms</span><span className="tabular-nums">{fmtKr(data.total_ex_vat)}</span></div>
          {data.vat_mode === 'omvand' ? (
            <div className="flex justify-between text-muted-foreground"><span>Moms</span><span>Omvänd betalningsskyldighet</span></div>
          ) : (
            <div className="flex justify-between"><span>Moms 25%</span><span className="tabular-nums">{fmtKr(data.total_vat)}</span></div>
          )}
          <div className="flex justify-between font-semibold pt-1"><span>Summa inkl moms</span><span className="tabular-nums">{fmtKr(data.total_incl_vat)}</span></div>
          {data.rot_enabled && data.vat_mode === 'vanlig' && (
            <>
              <div className="flex justify-between text-muted-foreground pt-2 border-t mt-2"><span>Rotberättigad arbetskostnad</span><span className="tabular-nums">{fmtKr(data.rot_base)}</span></div>
              <div className="flex justify-between text-[#22C55E]"><span>Preliminärt ROT-avdrag ({data.rot_percent}%)</span><span className="tabular-nums">−{fmtKr(data.rot_amount)}</span></div>
              <div className="flex justify-between font-bold text-base text-[#16A34A] pt-1"><span>Att betala efter ROT</span><span className="tabular-nums">{fmtKr(data.total_after_rot)}</span></div>
            </>
          )}
        </section>

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

        {/* Accept section placeholder for step 3 */}
        {/* Reserved space for accept/sign — added in step 3 */}

        <footer className="text-center text-xs text-muted-foreground pt-4">
          SmartKlimat N3prenad AB · Org.nr 559026-6630
        </footer>
      </main>
    </div>
  );
}
