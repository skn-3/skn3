// Konsultfaktura (självfaktura): konsultens bolag är säljare, betalaren
// (t.ex. Daniel Malke AB) är köpare/utfärdare. Inga avdrag eller TB på
// fakturan — de finns bara i den interna specifikationen.
import jsPDF from 'jspdf';
import { drawSelfBillingInvoice, type SelfBillingBuyer } from './selfBillingLayout';
import { monthLabel } from './consultantPay';
import { consultantInvoicePdfName, pdfTitleFromName } from './pdfNames';

export interface ConsultantForInvoice {
  company_name?: string | null;
  name?: string | null;
  org_nr?: string | null;
  address?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  payer_name?: string | null;
  payer_org_nr?: string | null;
  payer_vat_nr?: string | null;
  payer_address?: string | null;
  payer_email?: string | null;
}

export interface ConsultantPayoutForInvoice {
  kind: string; // 'payout' | 'advance'
  invoice_number?: number | string | null;
  invoice_date?: string | null;
  payout_month?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  net_amount?: number | null;
  vat_amount?: number | null;
  total_incl_vat?: number | null;
}

export function consultantInvoiceBuyer(c: ConsultantForInvoice): SelfBillingBuyer {
  return {
    name: c.payer_name || '—',
    addressLines: String(c.payer_address || '').split(',').map(s => s.trim()).filter(Boolean),
    orgNr: c.payer_org_nr || '',
    vatNr: c.payer_vat_nr || '',
    email: c.payer_email || undefined,
  };
}

export function buildConsultantInvoicePdf(opts: {
  consultant: ConsultantForInvoice;
  payout: ConsultantPayoutForInvoice;
  logoDataUrl?: string | null;
}): jsPDF {
  const { consultant: c, payout } = opts;
  const isAdvance = payout.kind === 'advance';
  const net = Number(payout.net_amount) || 0;
  const vat = Number(payout.vat_amount) || 0;
  const total = Number(payout.total_incl_vat) || 0;
  const date = payout.invoice_date || new Date().toISOString().slice(0, 10);

  let reference: string;
  if (isAdvance) {
    reference = 'Förskott på provision';
  } else {
    reference = `Konsultprovision ${payout.payout_month ? monthLabel(payout.payout_month) : ''}`.trim();
    if (payout.period_start && payout.period_end) reference += ` (period ${payout.period_start} – ${payout.period_end})`;
  }

  const doc = new jsPDF();
  drawSelfBillingInvoice(doc, {
    kind: 'invoice',
    invoiceNumber: String(payout.invoice_number ?? ''),
    date,
    seller: {
      company_name: c.company_name,
      name: c.name,
      org_nr: c.org_nr,
      address: c.address,
      bankgiro: `${c.bank_name ?? ''} ${c.bank_account ?? ''}`.trim() || null,
    },
    buyer: consultantInvoiceBuyer(c),
    reference,
    lines: [{ description: isAdvance ? 'Förskott provision' : 'Konsult Provision', qty: 1, unit: 'st', unit_price: net, amount: net }],
    vatMode: 'vanlig',
    subtotal: net,
    vatAmount: vat,
    total,
    logoDataUrl: opts.logoDataUrl ?? null,
  });
  doc.setProperties({ title: pdfTitleFromName(consultantInvoicePdfName(c, payout.invoice_number ?? '', date)) });
  return doc;
}
