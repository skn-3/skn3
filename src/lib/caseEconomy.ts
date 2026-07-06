// Ärendets ekonomi — ENDA källan för marginalformeln.
// Används av EconomyView OCH CaseMarginBlock. Ändra aldrig den ena utan den andra: ändra HÄR.

export interface DocRow { doc_type: string; total_amount: number | null }
export interface CostBuckets { ovrigt: number; reklMontor: number; reklOvrig: number; reklFabrik: number }
export interface CostRow { category: string | null; responsible: string | null; amount: number | null }

export interface CaseEconomics {
  revenue: number;            // summa mockfjards_payout
  montorCost: number;
  hasMontor: boolean;
  sheetCost: number;
  montorInvoiceCost: number;
  cost: number;               // total kostnad (fabriksreklamationer EXKLUDERADE — ersätts av fabrik)
  profit: number;
  margin: number | null;      // profit/revenue, null när revenue = 0
}

const sumDocs = (docs: DocRow[], type: string) =>
  docs.filter((d) => d.doc_type === type).reduce((s, d) => s + (Number(d.total_amount) || 0), 0);

export function bucketCaseCosts(rows: CostRow[]): CostBuckets {
  const b: CostBuckets = { ovrigt: 0, reklMontor: 0, reklOvrig: 0, reklFabrik: 0 };
  for (const c of rows) {
    const amt = Number(c.amount) || 0;
    if (c.category === 'reklamation') {
      if (c.responsible === 'montor') b.reklMontor += amt;
      else if (c.responsible === 'fabrik') b.reklFabrik += amt;
      else b.reklOvrig += amt;
    } else b.ovrigt += amt;
  }
  return b;
}

export function computeCaseEconomics(input: {
  aOrderSum: number | null;   // summa lokala a_orders.total_amount (krediter negativa), null = inga rader
  docs: DocRow[];
  buckets: CostBuckets;
}): CaseEconomics {
  const revenue = sumDocs(input.docs, 'mockfjards_payout');
  const aOrderDocSum = sumDocs(input.docs, 'a_order');
  const montorCost = input.aOrderSum != null ? input.aOrderSum : aOrderDocSum;
  const hasMontor = (input.aOrderSum != null && input.aOrderSum !== 0) || aOrderDocSum > 0;
  const sheetCost = sumDocs(input.docs, 'sheet_metal_invoice');
  const montorInvoiceCost = sumDocs(input.docs, 'montor_invoice');
  const cost = montorCost + input.buckets.ovrigt + input.buckets.reklMontor + input.buckets.reklOvrig + sheetCost + montorInvoiceCost;
  const profit = revenue - cost;
  return { revenue, montorCost, hasMontor, sheetCost, montorInvoiceCost, cost, profit, margin: revenue > 0 ? profit / revenue : null };
}

// Panelens läge: faller tillbaka på preliminärt ordervärde tills utbetalningen finns.
export function marginWithFallback(eco: CaseEconomics, orderValue: number | null) {
  const usingPayout = eco.revenue > 0;
  const revenue = usingPayout ? eco.revenue : (Number(orderValue) || 0);
  const profit = revenue - eco.cost;
  const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : null;
  return { usingPayout, revenue, profit, marginPct };
}
