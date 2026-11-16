// Gemensamt för avdrag och utbetalningsspecifikationer (UTB-serien). Ren modul utan
// Deno-importer: delas av send-montor-settlement, send-montor-debit-invoice och appen
// (re-export i src/lib/montorSettlement.ts).

/** Text i betalningsrutan och mejlet när en debetfaktura regleras genom avräkning. */
export const AVRAKNING_NOTICE =
  'Regleras genom avräkning mot nästa utbetalning till er. Har ni invändningar, kontakta oss innan dess på n3prenad@smartklimat.org.';

// Betalningsraden har samma format som övriga betalningsrader till Daniel:
// "Faktura-NR - Belopp - Bankgiro".

/** "76 911,00 kr" – vanliga mellanslag som tusentalsavgränsare, alltid två decimaler. */
export function formatPaymentAmount(amount: number | string | null | undefined): string {
  const cents = Math.round((Number(amount) || 0) * 100);
  const abs = Math.abs(cents);
  const kr = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const ore = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${kr},${ore} kr`;
}

export interface PaymentLineSource {
  settlement_number?: string | null;
  net_amount?: number | string | null;
  bankgiro?: string | null;
  company_name?: string | null;
}

/** UTB-001 - 76 911,00 kr - Bankgiro 833-7859 (NBD AB) */
export function settlementPaymentLine(s: PaymentLineSource): string {
  const company = String(s.company_name ?? '').trim();
  const bankgiro = String(s.bankgiro ?? '').trim() || '—';
  return `${s.settlement_number ?? 'UTB-?'} - ${formatPaymentAmount(s.net_amount)} - Bankgiro ${bankgiro}${company ? ` (${company})` : ''}`;
}
