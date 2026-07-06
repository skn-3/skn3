import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Circle, Ruler, Truck, Hammer, PartyPopper, TreePine, Phone, Mail } from 'lucide-react';

const ORDER = ['ny','vantar_km','km_bokad','km_klar','vantar_godkannande','godkand','i_produktion','leverans_klar','montage_bokat','montage_pagar','montage_klart','fakturerad'];

function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
}

export default function CustomerStatus() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer-status', token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('public-case-status', { body: { token } });
      if (error) throw error;
      return data as { case: any; climate: { tree_count: number; verification_id: string } | null };
    },
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Hämtar din status...</div>;
  }
  if (isError || !data?.case) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-2">Sidan hittades inte</h1>
          <p className="text-muted-foreground">Länken verkar vara felaktig. Kontakta oss om du behöver en ny länk.</p>
        </div>
      </div>
    );
  }

  const c = data.case;
  const idx = ORDER.indexOf(c.status);
  const reached = (s: string) => idx >= ORDER.indexOf(s);

  const leveransLabel = c.delivery_date
    ? `Leverans ${fmtDate(c.delivery_date)}`
    : c.delivery_week
      ? `Leverans vecka ${c.delivery_week}${c.delivery_year ? `, ${c.delivery_year}` : ''}`
      : null;

  const steps = [
    {
      icon: Ruler,
      title: 'Kontrollmätning',
      done: reached('km_klar'),
      active: c.status === 'vantar_km' || c.status === 'km_bokad',
      detail: reached('km_klar')
        ? 'Utförd'
        : c.status === 'km_bokad' && c.km_date
          ? `Bokad ${fmtDate(c.km_date)}${c.km_time ? ` kl ${String(c.km_time).slice(0, 5)}` : ''}`
          : 'Planeras — vi hör av oss',
    },
    {
      icon: Truck,
      title: 'Tillverkning & leverans',
      done: reached('leverans_klar'),
      active: c.status === 'godkand' || c.status === 'i_produktion',
      detail: reached('leverans_klar')
        ? 'Levererad'
        : reached('godkand')
          ? (leveransLabel ? `Fönstren tillverkas. ${leveransLabel}.` : 'Fönstren tillverkas')
          : 'Startar efter godkänd kontrollmätning',
    },
    {
      icon: Hammer,
      title: 'Montage',
      done: reached('montage_klart'),
      active: c.status === 'montage_bokat' || c.status === 'montage_pagar',
      detail: reached('montage_klart')
        ? 'Utfört'
        : c.status === 'montage_pagar'
          ? 'Pågår'
          : c.montage_date
            ? `Bokat ${fmtDate(c.montage_date)}${c.montage_time ? ` kl ${String(c.montage_time).slice(0, 5)}` : ''}`
            : 'Bokas när fönstren levererats',
    },
    {
      icon: PartyPopper,
      title: 'Klart',
      done: reached('montage_klart'),
      active: false,
      detail: reached('montage_klart') ? 'Tack för att du valde oss!' : '',
    },
  ];

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">N3prenad</div>
          <h1 className="text-3xl font-semibold mt-1">Ditt fönsterbyte</h1>
          <p className="text-muted-foreground mt-1">{c.address}</p>
          {c.order_number && <p className="text-xs text-muted-foreground mt-1">Ordernummer: {c.order_number}</p>}
        </div>

        <div className="bg-card rounded-2xl border p-6 space-y-1">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${s.done ? 'bg-green-100 text-green-700' : s.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {s.done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  {i < steps.length - 1 && <div className={`w-px flex-1 my-1 ${s.done ? 'bg-green-300' : 'bg-border'}`} />}
                </div>
                <div className="flex-1 pb-6 pt-1">
                  <div className={`font-medium ${s.active ? 'text-primary' : ''}`}>{s.title}</div>
                  {s.detail && <div className="text-sm text-muted-foreground mt-0.5">{s.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {data.climate && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-green-900 font-medium">
              <TreePine className="w-5 h-5" /> Ditt fönsterbyte är klimatkompenserat
            </div>
            <p className="text-sm text-green-900/80 mt-1">
              {data.climate.tree_count} träd har planterats för det här projektet via SmartKlimat.
            </p>
            <a
              href={`https://smartklimat.org/v/${data.climate.verification_id}`}
              target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-green-900 underline underline-offset-2"
            >
              Se ditt värdebevis
            </a>
          </div>
        )}

        <div className="text-center text-sm text-muted-foreground space-y-1 pt-2">
          <div className="font-medium text-foreground">Frågor?</div>
          <div className="flex items-center justify-center gap-2"><Phone className="w-4 h-4" /> 070-719 72 35</div>
          <div className="flex items-center justify-center gap-2"><Mail className="w-4 h-4" /> n3prenad@smartklimat.org</div>
          <div className="text-xs pt-2">SmartKlimat N3prenad AB · Utförs på uppdrag av Mockfjärds Fönster</div>
        </div>
      </div>
    </div>
  );
}
