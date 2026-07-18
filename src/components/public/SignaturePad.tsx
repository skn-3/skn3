import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

const W = 420;
const H = 140;

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
    ctx.strokeStyle = '#1a1a1a';
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
      } catch {}
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
        ctx.fillStyle = '#1a1a1a';
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
    const sx = W / r.width;
    const sy = H / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
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
    if (drawing.current) {
      drawing.current = false;
      emit();
    }
  };

  const clearDraw = () => {
    hasInk.current = false;
    setup();
    emit();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === 'skriv' ? 'default' : 'outline'}
          onClick={() => setMode('skriv')}
        >
          Skriv signatur
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'rita' ? 'default' : 'outline'}
          onClick={() => setMode('rita')}
        >
          Rita signatur
        </Button>
        {mode === 'rita' && (
          <Button type="button" size="sm" variant="ghost" onClick={clearDraw}>
            Rensa
          </Button>
        )}
      </div>
      <div className="rounded-md border bg-white overflow-hidden" style={{ maxWidth: W }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: H, touchAction: 'none', cursor: mode === 'rita' ? 'crosshair' : 'default' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === 'skriv' ? 'Signaturen skapas automatiskt av ditt namn.' : 'Rita din signatur med fingret eller musen.'}
      </p>
    </div>
  );
}
