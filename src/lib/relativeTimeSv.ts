export function relativeTimeSv(date: string | Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 60000));
  if (!Number.isFinite(minutes) || minutes < 1) return 'just nu';
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'igår' : `${days} dagar sedan`;
}