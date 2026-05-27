import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { cn } from '@/lib/utils';
import type { InsightCandidate } from '@/lib/insights/engine';
import { playDing } from '@/lib/insights/sound';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

interface Props {
  insight: InsightCandidate;
  isHero?: boolean;
  index?: number;
  soundEnabled?: boolean;
}

export function InsightCard({ insight, isHero = false, index = 0, soundEnabled = false }: Props) {
  const reduced = prefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showLaser, setShowLaser] = useState(false);
  const [showShimmer, setShowShimmer] = useState(false);
  const [showRocket, setShowRocket] = useState(false);
  const [showStars, setShowStars] = useState(false);

  // session-flagga: trigga animation EN gång per session
  useEffect(() => {
    if (!isHero) return;
    const sessionKey = `sk_insight_shown_session_${insight.id}`;
    let alreadyShown = false;
    try { alreadyShown = sessionStorage.getItem(sessionKey) === '1'; } catch {}
    if (alreadyShown) return;
    try { sessionStorage.setItem(sessionKey, '1'); } catch {}
    if (reduced) return;

    // Trigger based on animation type
    const t = insight.animation;
    if (t === 'laser') {
      setShowLaser(true);
      setTimeout(() => {
        confetti({
          particleCount: 150, spread: 90, origin: { y: 0.45 },
          colors: ['#22C55E', '#16A34A', '#86EFAC', '#FACC15', '#F97316'],
          disableForReducedMotion: true, zIndex: 9999,
        });
        setShowBanner(true);
        if (soundEnabled) playDing();
        setTimeout(() => setShowBanner(false), 2200);
      }, 1100);
      setTimeout(() => setShowLaser(false), 1400);
    } else if (t === 'fire') {
      // fire pulse är inbäddad i emoji-rendering; konfetti vid stora streaks
      if (soundEnabled) playDing();
      const streak = Number(insight.highlight || 0);
      if (streak >= 5) {
        confetti({
          particleCount: 60, spread: 70, origin: { y: 0.5 },
          colors: ['#F97316', '#EF4444', '#FACC15'],
          disableForReducedMotion: true, zIndex: 9999,
        });
      }
    } else if (t === 'shimmer') {
      setShowShimmer(true);
      setShowStars(true);
      if (soundEnabled) playDing();
      setTimeout(() => setShowShimmer(false), 1600);
      setTimeout(() => setShowStars(false), 1800);
    } else if (t === 'lockon') {
      // CSS-baserad via highlight (se nedan)
      if (soundEnabled) playDing();
    } else if (t === 'rise') {
      // pil ritas via SVG inline, ingen extra state
      if (soundEnabled) playDing();
    } else if (t === 'rocket') {
      setShowRocket(true);
      if (soundEnabled) playDing();
      setTimeout(() => setShowRocket(false), 1400);
    } else if (t === 'confetti') {
      confetti({
        particleCount: 80, spread: 70, origin: { y: 0.5 },
        disableForReducedMotion: true, zIndex: 9999,
      });
      if (soundEnabled) playDing();
    }
  }, [insight.id, insight.animation, insight.highlight, isHero, reduced, soundEnabled]);

  const reducedFade = reduced
    ? { opacity: 1 }
    : { opacity: 1, y: 0 };

  return (
    <>
      {/* Hero "NYTT REKORD" banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none"
          >
            <div className="px-5 py-2.5 rounded-full bg-gradient-to-r from-primary to-emerald-500 text-primary-foreground font-bold shadow-2xl text-sm sm:text-base">
              🏆 NYTT REKORD
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        ref={ref}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={reducedFade}
        transition={reduced
          ? { duration: 0.1 }
          : { duration: 0.4, delay: index * 0.08, ease: 'easeOut' }}
        className={cn(
          'relative rounded-xl border bg-card shadow-sm overflow-hidden',
          isHero ? 'p-6 sm:p-7' : 'p-5',
          isHero && insight.tier === 1 && 'border-primary/40 bg-gradient-to-br from-primary/5 via-card to-card',
          insight.animation === 'fire' && !reduced && 'insight-fire-glow',
        )}
      >
        {/* LASER border trace */}
        {showLaser && !reduced && (
          <span className="insight-laser pointer-events-none" aria-hidden />
        )}

        {/* SHIMMER sweep */}
        {showShimmer && !reduced && (
          <span className="insight-shimmer pointer-events-none" aria-hidden />
        )}

        <div className="relative flex items-start gap-3 sm:gap-4">
          <div className={cn(
            'shrink-0 select-none',
            isHero ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl',
            insight.animation === 'fire' && !reduced && 'insight-fire-pulse',
          )}>
            {insight.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn(
              'font-bold leading-tight',
              isHero ? 'text-lg sm:text-2xl' : 'text-base sm:text-lg',
            )}>
              {renderTitleWithHighlight(insight)}
            </div>
            {insight.subtitle && (
              <div className={cn(
                'text-muted-foreground mt-1',
                isHero ? 'text-sm sm:text-base' : 'text-xs sm:text-sm',
              )}>
                {insight.subtitle}
              </div>
            )}
          </div>

          {/* RISE arrow */}
          {insight.animation === 'rise' && !reduced && isHero && (
            <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0 text-primary">
              <path
                d="M 8 32 L 32 8 M 32 8 L 20 8 M 32 8 L 32 20"
                stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"
                className="insight-rise-path"
              />
            </svg>
          )}
        </div>

        {/* SHIMMER stjärnor */}
        {showStars && !reduced && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className="insight-star"
                style={{
                  left: `${30 + Math.random() * 40}%`,
                  top: `${40 + Math.random() * 30}%`,
                  animationDelay: `${i * 0.07}s`,
                }}
              >✨</span>
            ))}
          </div>
        )}

        {/* ROCKET */}
        {showRocket && !reduced && (
          <span className="insight-rocket pointer-events-none" aria-hidden>🚀</span>
        )}
      </motion.div>
    </>
  );
}

function renderTitleWithHighlight(insight: InsightCandidate) {
  const { title, highlight, animation } = insight;
  if (!highlight || !title.includes(highlight)) return title;
  const reduced = prefersReducedMotion();
  const idx = title.indexOf(highlight);
  const before = title.slice(0, idx);
  const after = title.slice(idx + highlight.length);
  const wrapClass = cn(
    'inline-block relative',
    animation === 'lockon' && !reduced && 'insight-lockon',
    animation === 'rise' && !reduced && 'text-primary',
    animation === 'laser' && !reduced && 'text-primary',
  );
  return (
    <>
      {before}
      <span className={wrapClass}>{highlight}</span>
      {after}
    </>
  );
}
