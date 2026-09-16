import { requireStaff } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function geocode(q: string): Promise<{ lat: string; lon: string; label: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=se&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'N3prenad-CaseFlow/1.0 (n3prenad@smartklimat.org)' } });
  if (!res.ok) return null;
  const arr = await res.json();
  if (!arr?.[0]) return null;
  return { lat: arr[0].lat, lon: arr[0].lon, label: arr[0].display_name?.split(',').slice(0, 2).join(',') ?? q };
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
