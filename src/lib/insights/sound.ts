// Web Audio "ding" — no asset files needed.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    return ctx;
  } catch { return null; }
}

export function playDing() {
  const c = getCtx(); if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {}
}

export function getSoundEnabled(name: string): boolean {
  try {
    return localStorage.getItem(`sk_insights_sound_${name}`) === '1';
  } catch { return false; }
}

export function setSoundEnabled(name: string, on: boolean) {
  try { localStorage.setItem(`sk_insights_sound_${name}`, on ? '1' : '0'); } catch {}
}
