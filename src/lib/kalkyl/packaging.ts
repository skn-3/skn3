const EPS = 1e-9;

export function withWaste(qty: number, pct: number): number {
  return qty * (1 + (Number(pct) || 0) / 100);
}

/** Antal hela förpackningar. En exakt multipel ger inte en extra förpackning. */
export function packsNeeded(need: number, packSize: number): number {
  if (!(need > 0) || !(packSize > 0)) return 0;
  return Math.ceil(need / packSize - EPS);
}

/** Uppåtavrundat heltal med samma epsilon (liter färg m.m.). */
export function ceilUnits(qty: number): number {
  return packsNeeded(qty, 1);
}

export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
