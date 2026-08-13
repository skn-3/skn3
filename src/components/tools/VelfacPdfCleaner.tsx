import { useRef, useState } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FileText, Sparkles, Download, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const FOOTER_HEIGHT_PT = 44; // DOVISTA-foten ligger i nedersta ~36pt; 44 täcker text + linje med marginal
const VILLKOR_PATTERN = /allmänna villkor|försäljnings- och leveransvillkor/;

type Result = {
  fileName: string;
  pagesIn: number;
  pagesOut: number;
  removed: { page: number; reason: string }[];
  blobUrl: string;
};

export function VelfacPdfCleaner() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
    setResult(null);
  };

  const process = async (file: File) => {
    setBusy(true);
    reset();
    try {
      const buf = await file.arrayBuffer();

      // Steg 1: textanalys per sida (pdfjs) — hitta sidor som ska bort
      const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      const removed: { page: number; reason: string }[] = [{ page: 1, reason: 'Försättsblad' }];
      const keepIndices: number[] = [];
      for (let i = 2; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const text = tc.items.map((it: any) => it.str || '').join(' ').toLowerCase();
        if (VILLKOR_PATTERN.test(text)) {
          removed.push({ page: i, reason: 'Allmänna villkor' });
        } else {
          keepIndices.push(i - 1); // 0-indexerat för pdf-lib
        }
      }
      if (keepIndices.length === 0) throw new Error('Inga sidor kvar efter städning — är detta rätt fil?');

      // Steg 2: bygg ny PDF (pdf-lib) — kopiera sidor och täck sidfoten
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, keepIndices);
      for (const p of pages) {
        out.addPage(p);
        const { width } = p.getSize();
        p.drawRectangle({ x: 0, y: 0, width, height: FOOTER_HEIGHT_PT, color: rgb(1, 1, 1) });
      }
      const bytes = await out.save();

      // Steg 3: ladda ner med SAMMA filnamn
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.name;
      a.click();

      setResult({ fileName: file.name, pagesIn: doc.numPages, pagesOut: keepIndices.length, removed, blobUrl });
      toast.success('PDF städad och nedladdad');
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
        Städa Velfac-PDF
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Städa Velfac-PDF</DialogTitle>
            <DialogDescription>
              Tar bort försättsbladet, eventuell villkorssida och DOVISTA-sidfoten på alla sidor. Allt sker lokalt i din webbläsare — filen laddas aldrig upp.
            </DialogDescription>
          </DialogHeader>

          {!result && (
            <div className="space-y-4">
              <Button onClick={() => !busy && inputRef.current?.click()} disabled={busy}>
                <Sparkles className="h-4 w-4 mr-2" />
                {busy ? 'Städar...' : 'Klicka för att välja den råa PDF:en'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Den städade versionen laddas ner automatiskt med samma filnamn
              </p>
              <input
                type="file"
                accept="application/pdf"
                ref={inputRef}
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
                  {result.pagesIn} sidor in → {result.pagesOut} sidor ut · sidfot rensad på alla sidor
                </p>
                <ul className="mt-2 text-sm">
                  {result.removed.map((r) => (
                    <li key={r.page} className="text-muted-foreground">
                      Borttagen sida {r.page}: {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2">
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
