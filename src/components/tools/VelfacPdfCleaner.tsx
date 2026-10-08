import { useRef, useState } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FileText, Download, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

// Polyfill för äldre Safari/iOS (< 17.4) som saknar Promise.withResolvers — krävs av pdfjs
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function () {
    let resolve: any, reject: any;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
// Legacy-workern är byggd för äldre webbläsare (iOS Safari)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.js', import.meta.url).toString();

// ---------- Velfac / DOVISTA ----------
const VELFAC_FOOTER_HEIGHT_PT = 44; // DOVISTA-foten ligger i nedersta ~36pt; 44 täcker text + linje med marginal
const VILLKOR_PATTERN = /allmänna villkor|försäljnings- och leveransvillkor/;

// ---------- Lingbo Kulturfönster (CalWin-offert) ----------
// Alla mått i PDF-punkter med origo i nedre vänstra hörnet (A4 = 595 x 842).
const LINGBO = {
  footerHeight: 66,        // fotlinjen ligger på y≈62, texten under den
  page1HeaderFromY: 572,   // sida 1: allt ovanför täcks (logga, adresser, referensruta). Kolumnrubriken "RAD LITTERA..." på y≈559 behålls
  descColumnX: 240,        // beskrivningskolumnen börjar vid x≈249
  descColumnEndX: 400,
  rowTitleMinX: 50,        // radtitlar ("KUF (980x1380)", "KULÖR") står vid x≈56 i 9pt
  rowTitleMaxX: 70,
  rowTitleFontSize: 9,
  rowTop: 17,              // från radtitelns baslinje upp till radens överkant (strax under separatorlinjen ovanför)
  rowSepBelow: 23,         // från nästa radtitels baslinje upp t.o.m. separatorlinjen mellan raderna
  page1ShiftUp: 170,       // sida 1: innehållet flyttas upp så mycket när sidhuvudet ersatts av en kompakt rubrik
};
const LINGBO_REMOVE_ROW_TITLE = /^(KULÖR|PALL|FRAKT|EMB|TRANSPORT|EXP|FAKT)/i; // rader som inte är fönster/dörrar
const LINGBO_REMOVE_ROW_DESC = /(kostnad|tillägg|avgift)/i;                   // ...eller vars beskrivning bara är kostnadsposter
const LINGBO_BRAND = /lingbo/i;

type Format = 'velfac' | 'lingbo';

type TextItem = { str: string; x: number; y: number; w: number; h: number };

type Result = {
  fileName: string;
  format: Format;
  pagesIn: number;
  pagesOut: number;
  removed: { page: number; reason: string }[];
  notes: string[];
  blobUrl: string;
  villkorCheck: boolean;
};

async function readItems(page: any): Promise<TextItem[]> {
  const tc = await page.getTextContent();
  return (tc.items as any[])
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({
      str: it.str as string,
      x: it.transform[4] as number,
      y: it.transform[5] as number,
      w: it.width as number,
      h: (it.height as number) || Math.hypot(it.transform[0], it.transform[1]),
    }));
}

function detectFormat(firstPageText: string): Format {
  const t = firstPageText.toLowerCase();
  if (t.includes('lingbo kulturfönster') || t.includes('powered by: calwin')) return 'lingbo';
  return 'velfac';
}

type Rect = { x: number; y: number; w: number; h: number };
type Redraw = { x: number; y: number; size: number; text: string };
type Heading = { title: string; address: string | null; date: string | null };

/**
 * Lingbo: behåll fönsteruppställningen (ritning + specifikation per rad), ta bort allt annat.
 * Sidor tas inte bort; i stället täcks sidhuvud, sidfot, offertnummer, kostnadsrader,
 * varumärkesreferenser och leverantörens frågor med vitt.
 */
function planLingboPage(items: TextItem[], pageIndex: number, pageW: number, pageH: number) {
  const rects: Rect[] = [];
  const redraw: Redraw[] = [];
  const notes: string[] = [];
  const L = LINGBO;

  // Sida 1: hämta objektadress (Rekv.) och datum ur referensrutan innan den täcks, till en neutral rubrik
  let heading: Heading | null = null;
  if (pageIndex === 0) {
    const valueAfter = (label: string): string | null => {
      const lab = items.find((it) => it.str.trim().toLowerCase().startsWith(label));
      if (!lab) return null;
      const v = items
        .filter((it) => it !== lab && Math.abs(it.y - lab.y) < 3 && it.x > lab.x && it.x < lab.x + 260)
        .sort((a, b) => a.x - b.x)[0];
      return v ? v.str.trim() : null;
    };
    heading = { title: 'Fönsteruppställning', address: valueAfter('rekv'), date: valueAfter('datum') };
  }

  rects.push({ x: 0, y: 0, w: pageW, h: L.footerHeight });
  if (pageIndex === 0) rects.push({ x: 0, y: L.page1HeaderFromY, w: pageW, h: pageH - L.page1HeaderFromY });

  // "Offert 116271" överst på sidor 2+ (på sida 1 ligger det i sidhuvudet som redan täcks)
  for (const it of items) {
    if (/^offert\s+\d+/i.test(it.str) && it.y > pageH - 60) {
      rects.push({ x: it.x - 4, y: it.y - 4, w: pageW - it.x + 4, h: it.h + 8 });
    }
  }

  // Rader som inte är fönster/dörrar (kulörtillägg, pall, frakt ...)
  const titles = items
    .filter((it) =>
      it.x > L.rowTitleMinX && it.x < L.rowTitleMaxX &&
      Math.abs(it.h - L.rowTitleFontSize) < 0.6 &&
      it.y > L.footerHeight && it.y < pageH - 70)
    .sort((a, b) => b.y - a.y);
  const descs = items.filter((it) => it.x >= L.descColumnX && it.x < L.descColumnEndX);
  titles.forEach((t, i) => {
    const next = titles[i + 1];
    const bandTop = t.y + L.rowTop;
    const bandBottom = next ? next.y + L.rowSepBelow : L.footerHeight;
    const rowDescs = descs.filter((d) => d.y < bandTop && d.y > bandBottom);
    const byTitle = LINGBO_REMOVE_ROW_TITLE.test(t.str.trim());
    const byDesc = rowDescs.length > 0 && rowDescs.every((d) => LINGBO_REMOVE_ROW_DESC.test(d.str));
    if (byTitle || byDesc) {
      rects.push({ x: 0, y: bandBottom, w: pageW, h: bandTop - bandBottom });
      notes.push(`Rad "${t.str.trim()}" borttagen (ej fönster)`);
    }
  });

  // Varumärkesreferenser och leverantörens frågor i beskrivningskolumnen
  for (const it of items) {
    if (it.y < L.footerHeight || (pageIndex === 0 && it.y >= L.page1HeaderFromY)) continue; // täcks redan
    const inDesc = it.x >= L.descColumnX && it.x < L.descColumnEndX;
    if (inDesc && it.str.includes('?')) {
      rects.push({ x: it.x - 1, y: it.y - 2, w: it.w + 3, h: it.h + 3 });
      notes.push(`Fråga dold: "${it.str.trim()}"`);
      continue;
    }
    if (LINGBO_BRAND.test(it.str)) {
      rects.push({ x: it.x - 1, y: it.y - 2, w: it.w + 3, h: it.h + 3 });
      const rest = it.str.replace(/\s*lingbo\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
      if (rest) redraw.push({ x: it.x, y: it.y, size: it.h, text: rest }); // t.ex. "Lingbo Kulturfönster" → "Kulturfönster"
    }
  }
  return { rects, redraw, notes, heading };
}

export function VelfacPdfCleaner() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
    setResult(null);
  };

  const download = (bytes: Uint8Array, fileName: string) => {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.click();
    return blobUrl;
  };

  // ---------- Velfac / DOVISTA: ta bort försättsblad + villkorssidor, täck sidfoten ----------
  const processVelfac = async (file: File, buf: ArrayBuffer, doc: any | null): Promise<Result> => {
    const removed: { page: number; reason: string }[] = [{ page: 1, reason: 'Försättsblad' }];
    let keepIndices: number[] = [];
    let villkorCheck = true;
    let pageCount = 0;
    if (doc) {
      pageCount = doc.numPages;
      for (let i = 2; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const text = (await readItems(page)).map((it) => it.str).join(' ').toLowerCase();
        if (VILLKOR_PATTERN.test(text)) removed.push({ page: i, reason: 'Allmänna villkor' });
        else keepIndices.push(i - 1);
      }
    } else {
      // Textanalysen gick inte (t.ex. äldre enhet) — städa ändå, utan villkorsdetektering
      villkorCheck = false;
      const probe = await PDFDocument.load(buf, { ignoreEncryption: true });
      pageCount = probe.getPageCount();
      keepIndices = Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => i + 1);
    }
    if (keepIndices.length === 0) throw new Error('Inga sidor kvar efter städning — är detta rätt fil?');

    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, keepIndices);
    for (const p of pages) {
      out.addPage(p);
      const { width } = p.getSize();
      p.drawRectangle({ x: 0, y: 0, width, height: VELFAC_FOOTER_HEIGHT_PT, color: rgb(1, 1, 1) });
    }
    const bytes = await out.save();
    const blobUrl = download(bytes, file.name);
    return { fileName: file.name, format: 'velfac', pagesIn: pageCount, pagesOut: keepIndices.length, removed, notes: [], blobUrl, villkorCheck };
  };

  // ---------- Lingbo: behåll alla sidor, täck allt som inte är fönsteruppställningen ----------
  const processLingbo = async (file: File, buf: ArrayBuffer, doc: any): Promise<Result> => {
    const plans: ReturnType<typeof planLingboPage>[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      plans.push(planLingboPage(await readItems(page), i - 1, vp.width, vp.height));
    }
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const bold = await out.embedFont(StandardFonts.HelveticaBold);
    const pages = await out.copyPages(src, plans.map((_, i) => i));
    const notes: string[] = [];
    pages.forEach((p, i) => {
      out.addPage(p);
      const hd = plans[i].heading;
      // Sida 1: flytta upp innehållet så att tabellen hamnar direkt under rubriken. Täckrektanglar och omritad text
      // ligger i originalkoordinater och ritas därför före resetPosition().
      if (hd) p.translateContent(0, LINGBO.page1ShiftUp);
      for (const r of plans[i].rects) p.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgb(1, 1, 1) });
      for (const t of plans[i].redraw) p.drawText(t.text, { x: t.x, y: t.y, size: t.size, font, color: rgb(0, 0, 0) });
      if (hd) {
        p.resetPosition();
        const { height } = p.getSize();
        p.drawText(hd.title, { x: 37, y: height - 52, size: 17, font: bold, color: rgb(0, 0, 0) });
        const sub = [hd.address ? `Objekt: ${hd.address}` : null, hd.date ? `Datum: ${hd.date}` : null].filter((x): x is string => !!x);
        sub.forEach((line, k) => p.drawText(line, { x: 37, y: height - 70 - k * 14, size: 10, font, color: rgb(0.25, 0.25, 0.25) }));
      }
      plans[i].notes.forEach((n) => notes.push(`Sida ${i + 1}: ${n}`));
    });
    const bytes = await out.save();
    const blobUrl = download(bytes, file.name);
    return { fileName: file.name, format: 'lingbo', pagesIn: doc.numPages, pagesOut: doc.numPages, removed: [], notes, blobUrl, villkorCheck: true };
  };

  const process = async (file: File) => {
    setBusy(true);
    reset();
    try {
      const buf = await file.arrayBuffer();

      // Steg 1: läs texten (pdfjs) och avgör format. Faller analysen körs Velfac-städningen utan villkorsdetektering.
      let doc: any | null = null;
      let format: Format = 'velfac';
      try {
        doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        const firstText = (await readItems(await doc.getPage(1))).map((it) => it.str).join(' ');
        format = detectFormat(firstText);
      } catch (e) {
        console.warn('PDF-textanalys misslyckades — kör Velfac-städning utan villkorsdetektering', e);
        doc = null;
      }
      if (format === 'lingbo' && !doc) throw new Error('Kunde inte läsa PDF-filen');

      // Steg 2 + 3: bygg ny PDF (pdf-lib) och ladda ner med SAMMA filnamn
      const res = format === 'lingbo' ? await processLingbo(file, buf, doc) : await processVelfac(file, buf, doc);
      setResult(res);
      toast.success(res.format === 'lingbo' ? 'Lingbo-PDF städad och nedladdad' : 'Velfac-PDF städad och nedladdad');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte läsa PDF-filen');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4 mr-2" />
        <span className="sm:hidden">Städa PDF</span><span className="hidden sm:inline">Städa leverantörs-PDF</span>
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Städa leverantörs-PDF</DialogTitle>
            <DialogDescription>
              Känner själv igen formatet. Velfac: tar bort försättsbladet, eventuell villkorssida och DOVISTA-sidfoten.
              Lingbo: behåller fönsteruppställningen (ritning + specifikation) och döljer logga, adresser, offertnummer,
              kostnadsrader, Lingbo-referenser och leverantörens frågor, och sätter en neutral rubrik med objektadress på sida 1. Allt sker lokalt i din webbläsare — filen laddas aldrig upp.
            </DialogDescription>
          </DialogHeader>

          {!result && (
            <div
              className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-primary bg-primary/10' : 'hover:bg-muted/40'
              }`}
              onClick={() => !busy && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (busy) return;
                const f = Array.from(e.dataTransfer.files).find(
                  (x) => x.type === 'application/pdf' || x.name.toLowerCase().endsWith('.pdf')
                );
                if (f) process(f);
                else toast.error('Släpp en PDF-fil');
              }}
            >
              <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">
                {busy ? 'Städar...' : dragOver ? 'Släpp här' : 'Släpp PDF:en här — eller klicka för att bläddra'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Den städade versionen laddas ner automatiskt med samma filnamn</p>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) process(f); }}
              />
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 bg-muted/50">
                <p className="font-medium">{result.fileName}</p>
                <p className="text-sm text-muted-foreground">
                  {result.format === 'lingbo' ? 'Lingbo-format' : 'Velfac-format'} · {result.pagesIn} sidor in → {result.pagesOut} sidor ut · sidfot rensad på alla sidor
                </p>
                <ul className="mt-2 text-sm">
                  {result.removed.map((r) => (
                    <li key={`p${r.page}`} className="text-muted-foreground">
                      Borttagen sida {r.page}: {r.reason}
                    </li>
                  ))}
                  {result.notes.map((n, i) => (
                    <li key={`n${i}`} className="text-muted-foreground">{n}</li>
                  ))}
                </ul>
                {!result.villkorCheck && (
                  <div className="text-xs text-amber-700 dark:text-amber-300">OBS: villkorssidan kunde inte auto-detekteras på den här enheten — bläddra igenom resultatet innan du skickar det.</div>
                )}
                {result.format === 'lingbo' && (
                  <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">Lingbo-formatet är nytt i verktyget — bläddra igenom resultatet innan du skickar det.</div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { const a = document.createElement('a'); a.href = result.blobUrl; a.download = result.fileName; a.click(); }}>
                  <Download className="h-4 w-4 mr-2" />
                  Ladda ner igen
                </Button>
                <Button variant="secondary" size="sm" onClick={() => reset()}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Städa en till
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
