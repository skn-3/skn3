// Delad textlogik för offerter: beskrivning → rubriker/punkter/stycken, villkor → punkter,
// enhet i klartext och svenska datumformat. Används av både PDF:en (offerPdf.ts) och kundsidan (PublicOffer.tsx)
// så att de alltid ser likadana ut.

export type DescriptionBlock =
  | { type: 'heading'; text: string }
  | { type: 'para'; text: string }
  | { type: 'list'; items: string[] };

const nfc = (s: unknown) => (s ?? '').toString().normalize('NFC');
const isBullet = (l: string) => /^\s*[–\-•]\s+/.test(l);

/** Beskrivningen skrivs som ren text med rubrikrader och "– "-punkter. */
export function parseDescription(text: string | null | undefined): DescriptionBlock[] {
  const lines = nfc(text).replace(/\r/g, '').split('\n');
  const blocks: DescriptionBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) { items.push(lines[i].replace(/^\s*[–\-•]\s+/, '').trim()); i++; }
      blocks.push({ type: 'list', items });
      continue;
    }
    const next = lines.slice(i + 1).find((l) => l.trim() !== '');
    if (line.trim().length <= 60 && next && isBullet(next) && !/[.:!?]$/.test(line.trim())) {
      blocks.push({ type: 'heading', text: line.trim() });
      i++;
      continue;
    }
    blocks.push({ type: 'para', text: line.trim() });
    i++;
  }
  return blocks;
}

export interface TermBlock { heading?: string; lead?: string; body: string }

/** Villkorstexten: stycken åtskilda av tomrad, "N. Rubrik" på första raden. Titelraden "Allmänna villkor …" tas bort. */
export function parseTerms(text: string | null | undefined): TermBlock[] {
  const paras = nfc(text).replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length && /^Allmänna villkor/i.test(paras[0])) paras.shift();
  return paras.map((p) => {
    const [first, ...rest] = p.split('\n');
    if (/^\d+\.\s/.test(first) && rest.length) return { heading: first.trim(), body: rest.join(' ').trim() };
    const m = first.match(/^([A-ZÅÄÖ][^.]{2,40}\.)\s(.*)$/);
    if (m && !rest.length) return { lead: m[1], body: m[2] };
    return { body: p.replace(/\n/g, ' ') };
  });
}

/** Fördelar villkorspunkterna på två spalter efter uppskattad höjd (PDF). */
export function balanceTerms(blocks: TermBlock[]): [TermBlock[], TermBlock[]] {
  const est = (b: TermBlock) => Math.ceil((b.body.length + (b.lead ? b.lead.length : 0)) / 62) * 9.2 + (b.heading ? 11 : 0) + 5;
  const total = blocks.reduce((s, b) => s + est(b), 0);
  const left: TermBlock[] = []; const right: TermBlock[] = []; let acc = 0;
  for (const b of blocks) { (acc + est(b) <= total * 0.5 ? left : right).push(b); acc += est(b); }
  return [left, right];
}

/** "iPhone/iPad · Safari" i stället för hela user agent-strängen. */
export function deviceLabel(ua: string | null | undefined): string {
  const s = nfc(ua);
  if (!s) return '—';
  const os = /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : 'Okänd enhet';
  const br = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) && !/Chromium/.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'Webbläsare';
  return `${os} · ${br}`;
}

/** 13 oktober 2026 */
export function fmtDateLong(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** 2026-10-14 18:08:31 (svensk tid) */
export function fmtDateTimeSv(d: string | Date | null | undefined, seconds = true): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
}

/** Antal hela dagar kvar t.o.m. valid_until (negativt = utgången). */
export function daysLeft(validUntil: string | null | undefined): number | null {
  if (!validUntil) return null;
  const end = new Date(validUntil);
  if (isNaN(end.getTime())) return null;
  end.setHours(23, 59, 59, 999);
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}