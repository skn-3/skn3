// Spärr mot riktiga utskick från ett utkast. Utkastets lokala backend kör funktionerna med
// SUPABASE_URL=http://127.0.0.1:8001; produktionen kör med https://<ref>.supabase.co.
// Standard är att skicka: bara adresser som otvetydigt är lokala ger true.
// Ren modul (ingen Deno-import) så att den kan testas med vitest.

const LOCAL_NAMES = new Set(['localhost', 'kong', 'host.docker.internal', '0.0.0.0', '::1', '[::1]']);

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Sann bara när adressen pekar på en lokal utkastbackend. Ogiltig eller saknad adress ger false. */
export function isLocalBackendUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;
  if (host.endsWith('.supabase.co') || host.endsWith('.supabase.in')) return false;
  return LOCAL_NAMES.has(host) || host.endsWith('.localhost') || isPrivateIpv4(host);
}

/** Läser SUPABASE_URL i edge-miljön. */
export function isLocalBackend(): boolean {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  return isLocalBackendUrl(env?.get?.('SUPABASE_URL'));
}

export const LOCAL_BACKEND_SKIP = 'local_backend' as const;
