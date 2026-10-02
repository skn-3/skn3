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

const W = 480;
const H = 330;
type Point = { x: number; y: number };

export function parseProfileAngle(value: string, fallback: number): number {
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*(\d+(?:[.,]\d+)?)\s*)?°?$/);
  if (!match) return fallback;
  const first = Number(match[1].replace(',', '.'));
  const second = match[2] ? Number(match[2].replace(',', '.')) : first;
  const angle = (first + second) / 2;
  return first >= 0 && second >= first && angle <= 180 ? angle : fallback;
}

export function profilePoints(m: Measurements): Point[] {
  const upper = parseProfileAngle(m.upper_angle, 18);
  const lower = parseProfileAngle(m.lower_angle, 30);
  const bottom = parseProfileAngle(m.bottom_angle, 88);
  const rad = Math.PI / 180;
  const next = (p: Point, length: number, degrees: number): Point => ({
    x: p.x + Math.max(0, Number(length) || 0) * Math.cos(degrees * rad),
    y: p.y + Math.max(0, Number(length) || 0) * Math.sin(degrees * rad),
  });
  const p0 = { x: 0, y: 0 };
  // The top and lower bends are measured from the horizontal; the drip bend
  // is measured from the lower leg. Each length uses the same drawing scale.
  const p1 = next(p0, m.top_mm, -upper);
  const p2 = next(p1, m.vertical_mm, 90);
  const p3 = next(p2, m.bottom_mm, lower);
  const p4 = next(p3, m.drip_mm, lower + bottom);
  const raw = [p0, p1, p2, p3, p4];
  const minX = Math.min(...raw.map(p => p.x));
  const maxX = Math.max(...raw.map(p => p.x));
  const minY = Math.min(...raw.map(p => p.y));
  const maxY = Math.max(...raw.map(p => p.y));
  const scale = Math.min(300 / Math.max(maxX - minX, 1), 185 / Math.max(maxY - minY, 1));
  const offsetX = (W - (maxX - minX) * scale) / 2;
  const offsetY = 64 + (185 - (maxY - minY) * scale) / 2;
  return raw.map(p => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale }));
}

const fmt = (n: number) => n.toFixed(2);

function dimension(a: Point, b: Point, value: number, side: number) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * side, ny = dx / len * side;
  const offset = 19;
  const ax = a.x + nx * offset, ay = a.y + ny * offset;
  const bx = b.x + nx * offset, by = b.y + ny * offset;
  return <g stroke="#6b7280" fill="none" strokeWidth="1">
    <line x1={fmt(ax)} y1={fmt(ay)} x2={fmt(bx)} y2={fmt(by)} />
    {[{ x: ax, y: ay }, { x: bx, y: by }].map((p, i) => <line key={i} x1={fmt(p.x - nx * 4)} y1={fmt(p.y - ny * 4)} x2={fmt(p.x + nx * 4)} y2={fmt(p.y + ny * 4)} />)}
    <text x={fmt((ax + bx) / 2 + nx * 11)} y={fmt((ay + by) / 2 + ny * 11)} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#374151" stroke="none">{value} mm</text>
  </g>;
}

function bendArc(vertex: Point, from: Point, to: Point, label: string, side: number) {
  const start = Math.atan2(from.y - vertex.y, from.x - vertex.x);
  const end = Math.atan2(to.y - vertex.y, to.x - vertex.x);
  let sweep = ((end - start + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (side < 0 && sweep > 0) sweep -= Math.PI * 2;
  if (side > 0 && sweep < 0) sweep += Math.PI * 2;
  const radius = 14;
  const at = (angle: number) => ({ x: vertex.x + radius * Math.cos(angle), y: vertex.y + radius * Math.sin(angle) });
  const a = at(start), b = at(start + sweep);
  const mid = start + sweep / 2;
  return <g fill="none" stroke="#15803d" strokeWidth="1.2">
    <path d={`M ${fmt(a.x)} ${fmt(a.y)} A ${radius} ${radius} 0 ${Math.abs(sweep) > Math.PI ? 1 : 0} ${sweep > 0 ? 1 : 0} ${fmt(b.x)} ${fmt(b.y)}`} />
    <text x={fmt(vertex.x + 30 * Math.cos(mid))} y={fmt(vertex.y + 30 * Math.sin(mid))} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#15803d" stroke="none">{label}</text>
  </g>;
}

/** Cross-section with uniform length scaling and angle-driven folds. */
export function ProfileSvg({ m, type }: Props) {
  const [p0, p1, p2, p3, p4] = profilePoints(m);
  const label = type === 'l-profil' ? 'L-Profil' : 'Underbleck';
  const angleLabel = (s: string, fallback: number) => Number.isFinite(parseProfileAngle(s, NaN)) ? s.trim() : `${fallback}°`;

  return <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Skiss — ${label}`} className="w-full h-auto bg-white border rounded-lg" /* avsiktligt alltid ljus */>
    <rect width={W} height={H} fill="#ffffff" />
    <text x={W / 2} y="27" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#15803d">{label}</text>
    <path d={`M ${fmt(p0.x)} ${fmt(p0.y)} L ${fmt(p1.x)} ${fmt(p1.y)} L ${fmt(p2.x)} ${fmt(p2.y)} L ${fmt(p3.x)} ${fmt(p3.y)} L ${fmt(p4.x)} ${fmt(p4.y)}`} stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    {dimension(p0, p1, m.top_mm, -1)}
    {dimension(p1, p2, m.vertical_mm, 1)}
    {dimension(p2, p3, m.bottom_mm, 1)}
    {dimension(p3, p4, m.drip_mm, -1)}
    {bendArc(p1, p0, p2, angleLabel(m.upper_angle, 18), -1)}
    {bendArc(p2, p1, p3, angleLabel(m.lower_angle, 30), 1)}
    {bendArc(p3, p2, p4, angleLabel(m.bottom_angle, 88), -1)}
    <text x={W - 12} y={H - 12} textAnchor="end" fontSize="10" fill="#6b7280">Mått i mm · proportionell skiss</text>
  </svg>;
}