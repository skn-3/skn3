export function approvedHoursError(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 500
    ? null : 'Ange godkända timmar mellan 0 och 500.';
}
export function approvedHoursWarning(approved: number, sold: number, requested: number): boolean {
  return approved > sold && approved > requested;
}