import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

const W = 420;
const H_DESKTOP = 140;
const H_TOUCH = 180;

// Signaturyta för kundens offertsida. "Skriv namnet" ritar namnet i handstilsfont, "Rita för hand" låter kunden signera med finger/mus.
// På pekskärm startar ytan i ritläge. Resultatet levereras som PNG-dataURL till det signerade avtalet.
export function SignaturePad({ name, onChange }: { name: string; onChange: (dataUrl: string | null) => void }) {
  const [isTouch] = useState(() => {
    try {
      return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  });
  const H = isTouch ? H_TOUCH : H_DESKTOP;
  const [mode, setMode] = useState<'skriv' | 'rita'>(isTouch ? 'rita' : 'skriv');
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
      className={`min-h-[44px] flex-1 px-3.5 rounded-lg text-[13px] font-semibold transition-colors ${mode === m ? 'bg-card text-primary shadow-card' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-semibold">Din signatur</label>
      <div role="radiogroup" aria-label="Signaturläge" className="flex gap-0.5 rounded-xl bg-background p-[3px] border border-border" style={{ maxWidth: W }}>
        {segBtn('skriv', 'Skriv namnet')}
        {segBtn('rita', 'Rita för hand')}
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
        {mode === 'rita' && (
          <button
            type="button"
            onClick={clearDraw}
            className="absolute right-2 top-2 inline-flex min-h-8 items-center gap-1 rounded-lg border border-border bg-card/90 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <Eraser className="h-3.5 w-3.5" /> Rensa
          </button>
        )}
        <span aria-hidden="true" className="pointer-events-none absolute left-4 right-4 bottom-6 h-px bg-border" />
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === 'skriv' ? 'Skapas av ditt namn. Vill du signera för hand, välj Rita för hand.' : 'Rita din signatur med fingret eller musen.'}
      </p>
    </div>
  );
}
