import { requireStaff } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type GeoHit = { lat: string; lon: string; label: string; precision: 'exakt' | 'gata' | 'omrade' };

async function geocodePhoton(q: string): Promise<{ lat: string; lon: string; label: string } | null> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=default&bbox=10.5,55.0,24.5,69.5&lat=59.33&lon=18.06`;
  const res = await fetch(url, { headers: { 'User-Agent': 'N3prenad-CaseFlow/1.0 (n3prenad@smartklimat.org)' } });
  if (!res.ok) return null;
  const data = await res.json();
  const f = data?.features?.[0];
  const coords = f?.geometry?.coordinates;
  if (!coords || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') return null;
  const p = f.properties ?? {};
  const place = p.city ?? p.town ?? p.village ?? p.municipality ?? p.county;
  const parts = [p.name ?? [p.street, p.housenumber].filter(Boolean).join(' '), place].filter(Boolean);
  return { lon: String(coords[0]), lat: String(coords[1]), label: parts.length ? parts.join(', ') : q };
}

async function geocodeOnce(q: string): Promise<{ lat: string; lon: string; label: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=se&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'N3prenad-CaseFlow/1.0 (n3prenad@smartklimat.org)' } });
  if (!res.ok) return null;
  const arr = await res.json();
  if (!arr?.[0]) return null;
  return { lat: arr[0].lat, lon: arr[0].lon, label: arr[0].display_name?.split(',').slice(0, 2).join(',') ?? q };
}

async function geocode(raw: string): Promise<GeoHit | null> {
  const cleaned = raw.trim().replace(/\s+/g, ' ').replace(/,?\s*lgh\s*\d+/i, '');
  // Varianter: full adress -> utan postnummer -> utan husnummer (gatunivå) -> första ord + ort (områdesnivå)
  const noPostal = cleaned.replace(/,?\s*\d{3}\s?\d{2}\s+/g, ', ');
  const noHouseNo = noPostal.replace(/\s+\d+[a-zA-Z]?\s*(,|$)/, '$1');
  const firstWord = noHouseNo.split(',')[0].trim().split(/\s+/)[0] ?? '';
  const city = cleaned.split(',').slice(-1)[0]?.replace(/\d{3}\s?\d{2}/, '').trim() ?? '';
  const area = [firstWord, city].filter(Boolean).join(', ');
  const variants: { q: string; precision: GeoHit['precision'] }[] = [
    { q: cleaned, precision: 'exakt' },
    { q: noPostal, precision: 'exakt' },
    { q: noHouseNo, precision: 'gata' },
    { q: area, precision: 'omrade' },
  ].filter((v, i, a) => v.q.trim() && a.findIndex((x) => x.q === v.q) === i);

  for (const v of variants) {
    // Primärt: Photon (fuzzy, ingen paus krävs)
    const photon = await geocodePhoton(v.q);
    if (photon) return { ...photon, precision: v.precision };
    // Backup: Nominatim med taktgräns
    await new Promise((r) => setTimeout(r, 1100));
    const nom = await geocodeOnce(v.q);
    if (nom) return { ...nom, precision: v.precision };
  }
  const tested = variants.map((v) => `"${v.q}"`).join(', ');
  throw new Error(`Hittade inte adressen "${raw.trim()}" — testade: ${tested}`);
}

const precisionSuffix = (p: GeoHit['precision']) => p === 'gata' ? ' (gatunivå)' : p === 'omrade' ? ' (områdesnivå)' : '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const auth = await requireStaff(req, corsHeaders);
  if (auth.response) return auth.response;
  try {
    const { from, to } = await req.json();
    if (!from?.trim() || !to?.trim()) throw new Error('Både från- och till-adress krävs');

    const a = await geocode(from.trim());
    const b = await geocode(to.trim());

    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const routeRes = await fetch(routeUrl);
    if (!routeRes.ok) throw new Error('Ruttjänsten svarade inte');
    const route = await routeRes.json();
    const meters = route?.routes?.[0]?.distance;
    if (typeof meters !== 'number') throw new Error('Ingen rutt hittades mellan adresserna');

    const kmOneWay = Math.round(meters / 1000);
    return new Response(JSON.stringify({
      ok: true,
      km_one_way: kmOneWay,
      suspicious: kmOneWay > 150 ? true : undefined,
      from_resolved: a.label + precisionSuffix(a.precision),
      to_resolved: b.label + precisionSuffix(b.precision),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Kunde inte beräkna avståndet' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
