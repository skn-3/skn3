// Kön "Att boka": hjälptexter, sökning, sidor och chips. Ren logik.
import type { QueueItem, QueueName, Queues } from './queues';
import { firstName } from './labels';

export const QUEUE_PAGE = 20;

export const QUEUE_HELP: Record<QueueName, string> = {
  km: 'Väntar på kontrollmätning, äldst först. Välj ett ärende och tryck sedan på en dag i schemat.',
  montage: 'Godkända ärenden utan montagedatum. Dagar före leveransen går inte att välja.',
  datum: 'Står som Montage bokat eller pågår men saknar datum. Sätt dagen här.',
};

export const QUEUE_LABELS: Record<QueueName, string> = { km: 'KM', montage: 'Montage', datum: 'Saknar datum' };

export function queueTotal(q: Queues): number {
  return q.km.length + q.montage.length + q.datum.length;
}

/** Filtrerar på adress, ort eller kund (skiftlägesokänsligt). */
export function searchQueue(items: readonly QueueItem[], query: string): QueueItem[] {
  const q = query.trim().toLocaleLowerCase('sv');
  if (!q) return [...items];
  return items.filter(i => [i.address, i.city, i.customerName].some(v => (v ?? '').toLocaleLowerCase('sv').includes(q)));
}

/** "Västerås · säljare Daniel" (delar som saknas utelämnas). */
export function queueCardMeta(item: Pick<QueueItem, 'city' | 'seller'>): string {
  const seller = firstName(item.seller);
  return [item.city, seller ? `säljare ${seller}` : null].filter(Boolean).join(' · ');
}

export function waitLabel(days: number): string {
  return `Väntat ${days} ${days === 1 ? 'dag' : 'dagar'}`;
}

/** Guld från 14 dagars väntan, annars dämpad. */
export function waitIsLong(days: number): boolean {
  return days >= 14;
}

export function moreLabel(remaining: number): string {
  return `Visa fler (${remaining})`;
}
