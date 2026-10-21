import { SignJWT, importPKCS8 } from 'npm:jose@5.10.0';

export function serviceAccount() {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON saknas');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON innehåller ogiltig JSON'); }
  if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON saknar client_email eller private_key');
  return parsed as { client_email: string; private_key: string };
}

const tokenCache = new Map<string, { value: string; expires: number; email: string }>();

export async function googleToken(scope: string): Promise<string> {
  const account = serviceAccount();
  const cached = tokenCache.get(scope);
  if (cached && cached.email === account.client_email && Date.now() < cached.expires - 60_000) return cached.value;
  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(account.client_email)
    .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Google token [${response.status}]: ${await response.text()}`);
  const data = await response.json();
  if (!data.access_token) throw new Error('Google returnerade inget access token');
  tokenCache.set(scope, { value: data.access_token, expires: Date.now() + Number(data.expires_in || 3600) * 1000, email: account.client_email });
  return data.access_token;
}
