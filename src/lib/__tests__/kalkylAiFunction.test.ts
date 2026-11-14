import { describe, it, expect } from 'vitest';
import {
  buildMessages, checkKalkylAiRequest, OPTIONAL_RULE, gatewayErrorCode, KALKYL_AI_LIMITS, KALKYL_AI_MODEL, KALKYL_AI_PROMPTS, parseModelJson, pausesGateway, replyFor, requestUsage, sanitizeAiContext,
} from '../../../supabase/functions/kalkyl-ai/logic';
import { buildAiContext, emptyKalkyl, indexPrices } from '@/lib/kalkyl';
import { seedPriceItems } from './kalkylFixture';

const ctx = () => buildAiContext(emptyKalkyl(), indexPrices(seedPriceItems()));
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

describe('kalkyl-ai: förfrågan', () => {
  it('modellen är den som projektet använder', () => {
    expect(KALKYL_AI_MODEL).toBe('google/gemini-2.5-flash');
  });

  it('tolka: anteckning högst 4 000 tecken, högst fyra JPEG-foton, PDF högst 10 MB och något att tolka', () => {
    expect(checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: 'Golv i köket 4 x 3 m' }).ok).toBe(true);
    expect(checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: 'a'.repeat(4001) })).toMatchObject({ ok: false, code: 'too_large' });
    expect(checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: '', photos: [JPEG, JPEG, JPEG, JPEG, JPEG] })).toMatchObject({ ok: false, code: 'too_large' });
    expect(checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: '', photos: ['data:image/png;base64,AAAA'] })).toMatchObject({ ok: false, code: 'validation' });
    expect(checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: '', photos: [JPEG] }).ok).toBe(true);
    expect(checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: '', pdf: { name: 'ue.pdf', base64: 'A'.repeat(KALKYL_AI_LIMITS.pdfChars + 4) } })).toMatchObject({ ok: false, code: 'too_large' });
    expect(checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: '', pdf: { name: 'ue.pdf', base64: 'JVBERi0xLjQK' } }).ok).toBe(true);
    expect(checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: '   ' })).toMatchObject({ ok: false, code: 'validation' });
  });

  it('fråga högst 1 000 tecken; okänt läge och saknat underlag ger validation; för stort underlag ger too_large', () => {
    expect(checkKalkylAiRequest({ mode: 'fraga', context: ctx(), question: 'Ingår sockel?' }).ok).toBe(true);
    expect(checkKalkylAiRequest({ mode: 'fraga', context: ctx(), question: 'a'.repeat(1001) })).toMatchObject({ ok: false, code: 'too_large' });
    expect(checkKalkylAiRequest({ mode: 'fraga', context: ctx(), question: ' ' })).toMatchObject({ ok: false, code: 'validation' });
    expect(checkKalkylAiRequest({ mode: 'skriv', context: ctx() })).toMatchObject({ ok: false, code: 'validation' });
    expect(checkKalkylAiRequest({ mode: 'granska' })).toMatchObject({ ok: false, code: 'validation' });
    const huge = { ...ctx(), catalog: Array.from({ length: 1500 }, (_, i) => ({ code: `x.${i}`, trade: 'golv', kind: 'material', slot: null, name: 'n'.repeat(290), spec: null, unit: 'st', level: null })) };
    expect(checkKalkylAiRequest({ mode: 'granska', context: huge })).toMatchObject({ ok: false, code: 'too_large' });
  });

  it('underlaget byggs om på servern: kostnad, kunduppgifter och anteckningar försvinner även om klienten skickar dem', () => {
    const raw = {
      customer_name: 'Anna', catalog: [{ code: 'a', trade: 'golv', kind: 'material', slot: null, name: 'A', spec: null, unit: 'st', level: null, cost_ex_vat: 5, price_ex_vat: 9, status: 'utkast' }],
      kalkyl: {
        premises: { house_type: 'villa', build_year: 1970, floors: 1, customer_personnummer: '19800101-1234' },
        rooms: [{ name: 'Kök', length: 4, width: 3, height: 2.4, doors: 1, windows: 1, note: 'x' }],
        rows: [{ id: 'r1', room: 'Kök', type: 'fri', gren: null, title: 'T', note: 'Intern', choices: { cost: 3 }, measure: null,
          lines: [{ description: 'L', code: null, qty: 1, unit: 'st', unit_price: 10, rot_class: 'arbete', cost: 4, hours: 2, price_status: 'utkast' }] }],
      },
    };
    const s = sanitizeAiContext(raw)!;
    const json = JSON.stringify(s);
    for (const k of ['customer', 'cost', 'hours', 'note', 'price_status', 'status', 'price_ex_vat', 'Intern', '19800101']) expect(json, k).not.toContain(k);
    expect(s.kalkyl.rows[0].lines[0]).toEqual({ description: 'L', code: null, qty: 1, unit: 'st', unit_price: 10, rot_class: 'arbete' });
    expect(sanitizeAiContext({ catalog: 'x', kalkyl: {} })).toBeNull();
    expect(sanitizeAiContext({ catalog: [], kalkyl: { rooms: [], rows: [{ id: 'r', type: 'okand', title: 't', lines: [] }] } })).toBeNull();
  });

  it('användningsloggen får tecken, foton och PDF', () => {
    const c = checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: 'abc', photos: [JPEG, JPEG], pdf: { name: 'ue.pdf', base64: 'JVBERi0xLjQK' } });
    if (c.ok === false) throw new Error(c.message);
    const u = requestUsage(c.request);
    expect(u.image_count).toBe(2);
    expect(u.pdf_count).toBe(1);
    expect(u.input_chars).toBeGreaterThan(3);
  });
});

describe('kalkyl-ai: prompter och svar', () => {
  it('systemprompterna är på svenska och säger reglerna uttryckligen', () => {
    for (const p of Object.values(KALKYL_AI_PROMPTS)) {
      expect(p).toContain('Ange aldrig priser eller belopp som inte står i underlaget');
      expect(p).toContain('Hitta inte på mått');
      expect(p).toContain('Använd bara koder som finns i katalogen');
      expect(p).toContain('Svara bara med ett JSON-objekt enligt schemat');
    }
    expect(KALKYL_AI_PROMPTS.granska).toContain('högst åtta');
  });

  it('meddelandena: foton som bilder och UE-offerten som PDF-bilaga', () => {
    const c = checkKalkylAiRequest({ mode: 'tolka', context: ctx(), note: 'Altan 20 m²', photos: [JPEG], pdf: { name: 'ue.pdf', base64: 'JVBERi0xLjQK' } });
    if (c.ok === false) throw new Error(c.message);
    const [system, user] = buildMessages(c.request) as { role: string; content: any }[];
    expect(system.role).toBe('system');
    expect(user.content.map((p: { type: string }) => p.type)).toEqual(['text', 'image_url', 'file']);
    expect(user.content[1].image_url.url).toBe(JPEG);
    expect(user.content[2].file).toEqual({ filename: 'ue.pdf', file_data: 'data:application/pdf;base64,JVBERi0xLjQK' });
    expect(user.content[0].text).toContain('Altan 20 m²');
  });

  it('svaret tolkas som JSON även med kodstaket; annat ger null', () => {
    expect(parseModelJson('```json\n{"answer":"Ja"}\n```')).toEqual({ answer: 'Ja' });
    expect(parseModelJson('Hej')).toBeNull();
    expect(parseModelJson('[1,2]')).toBeNull();
    expect(replyFor('fraga', { answer: 'Ja' })).toEqual({ answer: 'Ja' });
    expect(replyFor('tolka', { rows: [] })).toEqual({ proposal: { rows: [] } });
    expect(replyFor('granska', { observations: [] })).toEqual({ review: { observations: [] } });
  });

  it('gatewayfel: 429 upptaget, 402 krediter och 403 nekad pausar, övrigt tjänstefel', () => {
    expect(gatewayErrorCode(429)).toBe('busy');
    expect(gatewayErrorCode(402)).toBe('credits');
    expect(gatewayErrorCode(403)).toBe('denied');
    expect(gatewayErrorCode(500)).toBe('gateway');
    expect(pausesGateway('credits')).toBe(true);
    expect(pausesGateway('denied')).toBe(true);
    expect(pausesGateway('busy')).toBe(false);
  });
});

describe('kalkyl-ai: modell', () => {
  it('använder ai_settings.model och faller tillbaka på konstanten bara när inställningen saknas eller är ogiltig', async () => {
    const { kalkylAiModel, KALKYL_AI_MODEL: fallback } = await import('../../../supabase/functions/kalkyl-ai/logic');
    expect(kalkylAiModel('google/gemini-3-flash-preview')).toBe('google/gemini-3-flash-preview');
    expect(kalkylAiModel('  openai/gpt-6-astra ')).toBe('openai/gpt-6-astra');
    expect(kalkylAiModel(null)).toBe(fallback);
    expect(kalkylAiModel(undefined)).toBe(fallback);
    expect(kalkylAiModel('')).toBe(fallback);
    expect(kalkylAiModel('inte en modell')).toBe(fallback);
    expect(kalkylAiModel(42)).toBe(fallback);
    expect(fallback).toBe('google/gemini-2.5-flash');
  });
});

describe('kalkyl-ai: tillval', () => {
  const row = (extra: Record<string, unknown>) => ({
    catalog: [], kalkyl: { premises: {}, rooms: [], rows: [{ id: 'r1', room: null, type: 'fri', gren: null, title: 'T', choices: {}, measure: null, lines: [], ...extra }] },
  });

  it('sanitizeAiContext behåller optional: true och ger false när fältet saknas eller har fel typ', () => {
    expect(sanitizeAiContext(row({ optional: true }))!.kalkyl.rows[0].optional).toBe(true);
    expect(sanitizeAiContext(row({}))!.kalkyl.rows[0].optional).toBe(false);
    for (const v of ['true', 1, null, {}, false]) expect(sanitizeAiContext(row({ optional: v }))!.kalkyl.rows[0].optional, String(v)).toBe(false);
  });

  it('en äldre klient utan fältet godtas som förut', () => {
    expect(checkKalkylAiRequest({ mode: 'fraga', context: row({}), question: 'Ingår sockel?' }).ok).toBe(true);
  });

  it('alla tre prompterna innehåller meningen om tillval', () => {
    expect(OPTIONAL_RULE).toBe('Rader med "optional": true är tillval. Säljaren har lagt in dem, men de räknas inte in i offertens summa.');
    for (const p of Object.values(KALKYL_AI_PROMPTS)) expect(p).toContain(OPTIONAL_RULE);
    expect(KALKYL_AI_PROMPTS.tolka).toContain('inte heller sådana som finns som tillval');
    expect(KALKYL_AI_PROMPTS.granska).toContain('Skriv inte att något saknas när det finns som tillval');
    expect(KALKYL_AI_PROMPTS.fraga).toContain('säga att den inte ingår i summan');
  });
});
