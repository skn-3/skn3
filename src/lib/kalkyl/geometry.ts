import type { KalkylSettings, RoomDims } from './types';

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
/** Avrundar bort flyttalsbrus (t.ex. 43.599999999) utan att påverka verkliga decimaler. */
const clean = (v: number) => Math.round(v * 1e6) / 1e6;

export function floorArea(d: RoomDims): number {
  return clean(n(d.length) * n(d.width));
}

export function perimeter(d: RoomDims): number {
  return clean(2 * (n(d.length) + n(d.width)));
}

export function sockelLength(d: RoomDims, s: KalkylSettings): number {
  return clean(Math.max(0, perimeter(d) - n(d.doors) * n(s.door_width_m)));
}

export function wallArea(d: RoomDims, s: KalkylSettings): number {
  const gross = perimeter(d) * n(d.height);
  const doors = n(d.doors) * n(s.door_width_m) * n(s.door_height_m);
  const windows = n(d.windows) * n(s.window_width_m) * n(s.window_height_m);
  return clean(Math.max(0, gross - doors - windows));
}
