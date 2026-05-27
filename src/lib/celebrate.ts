import confetti from 'canvas-confetti';
import { toast } from 'sonner';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const PRIMARY_COLORS = ['#22C55E', '#16A34A', '#86EFAC', '#FACC15', '#F97316'];

function burst(opts: confetti.Options) {
  if (prefersReducedMotion()) return;
  confetti({
    zIndex: 9999,
    disableForReducedMotion: true,
    colors: PRIMARY_COLORS,
    ...opts,
  });
}

/** Stort fira-moment: signerad affär */
export function celebrateSignedDeal(orderValue?: number | null) {
  burst({ particleCount: 120, spread: 80, origin: { y: 0.6 }, startVelocity: 45 });
  setTimeout(() => burst({ particleCount: 80, spread: 100, origin: { x: 0.2, y: 0.7 } }), 180);
  setTimeout(() => burst({ particleCount: 80, spread: 100, origin: { x: 0.8, y: 0.7 } }), 320);

  const valueText = orderValue && orderValue > 0
    ? ` ${new Intl.NumberFormat('sv-SE').format(orderValue)} kr`
    : '';
  toast.success(`🎉 Affär signerad!${valueText}`, { duration: 4000 });
}

/** Stort fira-moment: montage klart */
export function celebrateMontageDone() {
  burst({ particleCount: 100, spread: 70, origin: { y: 0.6 }, startVelocity: 40 });
  setTimeout(() => burst({ particleCount: 60, spread: 90, origin: { y: 0.65 } }), 200);
  toast.success('✅ Snyggt jobbat! Montage klart.', { duration: 4000 });
}

/** Mindre fira-moment: ärende fakturerat */
export function celebrateInvoiced() {
  burst({ particleCount: 50, spread: 55, origin: { y: 0.7 }, startVelocity: 30, ticks: 120 });
  toast.success('💰 Fakturerad!', { duration: 3000 });
}
