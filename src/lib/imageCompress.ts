/**
 * Compress an image File to JPEG with max width (default 1200px).
 * Returns a base64 data URL.
 */
export async function compressImageToDataUrl(file: File, maxWidth = 1200, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function compressImageToBlob(file: File, maxWidth = 1600, quality = 0.82): Promise<{blob: Blob; width: number; height: number}> {
  const dataUrl = await compressImageToDataUrl(file, maxWidth, quality);
  const blob = await (await fetch(dataUrl)).blob();
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Bilden kunde inte läsas')); img.src = dataUrl;
  });
  return { blob, width: image.naturalWidth, height: image.naturalHeight };
}
