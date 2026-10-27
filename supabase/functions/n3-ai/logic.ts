export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function interpretVoiceDecision(text: string): 'confirm' | 'cancel' | null {
  const normalized = text.toLocaleLowerCase('sv-SE').trim().replace(/[.!?]+$/g, '').trim().replace(/\s+/g, ' ');
  if (['ja','ja kör','kör','okej','bekräfta','gör det','stämmer','ja tack','japp','jo','ja gör det','kör på','kör bara','det stämmer','ja det stämmer','okej kör','bekräftar'].includes(normalized)) return 'confirm';
  if (['nej','avbryt','vänta','nix','ta bort','nej tack','nej vänta','avbryt det','glöm det','nej avbryt'].includes(normalized)) return 'cancel';
  return null;
}
export function speechText(text: string): string {
  const clean = text.replace(/\[\[(?:case|link):[^\]]*\]\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '')
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, 'ärendet')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, '').replace(/[#*_`~>]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 600) return clean;
  const prefix = clean.slice(0, 600);
  const ends = [...prefix.matchAll(/[.!?](?=\s|$)/g)];
  const last = ends.at(-1)?.index;
  return last !== undefined ? prefix.slice(0, last + 1) : prefix.slice(0, prefix.lastIndexOf(' ')).trim();
}
export function parseAiReply(text: string) {
  const ids: string[] = [];
  const links:{path:string;label:string}[]=[];
  const reply = text.replace(/\[\[case:([^\]]+)\]\]/g, (_, id: string) => { if (UUID.test(id) && !ids.includes(id.toLowerCase()) && ids.length < 3) ids.push(id.toLowerCase()); return ''; }).replace(/\[\[link:([^|\]]+)\|([^\]]+)\]\]/g,(_,path:string,label:string)=>{if(isAiLinkPath(path)&&label.trim()&&label.length<=100&&!links.some(l=>l.path===path)&&links.length<3)links.push({path,label:label.trim()});return '';}).trim();
  return { reply, case_ids: ids, links };
}
export function isAiLinkPath(path:string){const id='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';return new RegExp(`^(?:/\\?case=${id}(?:&section=km)?|/case/${id}/sheet-metal-order)$`,'i').test(path);}
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
export const VOICE_TERMS = ['Mockfjärds','N3prenad','littera','foder','smyg','fönsterbänk','kontrollmätning','KM','montage','plåtbeställning','avvikelse','delrapport','Kundportalen','KP'];
export function buildVocabularyHint(activeCases: { address?: string | null; city?: string | null; customer_name?: string | null }[], maxChars = 800) {
  const terms = [...VOICE_TERMS];
  for (const c of activeCases) for (const value of [c.address, c.city, c.customer_name]) {
    const term = (value ?? '').trim();
    if (term && !terms.some(t => t.toLowerCase() === term.toLowerCase())) terms.push(term);
  }
  let hint = terms.join(', ');
  while (hint.length > maxChars) {
    const cut = hint.lastIndexOf(',', maxChars);
    if (cut <= 0) return hint.slice(0, maxChars);
    hint = hint.slice(0, cut);
  }
  return hint;
}
export const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
export function pickAudioMimeType(isSupported: (type: string) => boolean) {
  return AUDIO_MIME_CANDIDATES.find(isSupported) ?? null;
}
export const MAX_AUDIO_SECONDS = 60;
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const DAILY_TRANSCRIBE_LIMIT = 150;
export function validateTranscribeAudio(sizeBytes: number, durationSeconds: number): string | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_AUDIO_SECONDS) return 'Inspelningen får vara högst 60 sekunder.';
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_AUDIO_BYTES) return 'Ljudfilen får vara högst 2 MB.';
  return null;
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
