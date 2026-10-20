// Självfaktura för KM-/utbetalningsrader (Utbetalningar). Layouten delas med
// A-orderfakturorna — se src/lib/selfBillingLayout.ts.
import jsPDF from 'jspdf';
import { drawSelfBillingInvoice, vatFromOrgNr } from './selfBillingLayout';

export { vatFromOrgNr };

export interface SelfBillingPdfLine {
  description: string;
  qty: number;
  unit?: string;
  unit_price: number;
  amount: number;
}

export interface SelfBillingPdfTeam {
  name?: string | null;
  company_name?: string | null;
  org_nr?: string | null;
  address?: string | null;
  bankgiro?: string | null;
}

export interface BuildSelfBillingPdfArgs {
  invoiceNumber: string;
  date: string;
  dueDate?: string | null;
  team: SelfBillingPdfTeam;
  title?: string | null;
  description?: string | null;
  lines: SelfBillingPdfLine[];
  vatMode: 'omvand' | 'vanlig';
  subtotal: number;
  vatAmount: number;
  total: number;
  logoDataUrl?: string | null;
  isCredit?: boolean;
}

export function buildSelfBillingPdf(args: BuildSelfBillingPdfArgs): jsPDF {
  const { invoiceNumber, date, dueDate, team, title, description, lines, vatMode, subtotal, vatAmount, total, logoDataUrl, isCredit } = args;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  return drawSelfBillingInvoice(doc, {
    kind: isCredit ? 'credit' : 'invoice',
    invoiceNumber,
    date,
    dueDate: dueDate || null,
    seller: team,
    title: title || null,
    lines,
    description: description || null,
    vatMode,
    subtotal,
    vatAmount,
    total,
    logoDataUrl: logoDataUrl || null,
  });
}
