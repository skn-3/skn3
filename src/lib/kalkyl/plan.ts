// Geometri för ritningarna (planritning, väggvy, miniritning) utan DOM, så att den kan testas.
import type { KalkylSettings, RoomDims } from './types';

export type Wall = 'bottom' | 'right' | 'top' | 'left';

export interface DoorOpening { wall: Wall; /** Avstånd från väggens start (vänster/överkant) i px. */ offset: number; width: number }

export interface FittedRoom {
  w: number;
  h: number;
  scale: number;   // px per meter
  doors: DoorOpening[];
}

const pos = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };

/** Väggordning för dörrar: första på nederkant, sedan höger, överkant, vänster, och sedan runt igen. */
const DOOR_WALLS: Wall[] = ['bottom', 'right', 'top', 'left'];

/**
 * Skalar rummet så att det ryms i maxW × maxH med bibehållna proportioner och placerar
 * dörröppningarna. Längden ritas horisontellt, bredden vertikalt.
 */
export function fitRoom(dims: RoomDims, maxW: number, maxH: number, settings?: Pick<KalkylSettings, 'door_width_m'>): FittedRoom {
  const L = pos(dims.length);
  const B = pos(dims.width);
  if (!L || !B || maxW <= 0 || maxH <= 0) return { w: 0, h: 0, scale: 0, doors: [] };
  const scale = Math.min(maxW / L, maxH / B);
  const w = L * scale;
  const h = B * scale;
  const doorM = pos(settings?.door_width_m ?? 0.9) || 0.9;
  const count = Math.max(0, Math.floor(Number(dims.doors) || 0));
  const perWall: Record<Wall, number> = { bottom: 0, right: 0, top: 0, left: 0 };
  const plan: Wall[] = [];
  for (let i = 0; i < count; i++) { const wall = DOOR_WALLS[i % 4]; perWall[wall]++; plan.push(wall); }
  const seen: Record<Wall, number> = { bottom: 0, right: 0, top: 0, left: 0 };
  const doors: DoorOpening[] = plan.map(wall => {
    const len = wall === 'bottom' || wall === 'top' ? w : h;
    const width = Math.min(doorM * scale, len * 0.8 / perWall[wall]);
    const idx = seen[wall]++;
    // Jämnt fördelade, första dörren en fjärdedel in på väggen.
    const slot = len / (perWall[wall] + 1);
    const center = perWall[wall] === 1 ? len * 0.25 + width / 2 : slot * (idx + 1);
    const offset = Math.max(0, Math.min(len - width, center - width / 2));
    return { wall, offset, width };
  });
  return { w, h, scale, doors };
}

export interface ElevationLayout {
  w: number; h: number; scale: number;
  door: { x: number; w: number; h: number } | null;
  windows: { x: number; y: number; w: number; h: number }[];
  ceilingBand: number;
  sockel: number;
}

/**
 * Väggvy för målning: en vägg med rummets längd och takhöjd, högst en dörr och två fönster
 * i inställningarnas mått.
 */
export function elevationLayout(dims: RoomDims, settings: KalkylSettings, maxW: number, maxH: number): ElevationLayout {
  const L = pos(dims.length);
  const H = pos(dims.height);
  if (!L || !H || maxW <= 0 || maxH <= 0) return { w: 0, h: 0, scale: 0, door: null, windows: [], ceilingBand: 0, sockel: 0 };
  const scale = Math.min(maxW / L, maxH / H);
  const w = L * scale;
  const h = H * scale;
  const doorCount = Math.min(1, Math.max(0, Math.floor(Number(dims.doors) || 0)));
  const winCount = Math.min(2, Math.max(0, Math.floor(Number(dims.windows) || 0)));
  const dw = Math.min(pos(settings.door_width_m) * scale, w * 0.3);
  const dh = Math.min(pos(settings.door_height_m) * scale, h * 0.9);
  const door = doorCount ? { x: w * 0.08, w: dw, h: dh } : null;
  const ww = Math.min(pos(settings.window_width_m) * scale, w * 0.25);
  const wh = Math.min(pos(settings.window_height_m) * scale, h * 0.6);
  const startX = door ? door.x + dw + w * 0.08 : w * 0.1;
  const free = w - startX - w * 0.05;
  const windows = Array.from({ length: winCount }, (_, i) => {
    const slot = free / winCount;
    return { x: startX + slot * i + (slot - ww) / 2, y: h * 0.32 - wh * 0.15, w: ww, h: wh };
  });
  return { w, h, scale, door, windows, ceilingBand: Math.max(6, h * 0.05), sockel: Math.max(3, 0.07 * scale) };
}

export interface UnfoldedWall { label: string; length: number; w: number }

/** De fyra väggarna utfällda i proportion: A och C = längd, B och D = bredd. */
export function unfoldWalls(dims: RoomDims, maxW: number, gap = 4): UnfoldedWall[] {
  const L = pos(dims.length);
  const B = pos(dims.width);
  const total = 2 * (L + B);
  if (!total || maxW <= 0) return [];
  const usable = Math.max(0, maxW - gap * 3);
  return [['A', L], ['B', B], ['C', L], ['D', B]].map(([label, length]) => ({
    label: label as string, length: length as number, w: ((length as number) / total) * usable,
  }));
}
