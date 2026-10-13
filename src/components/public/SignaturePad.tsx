import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

const W = 420;
const H = 140;

// Signaturyta för kundens offertsida. "Skriv" ritar namnet i handstilsfont, "Rita" låter kunden signera med finger/mus.
// Resultatet levereras som PNG-dataURL till det signerade avtalet.
export function SignaturePad({ name, onChange }: { name: string; onChange: (dataUrl: string | null) => void }) {
  const [mode, setMode] = useState<'skriv' | 'rita'>('skriv');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const setup = () => {
    const c = canvasRef.current;
    if (!c) return null;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#15211B';
    return ctx;
  };

  const emit = () => {
    const c = canvasRef.current;
    if (!c) return;
    onChange(hasInk.current ? c.toDataURL('image/png') : null);
  };

  // Skriv-läge: rendera namnet i handstilsfont
  useEffect(() => {
    if (mode !== 'skriv') return;
    let cancelled = false;
    (async () => {
      try {
        await (document as any).fonts?.load('64px Caveat');
        await (document as any).fonts?.ready;
      } catch { /* fonten saknas: fallback till cursive */ }
      if (cancelled) return;
      const ctx = setup();
      if (!ctx) return;
      const text = name.trim();
      hasInk.current = !!text;
      if (text) {
        let size = 64;
        ctx.font = `600 ${size}px Caveat, cursive`;
        while (size > 26 && ctx.measureText(text).width > W - 32) {
          size -= 4;
          ctx.font = `600 ${size}px Caveat, cursive`;
        }
        ctx.fillStyle = '#15211B';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 16, H / 2);
      }
      emit();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, name]);

  // Rita-läge: börja med tom yta
  useEffect(() => {
    if (mode === 'rita') {
      hasInk.current = false;
      setup();
      emit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  };
  const down = (e: React.PointerEvent) => {
    if (mode !== 'rita') return;
    drawing.current = true;
    hasInk.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || mode !== 'rita') return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const up = () => {
    if (drawing.current) { drawing.current = false; emit(); }
  };
  const clearDraw = () => { hasInk.current = false; setup(); emit(); };

  const segBtn = (m: 'skriv' | 'rita', label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === m}
      onClick={() => setMode(m)}
      className={`min-h-9 px-3.5 rounded-lg text-[13px] font-semibold transition-colors ${mode === m ? 'bg-card text-primary shadow-card' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[13px] font-semibold">Din signatur</label>
        <div className="flex items-center gap-2">
          {mode === 'rita' && (
            <button type="button" onClick={clearDraw} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <Eraser className="h-3.5 w-3.5" /> Rensa
            </button>
          )}
          <div role="radiogroup" aria-label="Signaturläge" className="inline-flex gap-0.5 rounded-xl bg-background p-[3px] border border-border">
            {segBtn('skriv', 'Skriv')}
            {segBtn('rita', 'Rita')}
          </div>
        </div>
      </div>
      <div className="relative rounded-xl border border-dashed border-border-strong bg-white overflow-hidden" style={{ maxWidth: W }}>
        <canvas
          ref={canvasRef}
          aria-label="Signatur"
          style={{ width: '100%', height: H, touchAction: 'none', cursor: mode === 'rita' ? 'crosshair' : 'default', display: 'block' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
        <span aria-hidden="true" className="pointer-events-none absolute left-4 right-4 bottom-6 h-px bg-border" />
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === 'skriv' ? 'Skapas av ditt namn. Välj Rita för att signera för hand.' : 'Rita din signatur med fingret eller musen.'}
      </p>
    </div>
  );
}
