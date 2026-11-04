// Ren logik för att flytta en A-order mellan ärenden (t.ex. från ett dubblettärende).
// Endast case_id flyttas: fakturor, fakturanummer, PDF:er och betalstatus rörs inte.

export interface MovableAOrder {
  id: string;
  order_number?: number | string | null;
  invoice_number?: string | null;
}

export interface MoveCase {
  id: string;
  address?: string | null;
}

/** "#778", annars fakturanumret, annars förkortat id. */
export function aOrderRef(o: MovableAOrder): string {
  if (o.order_number != null && String(o.order_number).trim()) return `#${o.order_number}`;
  if (o.invoice_number && o.invoice_number.trim()) return o.invoice_number.trim();
  return String(o.id).slice(0, 8);
}

function plainRefs(o: MovableAOrder): string[] {
  const out: string[] = [];
  if (o.invoice_number && o.invoice_number.trim()) out.push(o.invoice_number.trim());
  if (o.order_number != null && String(o.order_number).trim()) out.push(String(o.order_number).trim());
  return out;
}

/**
 * Händelser som skapats av just den här A-ordern: kopplingsraderna
 * ("A-order 778 kopplad…", "A-order 778 kopplad manuellt") och betalraden
 * ("Montörsfaktura X betald …"). Allt annat stannar på ärendet.
 */
export function isAOrderEvent(ev: { event_type?: string | null; description?: string | null }, o: MovableAOrder): boolean {
  const d = String(ev.description ?? '');
  const type = String(ev.event_type ?? '');
  const refs = plainRefs(o);
  if (!refs.length) return false;
  if (type === 'aorder_coupled' || type === 'order_link') {
    return refs.some(r => d.startsWith(`A-order ${r} kopplad`) || d.startsWith(`A-order #${r} kopplad`));
  }
  if (type === 'status_change' && o.invoice_number) {
    return d.startsWith(`Montörsfaktura ${o.invoice_number.trim()} betald`);
  }
  return false;
}

/** Dokument som hör till A-ordern: uppladdad A-orderfaktura med samma fakturanummer. */
export function isAOrderDocument(doc: { doc_type?: string | null; invoice_number?: string | null }, o: MovableAOrder): boolean {
  const inv = (o.invoice_number ?? '').trim();
  return !!inv && doc.doc_type === 'a_order' && (doc.invoice_number ?? '').trim() === inv;
}

export function moveEventTexts(o: MovableAOrder, from: MoveCase, to: MoveCase) {
  const ref = aOrderRef(o);
  return {
    target: `A-order ${ref} flyttad hit från ${from.address || 'annat ärende'}`,
    source: `A-order ${ref} flyttad till ${to.address || 'annat ärende'}`,
  };
}
