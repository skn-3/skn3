// Anrop till kalkyl-ai och förberedelse av bilagor. Foton och PDF:er skickas direkt och sparas aldrig.
import { supabase } from '@/integrations/supabase/client';
import { aiErrorText, scaledSize, KALKYL_AI_LIMITS } from '@/lib/kalkyl';

export type AiCallResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export async function callKalkylAi<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<AiCallResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('kalkyl-ai', { body });
    if (error) {
      let b: { error_code?: string; message?: string } | null = null;
      try { b = await (error as { context?: { json?: () => Promise<typeof b> } }).context?.json?.() ?? null; } catch { /* inget svar */ }
      return { ok: false, code: b?.error_code ?? 'gateway', message: aiErrorText(b?.error_code, b?.message) };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, code: 'gateway', message: aiErrorText('gateway') };
  }
}

/** Skalar ner ett foto till högst 1 600 px och JPEG. Ger en data-URL. */
export async function photoToJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Fotot kunde inte läsas.'));
      el.src = url;
    });
    const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, KALKYL_AI_LIMITS.photoPx);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Fotot kunde inte läsas.');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PDF som base64 (utan data-prefix). */
export function pdfToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('UE-offerten kunde inte läsas.'));
    reader.readAsDataURL(file);
  });
}
