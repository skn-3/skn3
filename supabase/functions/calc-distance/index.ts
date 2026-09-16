import { requireStaff } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type GeoHit = { lat: string; lon: string; label: string; precision: 'exakt' | 'gata' };

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
  // Varianter: full adress -> utan postnummer -> utan husnummer (gatunivå)
  const noPostal = cleaned.replace(/,?\s*\d{3}\s?\d{2}\s+/g, ', ');
  const noHouseNo = noPostal.replace(/\s+\d+[a-zA-Z]?\s*(,|$)/, '$1');
  const variants: { q: string; precision: 'exakt' | 'gata' }[] = [
    { q: cleaned, precision: 'exakt' },
    { q: noPostal, precision: 'exakt' },
    { q: noHouseNo, precision: 'gata' },
  ].filter((v, i, a) => v.q.trim() && a.findIndex((x) => x.q === v.q) === i);

  for (let i = 0; i < variants.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100)); // Nominatims taktgräns
    const hit = await geocodeOnce(variants[i].q);
    if (hit) return { ...hit, precision: variants[i].precision };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const auth = await requireStaff(req, corsHeaders);
  if (auth.response) return auth.response;
  try {
    const { from, to } = await req.json();
    if (!from?.trim() || !to?.trim()) throw new Error('Både från- och till-adress krävs');

    const a = await geocode(from.trim());
    if (!a) throw new Error(`Hittade inte adressen: ${from}`);
    // Nominatim vill ha max 1 anrop/sekund
    await new Promise((r) => setTimeout(r, 1100));
    const b = await geocode(to.trim());
    if (!b) throw new Error(`Hittade inte adressen: ${to}`);

    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const routeRes = await fetch(routeUrl);
    if (!routeRes.ok) throw new Error('Ruttjänsten svarade inte');
    const route = await routeRes.json();
    const meters = route?.routes?.[0]?.distance;
    if (typeof meters !== 'number') throw new Error('Ingen rutt hittades mellan adresserna');

    return new Response(JSON.stringify({
      ok: true,
      km_one_way: Math.round(meters / 1000),
      from_resolved: a.label,
      to_resolved: b.label,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Kunde inte beräkna avståndet' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
