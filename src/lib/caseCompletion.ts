import { SELLER_PIPELINE_COLUMNS } from '@/lib/constants';

/** Statusar från och med km_klar (pausad räknas inte). */
const FROM_KM_KLAR = SELLER_PIPELINE_COLUMNS.slice(
  SELLER_PIPELINE_COLUMNS.indexOf('km_klar'),
  SELLER_PIPELINE_COLUMNS.indexOf('fakturerad') + 1,
) as readonly string[];

/** Säljaren ska komplettera ärendet: km_klar eller senare och inget ordervärde. */
export function needsCompletion(c: { status: string; order_value: number | string | null | undefined }): boolean {
  return FROM_KM_KLAR.includes(c.status) && (c.order_value == null || c.order_value === '');
}

// Pipelinekortets knapp ber panelen öppna steget direkt när den monteras.
let pendingCompletionCaseId: string | null = null;
export function requestCompletionOnOpen(caseId: string) {
  pendingCompletionCaseId = caseId;
}
export function consumeCompletionRequest(caseId: string): boolean {
  if (pendingCompletionCaseId !== caseId) return false;
  pendingCompletionCaseId = null;
  return true;
}
