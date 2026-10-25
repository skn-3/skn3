import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/winterMode';

// Snöfall i tre djup: bakre lagret är litet och mjukt, mellanlagret skarpt och
// främre lagret stort, snabbt och mjukt igen (skärpedjup). Flingorna ritas som
// sexarmade snöflingor, förrenderade till sprites så att iPad inte behöver
// rita vektorer varje bildruta.

type Tone = 'dark' | 'light';
type LayerName = 'far' | 'mid' | 'near';
interface LayerSpec {
  share: number;            // andel av alla flingor
  R: [number, number];      // radie i CSS-px
  blur: number;             // oskärpa i CSS-px
  alpha: [number, number];
  vy: [number, number];     // fallhastighet px/s
  sway: [number, number];   // sidosvängning px/s
  spin: number;             // max rotation rad/s
}

const LAYERS: Record<LayerName, LayerSpec> = {
  far:  { share: 0.5,  R: [3, 4.5],  blur: 0.9, alpha: [0.22, 0.36], vy: [10, 18], sway: [4, 9],   spin: 0.15 },
  mid:  { share: 0.35, R: [5.5, 9],  blur: 0,   alpha: [0.45, 0.65], vy: [22, 38], sway: [8, 16],  spin: 0.35 },
  near: { share: 0.15, R: [11, 16],  blur: 1.6, alpha: [0.30, 0.45], vy: [50, 75], sway: [14, 26], spin: 0.5 },
};
const ORDER: Record<LayerName, number> = { far: 0, mid: 1, near: 2 };
const LAYER_NAMES = Object.keys(LAYERS) as LayerName[];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Sprite { canvas: HTMLCanvasElement; size: number }
interface Flake {
  layer: LayerName; sp: Sprite;
  x: number; y: number; vy: number; sway: number; phase: number; freq: number;
  rot: number; spin: number; a: number;
}

/** Sexarmad snöflinga med grenar, centrerad i origo. Variant 1 har romber i spetsarna. */
function drawFlake(g: CanvasRenderingContext2D, R: number, variant: 0 | 1, lw: number) {
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = lw;
  const branches = variant === 0 ? [0.42, 0.68] : [0.48, 0.74];
  const L = R * (variant === 0 ? 0.3 : 0.24);
  for (let k = 0; k < 6; k++) {
    g.save(); g.rotate((k * Math.PI) / 3);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -R); g.stroke();
    for (const t of branches) {
      const y = -R * t;
      g.beginPath();
      g.moveTo(0, y); g.lineTo(-L * 0.87, y - L * 0.5);
      g.moveTo(0, y); g.lineTo(L * 0.87, y - L * 0.5);
      g.stroke();
    }
    if (variant === 1) {
      const d = R * 0.13;
      g.beginPath(); g.moveTo(0, -R - d); g.lineTo(d, -R); g.lineTo(0, -R + d); g.lineTo(-d, -R); g.closePath(); g.fill();
    }
    g.restore();
  }
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + Math.PI / 6, r = R * 0.2;
    const x = r * Math.cos(a), y = r * Math.sin(a);
    if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath(); g.fill();
}

/** Förrenderad flinga i device-pixlar. Oskärpan görs med skuggtricket, som fungerar i Safari utan ctx.filter. */
function makeSprite(R: number, variant: 0 | 1, color: string, blur: number, dpr: number): Sprite {
  const pad = blur * 3 + R * 0.35 + 2;
  const size = Math.ceil((R + pad) * 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.ceil(size * dpr);
  const g = canvas.getContext('2d');
  if (!g) return { canvas, size };
  g.strokeStyle = color; g.fillStyle = color;
  g.translate((size / 2) * dpr, (size / 2) * dpr);
  g.scale(dpr, dpr);
  if (blur > 0) {
    const OFF = 4096;
    g.shadowColor = color; g.shadowBlur = blur * dpr; g.shadowOffsetX = OFF; g.shadowOffsetY = 0;
    g.translate(-OFF / dpr, 0);
  }
  drawFlake(g, R, variant, Math.max(1.1, R * 0.18));
  return { canvas, size };
}

export function Snowfall({ tone }: { tone: Tone }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const color = tone === 'dark' ? '#ffffff' : 'hsl(208 30% 58%)';
    let w = 0, h = 0, dpr = 1;
    let flakes: Flake[] = [];
    let sprites = new Map<string, Sprite>();
    let raf = 0, last = 0, time = 0, resizeTimer: number | undefined;

    const sprite = (layer: LayerName, variant: 0 | 1, R: number): Sprite => {
      const key = `${layer}:${variant}:${R}`;
      let s = sprites.get(key);
      if (!s) { s = makeSprite(R, variant, color, LAYERS[layer].blur, dpr); sprites.set(key, s); }
      return s;
    };

    const makeFlake = (layer: LayerName, top = false): Flake => {
      const L = LAYERS[layer];
      const steps = [0, 0.5, 1];
      const R = +(L.R[0] + (L.R[1] - L.R[0]) * steps[Math.floor(Math.random() * 3)]).toFixed(2);
      const variant: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
      const sp = sprite(layer, variant, R);
      return {
        layer, sp,
        x: Math.random() * w, y: top ? -sp.size : Math.random() * h,
        vy: rand(L.vy[0], L.vy[1]), sway: rand(L.sway[0], L.sway[1]),
        phase: Math.random() * Math.PI * 2, freq: rand(0.25, 0.6),
        rot: Math.random() * Math.PI * 2, spin: rand(-L.spin, L.spin),
        a: rand(L.alpha[0], L.alpha[1]),
      };
    };

    const setup = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sprites = new Map();
      // ≈50 flingor på 1440×900, ≈30 på iPad, ≈13 på telefon
      const n = Math.min(60, Math.round((w * h) / 26000));
      flakes = [];
      for (const layer of LAYER_NAMES) {
        const k = Math.max(1, Math.round(n * LAYERS[layer].share));
        for (let i = 0; i < k; i++) flakes.push(makeFlake(layer));
      }
      flakes.sort((p, q) => ORDER[p.layer] - ORDER[q.layer]); // bakre lagret ritas först
    };

    const frame = (ts: number) => {
      const dt = last ? Math.min(50, ts - last) / 1000 : 0;
      last = ts; time += dt;
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.vy * dt;
        f.x += (Math.sin(time * f.freq + f.phase) * f.sway + 3) * dt; // +3 = svag vind
        f.rot += f.spin * dt;
        if (f.y - f.sp.size > h) Object.assign(f, makeFlake(f.layer, true));
        if (f.x < -f.sp.size) f.x += w + f.sp.size * 2;
        else if (f.x > w + f.sp.size) f.x -= w + f.sp.size * 2;
        ctx.save();
        ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = f.a;
        ctx.drawImage(f.sp.canvas, -f.sp.size / 2, -f.sp.size / 2, f.sp.size, f.sp.size);
        ctx.restore();
      }
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
