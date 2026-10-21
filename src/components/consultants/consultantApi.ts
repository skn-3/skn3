// Delade hjälpfunktioner för konsultlönernas admin-UI.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

async function invoke<T>(fn: 'consultant-drive' | 'consultant-payout', body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let details = error.message;
    if (error instanceof FunctionsHttpError) {
      const text = await error.context.text();
      try { details = JSON.parse(text).error || text; } catch { details = text; }
    }
    throw new Error(details);
  }
  if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>) && (data as Record<string, unknown>).error) {
    throw new Error(String((data as Record<string, unknown>).error));
  }
  return data as T;
}

export const invokeConsultantDrive = <T>(body: Record<string, unknown>) => invoke<T>('consultant-drive', body);
export const invokeConsultantPayout = <T>(body: Record<string, unknown>) => invoke<T>('consultant-payout', body);

export function blobToBase64(blob: Blob): Promise<string> {
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

export const fmtKr = (n: number | null | undefined): string =>
  `${(Number(n) || 0).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`;

export { DOC_TYPE_LABELS } from '@/lib/consultantPay';
