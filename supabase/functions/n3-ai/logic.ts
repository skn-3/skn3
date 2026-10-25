export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAiReply(text: string) {
  const ids: string[] = [];
  const reply = text.replace(/\[\[case:([^\]]+)\]\]/g, (_, id: string) => { if (UUID.test(id) && !ids.includes(id.toLowerCase()) && ids.length < 3) ids.push(id.toLowerCase()); return ''; }).trim();
  return { reply, case_ids: ids };
}
export function stockholmDate(now = new Date()) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function stockholmMidnight(now = new Date()) {
  const day = stockholmDate(now); const target = new Date(day + 'T00:00:00Z').getTime();
  let instant = target;
  for (let i=0;i<3;i++) {
    const parts = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
    const v = Object.fromEntries(parts.map(p => [p.type,p.value]));
    const local = Date.UTC(Number(v.year),Number(v.month)-1,Number(v.day),Number(v.hour),Number(v.minute),Number(v.second));
    instant += target-local;
  }
  return new Date(instant).toISOString();
}
export type AiScope = 'today' | 'week' | 'upcoming' | 'active';
export function scopeInterval(scope: AiScope, now = new Date()) {
  const d = new Date(stockholmDate(now) + 'T12:00:00Z'); const add = (n: number) => new Date(d.getTime()+n*86400000).toISOString().slice(0,10);
  if (scope === 'active') return null;
  if (scope === 'week') { const monday = -((d.getUTCDay()+6)%7); return { start: add(monday), end: add(monday+6) }; }
  return { start: add(0), end: add(scope === 'upcoming' ? 13 : 0) };
}
export function isoWeek(now = new Date()) { const d = new Date(stockholmDate(now)+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7)); return Math.ceil(((d.getTime()-new Date(Date.UTC(d.getUTCFullYear(),0,1,12)).getTime())/86400000+1)/7); }
export function dailyLimitReached(count: number, limit = 40) { return count >= limit; }
export function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== null && v !== undefined && v !== '').map(([k,v]) => [k,compact(v)]));
  return value;
}
export function boundedResult(value: unknown) {
  const text = JSON.stringify(compact(value));
  if (text.length <= 8000) return JSON.parse(text);
  let length = 7900;
  while (length > 0) {
    const result = { truncated: true, data: text.slice(0, length) };
    if (JSON.stringify(result).length <= 8000) return result;
    length = Math.floor(length * 0.8);
  }
  return { truncated: true };
}
