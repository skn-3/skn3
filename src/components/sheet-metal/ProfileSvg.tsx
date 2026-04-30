interface Measurements {
  top_mm: number;
  vertical_mm: number;
  bottom_mm: number;
  drip_mm: number;
  upper_angle: string;
  lower_angle: string;
  bottom_angle: string;
}

interface Props {
  m: Measurements;
  type: 'l-profil' | 'underbleck';
}

/**
 * Simple cross-section sketch of an L-profile / underbleck.
 * Not to scale — illustrative with all measurements labelled.
 */
export function ProfileSvg({ m, type }: Props) {
  // Layout — fixed canvas, scale dimensions visually
  const W = 420;
  const H = 260;
  const padX = 60;
  const padY = 40;

  // Pixel sizes (illustrative, not strictly scaled)
  const topPx = Math.max(8, Math.min(40, m.top_mm * 1.5));
  const vertPx = Math.max(40, Math.min(160, m.vertical_mm * 2.2));
  const bottomPx = Math.max(60, Math.min(240, m.bottom_mm * 1.1));
  const dripPx = Math.max(8, Math.min(40, m.drip_mm * 1.2));

  // Points (going clockwise around the metal sheet outline)
  // Start: top-left of upper edge
  const x0 = padX;
  const y0 = padY;
  // Upper horizontal edge
  const x1 = x0 + topPx;
  const y1 = y0;
  // Vertical (going down)
  const x2 = x1;
  const y2 = y1 + vertPx;
  // Bottom horizontal extending right
  const x3 = x2 + bottomPx;
  const y3 = y2;
  // Drip lip (going down)
  const x4 = x3;
  const y4 = y3 + dripPx;

  const path = `M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4}`;

  const label = type === 'l-profil' ? 'L-Profil' : 'Underbleck';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border rounded-lg">
      <text x={W / 2} y={20} textAnchor="middle" fontSize="14" fontWeight="bold" fill="#22C55E">
        {label}
      </text>

      {/* Profile line */}
      <path d={path} stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round" />

      {/* Top edge measurement */}
      <line x1={x0} y1={y0 - 14} x2={x1} y2={y1 - 14} stroke="#6b7280" strokeWidth="1" />
      <line x1={x0} y1={y0 - 18} x2={x0} y2={y0 - 10} stroke="#6b7280" strokeWidth="1" />
      <line x1={x1} y1={y1 - 18} x2={x1} y2={y1 - 10} stroke="#6b7280" strokeWidth="1" />
      <text x={(x0 + x1) / 2} y={y0 - 20} textAnchor="middle" fontSize="11" fill="#374151">{m.top_mm}</text>

      {/* Vertical measurement (left side) */}
      <line x1={x1 + 14} y1={y1} x2={x2 + 14} y2={y2} stroke="#6b7280" strokeWidth="1" />
      <line x1={x1 + 10} y1={y1} x2={x1 + 18} y2={y1} stroke="#6b7280" strokeWidth="1" />
      <line x1={x2 + 10} y1={y2} x2={x2 + 18} y2={y2} stroke="#6b7280" strokeWidth="1" />
      <text x={x1 + 22} y={(y1 + y2) / 2 + 4} fontSize="11" fill="#374151">{m.vertical_mm}</text>

      {/* Bottom horizontal measurement */}
      <line x1={x2} y1={y2 + 18} x2={x3} y2={y3 + 18} stroke="#6b7280" strokeWidth="1" />
      <line x1={x2} y1={y2 + 14} x2={x2} y2={y2 + 22} stroke="#6b7280" strokeWidth="1" />
      <line x1={x3} y1={y3 + 14} x2={x3} y2={y3 + 22} stroke="#6b7280" strokeWidth="1" />
      <text x={(x2 + x3) / 2} y={y2 + 32} textAnchor="middle" fontSize="11" fill="#374151">{m.bottom_mm}</text>

      {/* Drip measurement */}
      <line x1={x4 + 14} y1={y3} x2={x4 + 14} y2={y4} stroke="#6b7280" strokeWidth="1" />
      <line x1={x4 + 10} y1={y3} x2={x4 + 18} y2={y3} stroke="#6b7280" strokeWidth="1" />
      <line x1={x4 + 10} y1={y4} x2={x4 + 18} y2={y4} stroke="#6b7280" strokeWidth="1" />
      <text x={x4 + 22} y={(y3 + y4) / 2 + 4} fontSize="11" fill="#374151">{m.drip_mm}</text>

      {/* Angle labels */}
      <text x={x1 + 4} y={y1 + 14} fontSize="10" fill="#22C55E">{m.upper_angle}</text>
      <text x={x2 + 4} y={y2 - 4} fontSize="10" fill="#22C55E">{m.bottom_angle}</text>
      <text x={x3 - 24} y={y3 + 14} fontSize="10" fill="#22C55E">{m.lower_angle}</text>

      <text x={W - 8} y={H - 8} textAnchor="end" fontSize="9" fill="#9ca3af" fontStyle="italic">
        Mått i mm — ej skalenligt
      </text>
    </svg>
  );
}
