import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileSvg } from '@/components/sheet-metal/ProfileSvg';

type SketchProps = Parameters<typeof ProfileSvg>[0];

/** Rasterize the very same SVG used in the form, at print-friendly resolution. */
export async function sheetMetalSketchImage(props: SketchProps): Promise<string> {
  const markup = renderToStaticMarkup(createElement(ProfileSvg, props));
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Kunde inte skapa skissbilden'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1440;
    canvas.height = 990;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Kunde inte skapa skissbilden');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}