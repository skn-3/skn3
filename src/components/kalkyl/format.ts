// Formatering för kalkylvyn (inga beräkningar).
export const kr = (n: number | null | undefined) =>
  n == null ? '–' : `${Number(n).toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`;
export const kr2 = (n: number | null | undefined) =>
  n == null ? '–' : `${Number(n).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
export const dec = (n: number | null | undefined, max = 1) =>
  n == null ? '' : Number(n).toLocaleString('sv-SE', { maximumFractionDigits: max });
export const m = (n: number) => `${dec(n, 2)} m`;
export const timeLabel = (d: Date | string) =>
  new Date(d).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
