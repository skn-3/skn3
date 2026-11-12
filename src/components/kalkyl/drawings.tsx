// Ritningar: planritning, miniritning och väggvy. All geometri kommer från src/lib/kalkyl/plan.ts.
// Provbitar och kulörer har egna färger (från prislistan/paletten); väggar och mått följer temat.
import { useId } from 'react';
import { elevationLayout, fitRoom, unfoldWalls, type Kulor, type KalkylSettings, type PriceItem, type RoomDims } from '@/lib/kalkyl';
import { cn } from '@/lib/utils';
import { dec } from './format';

const NEUTRAL = '#E7E5DF';

function FloorPattern({ id, item, direction, scale }: { id: string; item?: Pick<PriceItem, 'swatch' | 'color_hex'> | null; direction: 'langs' | 'tvars'; scale: number }) {
  const s = item?.swatch;
  const color = s?.color ?? item?.color_hex ?? NEUTRAL;
  const line = s?.line ?? 'rgba(0,0,0,0.18)';
  // Plankor ca 0,19 m breda och 1,2 m långa, skalade efter ritningen.
  const pw = Math.max(4, 0.19 * scale);
  const pl = Math.max(pw * 3, 1.2 * scale);
  const rotate = direction === 'tvars' ? 90 : 0;
  if (s?.pattern === 'fiskben') {
    const u = Math.max(5, 0.1 * scale);
    return (
      <pattern id={id} width={u * 4} height={u * 4} patternUnits="userSpaceOnUse" patternTransform={`rotate(${rotate})`}>
        <rect width={u * 4} height={u * 4} fill={color} />
        <path d={`M0 ${u * 2} L${u * 2} 0 M${u * 2} ${u * 4} L${u * 4} ${u * 2} M0 ${u * 2} L${u * 2} ${u * 4} M${u * 2} 0 L${u * 4} ${u * 2}`} stroke={line} strokeWidth={1} fill="none" />
        <path d={`M${u} ${u} L${u * 2} ${u * 2} M${u * 3} ${u * 3} L${u * 2} ${u * 2}`} stroke={line} strokeWidth={0.6} fill="none" />
      </pattern>
    );
  }
  if (s?.pattern === 'plank' || !s?.pattern) {
    return (
      <pattern id={id} width={pl} height={pw * 2} patternUnits="userSpaceOnUse" patternTransform={`rotate(${rotate})`}>
        <rect width={pl} height={pw * 2} fill={color} />
        {s && <>
          <line x1={0} y1={pw} x2={pl} y2={pw} stroke={line} strokeWidth={1} />
          <line x1={0} y1={pw * 2} x2={pl} y2={pw * 2} stroke={line} strokeWidth={1} />
          <line x1={pl * 0.4} y1={0} x2={pl * 0.4} y2={pw} stroke={line} strokeWidth={1} />
          <line x1={pl * 0.9} y1={pw} x2={pl * 0.9} y2={pw * 2} stroke={line} strokeWidth={1} />
        </>}
      </pattern>
    );
  }
  return <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse"><rect width={10} height={10} fill={color} /></pattern>;
}

/** Planritning i skala med väggar, dörröppningar och måttlinjer. */
export function RoomPlan({ dims, item, direction = 'langs', settings, width, height, mini = false, className, title }: {
  dims: RoomDims; item?: Pick<PriceItem, 'swatch' | 'color_hex'> | null; direction?: 'langs' | 'tvars';
  settings: KalkylSettings; width: number; height: number; mini?: boolean; className?: string; title?: string;
}) {
  const pid = useId().replace(/:/g, '');
  const pad = mini ? 4 : 44;
  const f = fitRoom(dims, width - pad * 2, height - pad * 2, settings);
  if (!f.w) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} role="img" aria-label="Ange rummets mått för att se ritningen">
        {!mini && <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-muted-foreground text-[13px]">Ange längd och bredd</text>}
      </svg>
    );
  }
  const x0 = (width - f.w) / 2;
  const y0 = (height - f.h) / 2;
  const wall = mini ? 1.5 : 4;
  const gaps = f.doors.map((d, i) => {
    const p = { bottom: [x0 + d.offset, y0 + f.h, x0 + d.offset + d.width, y0 + f.h], top: [x0 + d.offset, y0, x0 + d.offset + d.width, y0],
      left: [x0, y0 + d.offset, x0, y0 + d.offset + d.width], right: [x0 + f.w, y0 + d.offset, x0 + f.w, y0 + d.offset + d.width] }[d.wall];
    return <line key={i} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} className="stroke-card" strokeWidth={wall + 2} />;
  });
  const tick = 6;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" className={className} role="img"
      aria-label={title ?? `Planritning ${dec(dims.length)} × ${dec(dims.width)} m`}>
      <defs><FloorPattern id={pid} item={item} direction={direction} scale={f.scale} /></defs>
      <rect x={x0} y={y0} width={f.w} height={f.h} fill={`url(#${pid})`} />
      <rect x={x0} y={y0} width={f.w} height={f.h} fill="none" className="stroke-foreground" strokeWidth={wall} />
      {gaps}
      {!mini && f.doors.map((d, i) => {
        // Dörrblad som en kvarts cirkelbåge in i rummet.
        const r = d.width;
        if (d.wall === 'bottom') { const x = x0 + d.offset; const y = y0 + f.h; return <path key={`a${i}`} d={`M${x} ${y} L${x} ${y - r} A${r} ${r} 0 0 1 ${x + r} ${y}`} className="stroke-muted-foreground" fill="none" strokeWidth={1} />; }
        if (d.wall === 'top') { const x = x0 + d.offset; const y = y0; return <path key={`a${i}`} d={`M${x} ${y} L${x} ${y + r} A${r} ${r} 0 0 0 ${x + r} ${y}`} className="stroke-muted-foreground" fill="none" strokeWidth={1} />; }
        if (d.wall === 'right') { const x = x0 + f.w; const y = y0 + d.offset; return <path key={`a${i}`} d={`M${x} ${y} L${x - r} ${y} A${r} ${r} 0 0 0 ${x} ${y + r}`} className="stroke-muted-foreground" fill="none" strokeWidth={1} />; }
        const x = x0; const y = y0 + d.offset; return <path key={`a${i}`} d={`M${x} ${y} L${x + r} ${y} A${r} ${r} 0 0 1 ${x} ${y + r}`} className="stroke-muted-foreground" fill="none" strokeWidth={1} />;
      })}
      {!mini && (
        <g className="stroke-muted-foreground" strokeWidth={1}>
          <line x1={x0} y1={y0 - 20} x2={x0 + f.w} y2={y0 - 20} />
          <line x1={x0} y1={y0 - 20 - tick} x2={x0} y2={y0 - 20 + tick} />
          <line x1={x0 + f.w} y1={y0 - 20 - tick} x2={x0 + f.w} y2={y0 - 20 + tick} />
          <line x1={x0 - 20} y1={y0} x2={x0 - 20} y2={y0 + f.h} />
          <line x1={x0 - 20 - tick} y1={y0} x2={x0 - 20 + tick} y2={y0} />
          <line x1={x0 - 20 - tick} y1={y0 + f.h} x2={x0 - 20 + tick} y2={y0 + f.h} />
        </g>
      )}
      {!mini && (
        <g className="fill-foreground font-mono text-[12px]">
          <text x={x0 + f.w / 2} y={y0 - 26} textAnchor="middle" className="fill-card stroke-card" strokeWidth={6}>{dec(dims.length)} m</text>
          <text x={x0 + f.w / 2} y={y0 - 26} textAnchor="middle">{dec(dims.length)} m</text>
          <text x={x0 - 26} y={y0 + f.h / 2} textAnchor="middle" transform={`rotate(-90 ${x0 - 26} ${y0 + f.h / 2})`}>{dec(dims.width)} m</text>
        </g>
      )}
    </svg>
  );
}

const fill = (k?: Kulor | null) => k?.hex ?? NEUTRAL;

/** Vägg i elevation: takband, vägg, dörr, två fönster, foder, sockel och golvremsa. */
export function WallElevation({ dims, settings, wall, ceiling, trim, width, height }: {
  dims: RoomDims; settings: KalkylSettings; wall?: Kulor | null; ceiling?: Kulor | null; trim?: Kulor | null; width: number; height: number;
}) {
  const padX = 44; const padTop = 16; const padBottom = 34;
  const e = elevationLayout(dims, settings, width - padX * 2, height - padTop - padBottom);
  if (!e.w) return <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" role="img" aria-label="Ange mått för väggvyn" />;
  const x0 = (width - e.w) / 2;
  const y0 = padTop + (height - padTop - padBottom - e.h) / 2;
  const floorY = y0 + e.h;
  const trimW = 4;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`Väggvy ${dec(dims.length)} m lång, takhöjd ${dec(dims.height)} m${wall ? `, väggar ${wall.code}` : ''}`}>
      <rect x={x0} y={y0} width={e.w} height={e.h} fill={fill(wall)} />
      <rect x={x0} y={y0} width={e.w} height={e.ceilingBand} fill={fill(ceiling)} />
      <line x1={x0} y1={y0 + e.ceilingBand} x2={x0 + e.w} y2={y0 + e.ceilingBand} stroke="rgba(0,0,0,0.12)" />
      {e.windows.map((w, i) => (
        <g key={i}>
          <rect x={x0 + w.x - trimW} y={y0 + w.y - trimW} width={w.w + trimW * 2} height={w.h + trimW * 2} fill={fill(trim)} stroke="rgba(0,0,0,0.15)" />
          <rect x={x0 + w.x} y={y0 + w.y} width={w.w} height={w.h} fill="#DCE6EA" stroke="rgba(0,0,0,0.2)" />
          <line x1={x0 + w.x + w.w / 2} y1={y0 + w.y} x2={x0 + w.x + w.w / 2} y2={y0 + w.y + w.h} stroke="rgba(0,0,0,0.2)" />
        </g>
      ))}
      {e.door && (
        <g>
          <rect x={x0 + e.door.x - trimW} y={floorY - e.door.h - trimW} width={e.door.w + trimW * 2} height={e.door.h + trimW} fill={fill(trim)} stroke="rgba(0,0,0,0.15)" />
          <rect x={x0 + e.door.x} y={floorY - e.door.h} width={e.door.w} height={e.door.h} fill={fill(trim)} stroke="rgba(0,0,0,0.25)" />
          <circle cx={x0 + e.door.x + e.door.w * 0.85} cy={floorY - e.door.h * 0.48} r={2} fill="rgba(0,0,0,0.45)" />
        </g>
      )}
      <rect x={x0} y={floorY - e.sockel} width={e.w} height={e.sockel} fill={fill(trim)} stroke="rgba(0,0,0,0.15)" />
      <rect x={x0 - 6} y={floorY} width={e.w + 12} height={6} className="fill-muted-foreground/40" />
      <rect x={x0} y={y0} width={e.w} height={e.h} fill="none" className="stroke-foreground" strokeWidth={1.5} />
      <g className="stroke-muted-foreground" strokeWidth={1}>
        <line x1={x0} y1={floorY + 20} x2={x0 + e.w} y2={floorY + 20} />
        <line x1={x0} y1={floorY + 14} x2={x0} y2={floorY + 26} />
        <line x1={x0 + e.w} y1={floorY + 14} x2={x0 + e.w} y2={floorY + 26} />
        <line x1={x0 - 20} y1={y0} x2={x0 - 20} y2={floorY} />
        <line x1={x0 - 26} y1={y0} x2={x0 - 14} y2={y0} />
        <line x1={x0 - 26} y1={floorY} x2={x0 - 14} y2={floorY} />
      </g>
      <g className="fill-foreground font-mono text-[12px]">
        <text x={x0 + e.w / 2} y={floorY + 32} textAnchor="middle">{dec(dims.length)} m</text>
        <text x={x0 - 28} y={y0 + e.h / 2} textAnchor="middle" transform={`rotate(-90 ${x0 - 28} ${y0 + e.h / 2})`}>{dec(dims.height)} m</text>
      </g>
    </svg>
  );
}

/** De fyra väggarna utfällda i proportion. */
export function UnfoldedWalls({ dims, wall, width }: { dims: RoomDims; wall?: Kulor | null; width: number }) {
  const walls = unfoldWalls(dims, width, 4);
  const h = 28;
  let x = 0;
  return (
    <svg viewBox={`0 0 ${width} ${h + 18}`} width="100%" height={h + 18} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Väggarna A till D utfällda">
      {walls.map(w => {
        const el = (
          <g key={w.label}>
            <rect x={x} y={0} width={w.w} height={h} fill={fill(wall)} className="stroke-border" />
            <text x={x + w.w / 2} y={h / 2 + 4} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">{w.label}</text>
            <text x={x + w.w / 2} y={h + 14} textAnchor="middle" className="fill-muted-foreground font-mono text-[11px]">{dec(w.length)} m</text>
          </g>
        );
        x += w.w + 4;
        return el;
      })}
    </svg>
  );
}

/** Kulörprov. Okänd kulör utan hex visas neutralt med koden utskriven. */
export function KulorSwatch({ kulor, size = 36, className, showCode = false }: { kulor?: Kulor | null; size?: number; className?: string; showCode?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center rounded-md border border-border overflow-hidden', className)}
      style={{ width: size, height: size, backgroundColor: kulor?.hex ?? NEUTRAL }}
    >
      {!kulor?.hex && showCode && kulor?.code && <span className="px-0.5 text-center font-mono text-[9px] leading-tight text-neutral-700">{kulor.code}</span>}
    </span>
  );
}
