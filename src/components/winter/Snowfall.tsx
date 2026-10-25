import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/winterMode';

interface Flake { x: number; y: number; r: number; vy: number; amp: number; phase: number; freq: number; a: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeFlake(w: number, h: number, top = false): Flake {
  const t = Math.random(); // storlek 0..1 driver parallax
  return {
    x: Math.random() * w,
    y: top ? rand(-10, 0) : Math.random() * h,
    r: 0.8 + t * 1.6,
    vy: 18 + t * 18 + Math.random() * 6,
    amp: rand(0.3, 0.9) * 20,
    phase: Math.random() * Math.PI * 2,
    freq: rand(0.3, 0.8),
    a: 0.25 + t * 0.3 + Math.random() * 0.1,
  };
}

export function Snowfall({ tone }: { tone: 'dark' | 'light' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const color = tone === 'dark' ? '#ffffff' : 'hsl(208 28% 62%)';
    let w = 0, h = 0, flakes: Flake[] = [];
    let raf = 0, last = 0, time = 0, resizeTimer: number | undefined;

    const setup = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(70, Math.round((w * h) / 22000));
      flakes = flakes.slice(0, n);
      while (flakes.length < n) flakes.push(makeFlake(w, h));
    };

    const frame = (ts: number) => {
      const dt = last ? Math.min(50, ts - last) / 1000 : 0;
      last = ts; time += dt;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      for (const f of flakes) {
        f.y += f.vy * dt;
        f.x += Math.sin(time * f.freq + f.phase) * f.amp * dt;
        if (f.y - f.r > h) { Object.assign(f, makeFlake(w, h, true)); }
        if (f.x < -5) f.x += w + 10; else if (f.x > w + 5) f.x -= w + 10;
        ctx.globalAlpha = f.a;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    const start = () => { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());
    const onResize = () => { window.clearTimeout(resizeTimer); resizeTimer = window.setTimeout(setup, 150); };

    setup(); start();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', onResize);
    return () => {
      stop(); window.clearTimeout(resizeTimer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
    };
  }, [tone, reduced]);

  if (reduced) return null;
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 40, pointerEvents: 'none' }} />;
}
