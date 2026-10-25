import { useEffect, useId, useState } from 'react';
import { prefersReducedMotion } from '@/lib/winterMode';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function SantaFlyby({ tone }: { tone: 'dark' | 'light' }) {
  const reduced = prefersReducedMotion();
  const [flight, setFlight] = useState<{ key: number; top: string } | null>(null);
  const [nextDelay, setNextDelay] = useState<number>(() => rand(12000, 20000));
  const deerId = `winter-deer-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (reduced || flight) return;
    let timer: number | undefined;
    const tryStart = () => {
      if (document.hidden) { timer = window.setTimeout(tryStart, 2000); return; }
      setFlight({ key: Date.now(), top: `${rand(Math.max(84, window.innerHeight * 0.08), window.innerHeight * 0.24)}px` });
    };
    timer = window.setTimeout(tryStart, nextDelay);
    return () => window.clearTimeout(timer);
  }, [reduced, flight, nextDelay]);

  if (reduced || !flight) return null;

  const color = tone === 'dark' ? 'hsl(var(--gold))' : 'hsl(var(--gold-ink))';
  const opacity = tone === 'dark' ? 0.32 : 0.3;

  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 40 }}>
      <div
        key={flight.key}
        className="winter-flyby"
        onAnimationEnd={(e) => {
          if (e.target !== e.currentTarget) return;
          setNextDelay(rand(20000, 30000));
          setFlight(null);
        }}
        style={{
          position: 'absolute', left: 0, top: flight.top, width: 'clamp(150px, 16vw, 240px)',
          animation: 'winter-flyby 14s linear forwards', color, opacity,
        }}
      >
        <div style={{ animation: 'winter-bob 3.2s ease-in-out infinite' }}>
          <svg
            viewBox="-100 -46 236 74" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor"
            strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', width: '100%', height: 'auto', transform: 'rotate(-4deg)' }}
          >
            <defs>
              <g id={deerId} transform="rotate(-6)">
                <ellipse cx="0" cy="0" rx="17" ry="7" stroke="none" />
                <path d="M8 -6 L16 -2 L26 -15 L21 -19 Z" stroke="none" />
                <ellipse cx="26" cy="-18" rx="6.5" ry="3.6" transform="rotate(-18 26 -18)" stroke="none" />
                <path d="M22 -22 L19 -26" strokeWidth="2" fill="none" />
                <path d="M24 -21 C22 -27 23 -32 27 -36 M23.5 -27 L19 -30 M24 -31 L20 -35 M25.5 -33.5 L30 -37" strokeWidth="1.7" fill="none" />
                <path d="M9 4 L16 11 L25 8 M4 5 L10 13 L18 12" strokeWidth="2.6" fill="none" />
                <path d="M-9 4 L-17 10 L-26 9 M-13 4 L-20 13 L-28 14" strokeWidth="2.6" fill="none" />
                <path d="M-16 -4 L-21 -8" strokeWidth="2.4" fill="none" />
              </g>
            </defs>
            <path d="M-84 12 L-84 -8 C-84 -14 -80 -18 -74 -18 L-74 -2 L-38 -2 L-38 -10 C-38 -14 -34 -16 -30 -16 L-30 -6 C-26 -6 -24 -2 -24 2 L-24 12 Z" stroke="none" />
            <path d="M-90 20 L-22 20 C-14 20 -12 14 -18 11" strokeWidth="2.6" fill="none" />
            <path d="M-78 12 L-78 20 M-32 12 L-32 20" strokeWidth="2.2" />
            <circle cx="-54" cy="-13" r="5" stroke="none" />
            <ellipse cx="-54" cy="-3" rx="8" ry="6" stroke="none" />
            <path d="M-50 -17 L-44 -24" strokeWidth="3" fill="none" />
            <circle cx="-70" cy="-9" r="7" stroke="none" />
            <path d="M-24 -4 L8 -7 M50 -9 L66 -9" strokeWidth="1.2" fill="none" />
            <use href={`#${deerId}`} x="28" y="-2" />
            <use href={`#${deerId}`} x="86" y="-4" />
          </svg>
        </div>
      </div>
    </div>
  );
}
