import type { CSSProperties } from 'react';

export function SantaHat({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 64 44"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`pointer-events-none ${className ?? ''}`}
      style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))', ...style }}
    >
      <path d="M7 36 C8 24 14 10 26 4.5 C35 0.5 47 2 56 9 C48 9.5 43 15 42.5 22 C42.2 27 43.5 32 45 36 Z" fill="#C8302B" />
      <circle cx="56.5" cy="9.5" r="6" fill="#F7F4EC" />
      <rect x="2" y="32" width="52" height="12" rx="6" fill="#F7F4EC" />
    </svg>
  );
}
