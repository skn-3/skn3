import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

export function pullState(distance: number): 'idle' | 'pulling' | 'ready' {
  if (distance <= 0) return 'idle';
  return distance >= 72 ? 'ready' : 'pulling';
}

export function usePullToRefresh(queryKeys: readonly QueryKey[], enabled = true) {
  const containerRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;
  const [state, setState] = useState<ReturnType<typeof pullState> | 'refreshing'>('idle');

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;
    const coarse = window.matchMedia('(pointer: coarse)');
    let start: { x: number; y: number } | null = null;
    let distance = 0;
    let refreshing = false;
    let mounted = true;
    const reset = () => {
      start = null;
      distance = 0;
      if (!refreshing) setState('idle');
    };
    const onStart = (event: TouchEvent) => {
      reset();
      if (!coarse.matches || refreshing || window.scrollY !== 0 || event.touches.length !== 1) return;
      const touch = event.touches[0];
      // Låt inre listor och paneler sköta sin egen scrollning.
      let target = event.target instanceof HTMLElement ? event.target : null;
      while (target && target !== container) {
        if (target.scrollTop > 0) return;
        target = target.parentElement;
      }
      start = { x: touch.clientX, y: touch.clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!start || refreshing) return;
      if (event.touches.length !== 1 || window.scrollY !== 0) { reset(); return; }
      const touch = event.touches[0];
      const dy = touch.clientY - start.y;
      const dx = Math.abs(touch.clientX - start.x);
      if (dy <= 0 || dx > Math.abs(dy)) { reset(); return; }
      distance = dy;
      if (event.cancelable) event.preventDefault();
      setState(pullState(distance));
    };
    const onEnd = async () => {
      const ready = pullState(distance) === 'ready';
      start = null;
      distance = 0;
      if (!ready || refreshing) { if (!refreshing) setState('idle'); return; }
      refreshing = true;
      setState('refreshing');
      try {
        await Promise.all(keysRef.current.map(queryKey => queryClient.invalidateQueries({ queryKey })));
      } finally {
        refreshing = false;
        if (mounted) setState('idle');
      }
    };
    const end = () => { void onEnd(); };
    container.addEventListener('touchstart', onStart, { passive: true });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', end);
    container.addEventListener('touchcancel', reset);
    return () => {
      mounted = false;
      container.removeEventListener('touchstart', onStart);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', end);
      container.removeEventListener('touchcancel', reset);
    };
  }, [enabled, queryClient]);

  return { containerRef, state };
}