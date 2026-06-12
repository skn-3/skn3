import { supabase } from '@/integrations/supabase/client';

export type SignedBucket = 'case-images' | 'sheet-metal-sketches' | 'case-documents';

const SIGNED_TTL_SECONDS = 3600;

// In-memory cache to avoid re-signing the same path repeatedly within a session.
const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Extract the object path from a stored value, which may be either:
 *  - a plain path (e.g. "caseId/devId/file.jpg")  — new format
 *  - an old public URL (".../storage/v1/object/public/<bucket>/<path>")
 */
export function extractStoragePath(stored: string, bucket: SignedBucket): string {
  if (!stored) return stored;
  const marker = `/object/public/${bucket}/`;
  const idx = stored.indexOf(marker);
  if (idx !== -1) return stored.substring(idx + marker.length);
  // Also handle already-signed URLs being re-passed
  const signedMarker = `/object/sign/${bucket}/`;
  const sIdx = stored.indexOf(signedMarker);
  if (sIdx !== -1) {
    const rest = stored.substring(sIdx + signedMarker.length);
    return rest.split('?')[0];
  }
  return stored;
}

export async function getSignedImageUrl(
  stored: string,
  bucket: SignedBucket = 'case-images',
): Promise<string | null> {
  if (!stored) return null;
  const path = extractStoragePath(stored, bucket);
  const key = `${bucket}::${path}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error('createSignedUrl failed:', error);
    return null;
  }
  cache.set(key, { url: data.signedUrl, expiresAt: now + SIGNED_TTL_SECONDS * 1000 });
  return data.signedUrl;
}

export async function getSignedImageUrls(
  stored: string[],
  bucket: SignedBucket = 'case-images',
): Promise<(string | null)[]> {
  if (!stored?.length) return [];
  const paths = stored.map(s => extractStoragePath(s, bucket));
  const now = Date.now();

  // Use cache where possible; sign the rest in batch
  const out: (string | null)[] = new Array(paths.length).fill(null);
  const toSign: { idx: number; path: string }[] = [];
  paths.forEach((p, i) => {
    const cached = cache.get(`${bucket}::${p}`);
    if (cached && cached.expiresAt > now + 60_000) out[i] = cached.url;
    else toSign.push({ idx: i, path: p });
  });
  if (toSign.length) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(toSign.map(t => t.path), SIGNED_TTL_SECONDS);
    if (error) {
      console.error('createSignedUrls failed:', error);
    } else if (data) {
      data.forEach((d, j) => {
        const { idx, path } = toSign[j];
        if (d.signedUrl) {
          out[idx] = d.signedUrl;
          cache.set(`${bucket}::${path}`, { url: d.signedUrl, expiresAt: now + SIGNED_TTL_SECONDS * 1000 });
        }
      });
    }
  }
  return out;
}
