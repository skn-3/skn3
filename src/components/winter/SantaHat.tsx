import type { CSSProperties } from 'react';

export function SantaHat({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 64 56"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`pointer-events-none ${className ?? ''}`}
      style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))', ...style }}
    >
      <path d="M9 44 C10 28 18 13 33 7 C42 3.5 52 5 58 12 C50.5 12.5 45.5 19 45 28 C44.7 34 45.6 39 46.5 44 Z" fill="#C8302B" />
      <circle cx="57.5" cy="12.5" r="6.2" fill="#F7F4EC" />
      <rect x="4" y="40" width="48" height="12" rx="6" fill="#F7F4EC" />
    </svg>
  );
}
