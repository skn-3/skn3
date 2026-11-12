// Ren logik för kalkyl-ai: gränser, sanering av underlaget, prompter, svarstolkning och felkoder.
// Inga importer, så modulen testas med vitest och återanvänds av klienten (src/lib/kalkyl/ai.ts).

export const KALKYL_AI_MODEL = 'google/gemini-2.5-flash';
export const KALKYL_AI_MODES = ['tolka', 'granska', 'fraga'] as const;
export type KalkylAiMode = (typeof KALKYL_AI_MODES)[number];

export const KALKYL_AI_LIMITS = {
  note: 4000,
  question: 1000,
  photos: 4,
  photoPx: 1600,
  /** Base64-tecken per foto (cirka 2,2 MB JPEG). */
  photoChars: 3_000_000,
  pdfBytes: 10 * 1024 * 1024,
  /** Base64-tecken för en PDF på 10 MB. */
  pdfChars: Math.ceil((10 * 1024 * 1024) / 3) * 4,
  /** Underlaget som JSON, tecken. */
  context: 400_000,
  catalog: 2000,
  rooms: 100,
  rows: 200,
  lines: 300,
  kontroller: 100,
  text: 500,
} as const;

export type KalkylAiErrorCode =
  | 'validation' | 'too_large' | 'unauthorized' | 'forbidden' | 'limit' | 'disabled' | 'paused'
  | 'busy' | 'credits' | 'denied' | 'gateway' | 'invalid_reply' | 'configuration';

export const KALKYL_AI_ERRORS: Record<KalkylAiErrorCode, { status: number; message: string }> = {
  validation: { status: 400, message: 'Förfrågan till AI-kontrollen är ogiltig.' },
  too_large: { status: 413, message: 'Underlaget är för stort för AI-kontrollen.' },
  unauthorized: { status: 401, message: 'Du måste vara inloggad.' },
  forbidden: { status: 403, message: 'AI-kontrollen är bara för personal med tillgång till offerter.' },
  limit: { status: 429, message: 'Dagens gräns för AI-anrop är nådd.' },
  disabled: { status: 503, message: 'AI-funktionerna är avstängda just nu.' },
  paused: { status: 503, message: 'AI-funktionerna är pausade. Säg till administratören.' },
  busy: { status: 503, message: 'AI-tjänsten har många frågor just nu. Försök igen om en stund.' },
  credits: { status: 402, message: 'AI-krediterna är slut. Säg till administratören.' },
  denied: { status: 403, message: 'AI-tjänsten nekade anropet. Säg till administratören.' },
  gateway: { status: 502, message: 'AI-tjänsten svarade inte. Försök igen.' },
  invalid_reply: { status: 502, message: 'AI-tjänsten svarade inte. Försök igen.' },
  configuration: { status: 500, message: 'AI-kontrollen saknar inställningar.' },
};

/** Felkod för ett misslyckat svar från AI-gatewayen. 402/403 pausar alla AI-anrop tills administratören återställer. */
export function gatewayErrorCode(status: number): KalkylAiErrorCode {
  if (status === 429) return 'busy';
  if (status === 402) return 'credits';
  if (status === 403) return 'denied';
  return 'gateway';
}
export const pausesGateway = (code: KalkylAiErrorCode) => code === 'credits' || code === 'denied';

// ── Underlaget ────────────────────────────────────────────────────────────────

export interface AiCatalogItem { code: string; trade: string; kind: string; slot: string | null; name: string; spec: string | null; unit: string; level: string | null }
export interface AiContextRoom { name: string; length: number; width: number; height: number; doors: number; windows: number }
export interface AiContextLine { description: string; code: string | null; qty: number; unit: string; unit_price: number | null; rot_class: string }
export interface AiContextChoices {
  material_code?: string | null; material?: string | null; options?: string[]; products?: Record<string, string>;
  underarbete?: string | null; tak?: boolean; snickerier?: boolean; coats?: number | null;
  kulorer?: { vagg?: string | null; tak?: string | null; snickerier?: string | null };
}
export interface AiContextRow {
  id: string; room: string | null; type: 'golv' | 'malning' | 'gren' | 'fri'; gren: string | null; title: string;
  choices: AiContextChoices; measure: { area: number | null; length: number | null } | null; lines: AiContextLine[];
}
export interface AiContext {
  catalog: AiCatalogItem[];
  kalkyl: { premises: { house_type: string | null; build_year: number | null; floors: number | null }; rooms: AiContextRoom[]; rows: AiContextRow[] };
}

class Invalid extends Error {}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number = KALKYL_AI_LIMITS.text): string => {
  if (typeof v !== 'string') throw new Invalid('text');
  return v.slice(0, max);
};
const strN = (v: unknown, max: number = KALKYL_AI_LIMITS.text): string | null => (v == null ? null : str(v, max));
const num = (v: unknown): number => {
  const n = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(n)) throw new Invalid('tal');
  return n;
};
const numN = (v: unknown): number | null => (v == null ? null : num(v));
const arr = <T>(v: unknown, max: number, fn: (x: unknown) => T): T[] => {
  if (!Array.isArray(v)) throw new Invalid('lista');
  if (v.length > max) throw new Invalid('för många');
  return v.map(fn);
};

function sanitizeChoices(raw: unknown): AiContextChoices {
  if (!isObj(raw)) return {};
  const out: AiContextChoices = {};
  if ('material_code' in raw) out.material_code = strN(raw.material_code, 120);
  if ('material' in raw) out.material = strN(raw.material, 300);
  if (Array.isArray(raw.options)) out.options = raw.options.filter((x): x is string => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 40));
  if (isObj(raw.products)) {
    out.products = {};
    for (const [k, v] of Object.entries(raw.products).slice(0, 20)) if (typeof v === 'string') out.products[k.slice(0, 60)] = v.slice(0, 120);
  }
  if ('underarbete' in raw) out.underarbete = strN(raw.underarbete, 20);
  if (typeof raw.tak === 'boolean') out.tak = raw.tak;
  if (typeof raw.snickerier === 'boolean') out.snickerier = raw.snickerier;
  if ('coats' in raw) out.coats = numN(raw.coats);
  if (isObj(raw.kulorer)) out.kulorer = { vagg: strN(raw.kulorer.vagg ?? null, 120), tak: strN(raw.kulorer.tak ?? null, 120), snickerier: strN(raw.kulorer.snickerier ?? null, 120) };
  return out;
}

/**
 * Bygger om underlaget med bara kända nycklar och rätt typer. Allt annat (kostnad, timmar, kunduppgifter,
 * anteckningar, prisstatus) försvinner även om klienten skulle skicka det. Fel form eller för stort ger null.
 */
export function sanitizeAiContext(raw: unknown): AiContext | null {
  try {
    if (!isObj(raw) || !isObj(raw.kalkyl)) return null;
    const L = KALKYL_AI_LIMITS;
    const catalog = arr(raw.catalog, L.catalog, x => {
      if (!isObj(x)) throw new Invalid('katalog');
      return { code: str(x.code, 120), trade: str(x.trade, 40), kind: str(x.kind, 40), slot: strN(x.slot, 60), name: str(x.name, 300), spec: strN(x.spec, 300), unit: str(x.unit, 20), level: strN(x.level, 20) };
    });
    const k = raw.kalkyl;
    const p = isObj(k.premises) ? k.premises : {};
    const rooms = arr(k.rooms, L.rooms, x => {
      if (!isObj(x)) throw new Invalid('rum');
      return { name: str(x.name, 120), length: num(x.length), width: num(x.width), height: num(x.height), doors: num(x.doors), windows: num(x.windows) };
    });
    const rows = arr(k.rows, L.rows, x => {
      if (!isObj(x)) throw new Invalid('rad');
      const type = x.type;
      if (type !== 'golv' && type !== 'malning' && type !== 'gren' && type !== 'fri') throw new Invalid('typ');
      const m = isObj(x.measure) ? { area: numN(x.measure.area ?? null), length: numN(x.measure.length ?? null) } : null;
      return {
        id: str(x.id, 120), room: strN(x.room, 120), type, gren: strN(x.gren, 40), title: str(x.title, 300), choices: sanitizeChoices(x.choices), measure: m,
        lines: arr(x.lines, L.lines, l => {
          if (!isObj(l)) throw new Invalid('kalkylrad');
          return { description: str(l.description, 300), code: strN(l.code, 120), qty: num(l.qty), unit: str(l.unit, 20), unit_price: numN(l.unit_price), rot_class: str(l.rot_class, 20) };
        }),
      } as AiContextRow;
    });
    const ctx: AiContext = {
      catalog,
      kalkyl: { premises: { house_type: strN(p.house_type ?? null, 40), build_year: numN(p.build_year ?? null), floors: numN(p.floors ?? null) }, rooms, rows },
    };
    return JSON.stringify(ctx).length > L.context ? null : ctx;
  } catch {
    return null;
  }
}

// ── Förfrågan ────────────────────────────────────────────────────────────────

export type KalkylAiRequest =
  | { mode: 'tolka'; context: AiContext; note: string; photos: string[]; pdf: { name: string; base64: string } | null }
  | { mode: 'granska'; context: AiContext; kontroller: { id: string; title: string }[] }
  | { mode: 'fraga'; context: AiContext; question: string };

export type RequestCheck = { ok: true; request: KalkylAiRequest } | { ok: false; code: 'validation' | 'too_large'; message: string };

const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const B64_RE = /^[A-Za-z0-9+/]+=*$/;

/** Kontrollerar förfrågan: läge, längder, antal foton, PDF-storlek och underlaget. */
export function checkKalkylAiRequest(body: unknown): RequestCheck {
  const L = KALKYL_AI_LIMITS;
  const bad = (message: string): RequestCheck => ({ ok: false, code: 'validation', message });
  const big = (message: string): RequestCheck => ({ ok: false, code: 'too_large', message });
  if (!isObj(body) || !(KALKYL_AI_MODES as readonly unknown[]).includes(body.mode)) return bad('Okänt läge för AI-kontrollen.');
  if (!isObj(body.context)) return bad('Underlaget saknas.');
  if (JSON.stringify(body.context).length > L.context) return big('Kalkylen är för stor för AI-kontrollen.');
  const context = sanitizeAiContext(body.context);
  if (!context) return bad('Underlaget är ogiltigt.');
  if (body.mode === 'tolka') {
    const note = typeof body.note === 'string' ? body.note : '';
    if (note.length > L.note) return big(`Anteckningen får vara högst ${L.note} tecken.`);
    const photos = body.photos == null ? [] : body.photos;
    if (!Array.isArray(photos) || photos.some(x => typeof x !== 'string')) return bad('Fotona är ogiltiga.');
    if (photos.length > L.photos) return big(`Högst ${L.photos} foton.`);
    if ((photos as string[]).some(x => x.length > L.photoChars)) return big('Ett foto är för stort.');
    if (!(photos as string[]).every(x => PHOTO_RE.test(x))) return bad('Fotona måste vara JPEG.');
    let pdf: { name: string; base64: string } | null = null;
    if (body.pdf != null) {
      if (!isObj(body.pdf) || typeof body.pdf.base64 !== 'string' || !body.pdf.base64) return bad('UE-offerten är ogiltig.');
      if (body.pdf.base64.length > L.pdfChars) return big('UE-offerten får vara högst 10 MB.');
      if (!B64_RE.test(body.pdf.base64)) return bad('UE-offerten är ogiltig.');
      const name = typeof body.pdf.name === 'string' && body.pdf.name.trim() ? body.pdf.name.trim().slice(0, 200) : 'ue-offert.pdf';
      pdf = { name, base64: body.pdf.base64 };
    }
    if (!note.trim() && photos.length === 0 && !pdf) return bad('Skriv en anteckning eller lägg till ett foto eller en UE-offert.');
    return { ok: true, request: { mode: 'tolka', context, note: note.trim(), photos: photos as string[], pdf } };
  }
  if (body.mode === 'granska') {
    const raw = body.kontroller == null ? [] : body.kontroller;
    if (!Array.isArray(raw) || raw.length > L.kontroller) return bad('Kontrollerna är ogiltiga.');
    const kontroller = raw.filter(isObj).map(k => ({ id: String(k.id ?? '').slice(0, 200), title: String(k.title ?? '').slice(0, 300) })).filter(k => k.id);
    return { ok: true, request: { mode: 'granska', context, kontroller } };
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return bad('Skriv en fråga.');
  if (question.length > L.question) return big(`Frågan får vara högst ${L.question} tecken.`);
  return { ok: true, request: { mode: 'fraga', context, question } };
}

/** Antal tecken och bilagor för användningsloggen. */
export function requestUsage(req: KalkylAiRequest): { input_chars: number; image_count: number; pdf_count: number } {
  const text = req.mode === 'tolka' ? req.note : req.mode === 'fraga' ? req.question : '';
  return {
    input_chars: text.length + JSON.stringify(req.context).length,
    image_count: req.mode === 'tolka' ? req.photos.length : 0,
    pdf_count: req.mode === 'tolka' && req.pdf ? 1 : 0,
  };
}

// ── Prompter ─────────────────────────────────────────────────────────────────

const RULES = `Regler som alltid gäller:
- Ange aldrig priser eller belopp som inte står i underlaget. Sätt aldrig ett pris själv.
- Hitta inte på mått. Mått som inte står i underlaget anges som null.
- Använd bara koder som finns i katalogen ("catalog"). Finns ingen passande kod: lämna koden null eller använd en egen rad utan kod.
- Svara bara med ett JSON-objekt enligt schemat nedan. Ingen annan text, ingen markdown.
- Skriv all text på svenska, kort och sakligt.`;

const TOLKA_SCHEMA = `{"rooms":[{"name":string,"length":number|null,"width":number|null,"height":number|null,"doors":number|null,"windows":number|null}],
"rows":[
 {"kind":"golv","room":string,"material_code":string|null,"options":{"underlag":boolean,"sockel":boolean,"troskel":boolean,"rivning":boolean,"flytspackling":boolean,"mobelflytt":boolean,"bortforsling":boolean},"products":{"golv.underlag"|"golv.sockel"|"golv.troskel":string},"reason":string},
 {"kind":"malning","room":string,"underarbete":"latt"|"normal"|"omfattande"|null,"tak":boolean|null,"snickerier":boolean|null,"kulor_vagg":string|null,"kulor_tak":string|null,"kulor_snickerier":string|null,"products":{"malning.vaggfarg"|"malning.takfarg"|"malning.snickerifarg":string},"reason":string},
 {"kind":"gren","gren":"fasad"|"tak"|"altan"|"mark"|"el"|"badrum"|"kok"|"renovering","room":string|null,"title":string,"area":number|null,"length":number|null,"items":[{"code":string,"name":string,"qty":number,"unit":string}],"reason":string},
 {"kind":"fri","room":string|null,"title":string,"lines":[{"description":string,"qty":number,"unit":string,"rot_class":"arbete"|"material"|"ovrigt"}],"reason":string}
],
"questions":[string]}`;

export const KALKYL_AI_PROMPTS: Record<KalkylAiMode, string> = {
  tolka: `Du hjälper en säljare på SmartKlimat N3prenad att göra en entreprenadkalkyl. Du får säljarens anteckning från platsbesöket, eventuellt foton och en offert från en underentreprenör (UE), samt underlaget: katalogen över prislistans rader (utan priser) och kalkylen som den ser ut nu.
Gör ett förslag på rum och kalkylrader för det som underlaget beskriver. Föreslå inte rader som redan finns i kalkylen. Golv och målning hör alltid till ett rum. Grenrader (fasad, tak, altan, mark, el, badrum, kök, renovering) har prisrader ur grenens katalog med mängd. Det som inte passar någon annan typ blir en fri rad med egna rader (mängd och enhet, utan pris).
Golvmaterial väljs bland katalogens rader med slot "golv.golvtyp". Kulörer anges som kod, till exempel "NCS S 0502-Y" eller "RAL 9010", bara när de nämns.
Varje rad har "reason": en kort förklaring av vad i underlaget raden bygger på.
Lägg korta frågor i "questions" om sådant som saknas eller är oklart, till exempel "Takhöjden saknas för vardagsrummet".
${RULES}
Schema:
${TOLKA_SCHEMA}`,
  granska: `Du granskar en entreprenadkalkyl för en säljare på SmartKlimat N3prenad. Du får underlaget (katalogen utan priser och kalkylen) och de kontroller som reglerna redan har utlöst.
Ge högst åtta iakttagelser som reglerna inte redan har sagt: något som brukar ingå men saknas, en mängd som inte hänger ihop med rummets mått, två rader som överlappar. Upprepa inte de utlösta kontrollerna. Inga iakttagelser är ett bra svar när kalkylen ser rimlig ut.
Varje iakttagelse gäller en rad i kalkylen ("row_id" är radens id). Ett förslag är antingen att lägga till en prisrad ur katalogen med mängd, eller att öppna raden, eller null.
${RULES}
Schema:
{"observations":[{"title":string,"text":string,"row_id":string,"suggestion":{"type":"add_line","code":string,"qty":number}|{"type":"open_row"}|null}]}`,
  fraga: `Du svarar på en säljares fråga om en offert hos SmartKlimat N3prenad. Svaret bygger bara på underlaget: kalkylen och katalogen. Kan frågan inte besvaras från underlaget, säg det. Svara kort på svenska, högst några meningar.
${RULES}
Schema:
{"answer":string}`,
};

/** Meddelandena till gatewayen (Chat Completions). Foton och PDF skickas som bilagor och sparas inte. */
export function buildMessages(req: KalkylAiRequest): unknown[] {
  const underlag = `Underlag (JSON):\n${JSON.stringify(req.context)}`;
  let text: string;
  if (req.mode === 'tolka') text = `${underlag}\n\nAnteckning från platsbesöket:\n${req.note || '(ingen anteckning)'}\n\nAntal foton: ${req.photos.length}. UE-offert bifogad: ${req.pdf ? 'ja' : 'nej'}.`;
  else if (req.mode === 'granska') text = `${underlag}\n\nUtlösta kontroller (JSON):\n${JSON.stringify(req.kontroller)}`;
  else text = `${underlag}\n\nFråga:\n${req.question}`;
  const content: unknown[] = [{ type: 'text', text }];
  if (req.mode === 'tolka') {
    for (const url of req.photos) content.push({ type: 'image_url', image_url: { url } });
    if (req.pdf) content.push({ type: 'file', file: { filename: req.pdf.name, file_data: `data:application/pdf;base64,${req.pdf.base64}` } });
  }
  return [{ role: 'system', content: KALKYL_AI_PROMPTS[req.mode] }, { role: 'user', content }];
}

/** Tolkar modellens text som JSON-objekt (tar bort eventuella kodstaket). Null när det inte går. */
export function parseModelJson(content: unknown): Record<string, unknown> | null {
  if (typeof content !== 'string') return null;
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const v = JSON.parse(cleaned);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

/** Svaret till klienten per läge. Klienten validerar alltid själv mot prislistan och kalkylen. */
export function replyFor(mode: KalkylAiMode, parsed: Record<string, unknown>): Record<string, unknown> {
  if (mode === 'tolka') return { proposal: parsed };
  if (mode === 'granska') return { review: parsed };
  return { answer: typeof parsed.answer === 'string' ? parsed.answer.slice(0, 4000) : '' };
}
