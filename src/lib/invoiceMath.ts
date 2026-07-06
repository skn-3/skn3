// Faktura-/radmatte — enda källan för moms och radbelopp.

export function lineAmount(unitPrice: number | null | undefined, qty: number | null | undefined): number {
  return Math.round((Number(unitPrice) || 0) * (Number(qty) || 0));
}

export function calcInvoiceTotals(
  lines: { amount: number | null | undefined }[],
  vatMode: 'omvand' | 'vanlig',
): { subtotal: number; vatAmount: number; total: number } {
  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const vatAmount = vatMode === 'vanlig' ? Math.round(subtotal * 0.25) : 0;
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}
