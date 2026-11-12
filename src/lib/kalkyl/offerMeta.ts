// Offertens uppgifter som kalkylvyn redigerar (kund, hus, ROT, giltighet) och vad som sparas.
import { ROT_CAP_PER_PERSON } from '@/lib/offerCalc';
import type { KalkylData } from './types';
import { buildOfferPayloadFromKalkyl, defaultOfferTitle, offerScopeText, type KalkylOfferOptions, type KalkylOfferPayload } from './offer';
import type { PriceIndex } from './prices';
import type { KalkylSettings } from './types';
import { emptyKalkyl } from './kalkyl';

export interface OfferMeta {
  customer_type: 'privat' | 'foretag';
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  customer_personnummer: string;
  fastighetsbeteckning: string;
  vat_mode: 'vanlig' | 'omvand';
  rot_enabled: boolean;
  rot_percent: number;
  rot_persons: number;
  rot_cap_per_person: number;
  rot_used: number;
  valid_until: string;
  handpenning_percent: number;
  title: string;
  description: string;
}

const addDays = (from: Date, days: number) => {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

type OfferLike = Record<string, unknown> | null | undefined;
const str = (v: unknown) => (v == null ? '' : String(v));
const numOr = (v: unknown, d: number) => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? d : x; };

export function offerMetaFromRow(offer: OfferLike, today: Date = new Date()): OfferMeta {
  const o = offer ?? {};
  return {
    customer_type: o.customer_type === 'foretag' ? 'foretag' : 'privat',
    customer_name: str(o.customer_name),
    customer_email: str(o.customer_email),
    customer_phone: str(o.customer_phone),
    customer_address: str(o.customer_address),
    customer_personnummer: str(o.customer_personnummer),
    fastighetsbeteckning: str(o.fastighetsbeteckning),
    vat_mode: o.vat_mode === 'omvand' ? 'omvand' : 'vanlig',
    rot_enabled: offer ? !!o.rot_enabled : true,
    rot_percent: numOr(o.rot_percent, 30),
    rot_persons: Math.max(1, Math.floor(numOr(o.rot_persons, 1))),
    rot_cap_per_person: numOr(o.rot_cap_per_person, ROT_CAP_PER_PERSON),
    rot_used: Math.max(0, numOr(o.rot_used, 0)),
    valid_until: str(o.valid_until) || addDays(today, 30),
    handpenning_percent: numOr(o.handpenning_percent, 25),
    title: str(o.title),
    description: str(o.description),
  };
}

/** Kalkyldata från en sparad offert; okänd eller saknad version ger en tom kalkyl. */
export function kalkylFromRow(offer: OfferLike): KalkylData {
  const raw = offer?.calc_data as KalkylData | null | undefined;
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return emptyKalkyl();
  const base = emptyKalkyl();
  return {
    ...base,
    ...raw,
    premises: { ...base.premises, ...(raw.premises ?? {}) },
    rooms: raw.rooms ?? [],
    rows: raw.rows ?? [],
    common: raw.common ?? [],
    adjustments: raw.adjustments ?? [],
  };
}

/** ROT bara för privatkund med vanlig moms. */
export function offerOptions(meta: OfferMeta): KalkylOfferOptions {
  return {
    vat_mode: meta.vat_mode,
    rot_enabled: meta.customer_type === 'privat' && meta.vat_mode === 'vanlig' && meta.rot_enabled,
    rot_percent: meta.rot_percent,
    rot_persons: meta.rot_persons,
    rot_cap_per_person: meta.rot_cap_per_person,
    rot_used: meta.rot_used,
    handpenning_percent: meta.handpenning_percent,
  };
}

export type MetaError = 'namn_saknas';
export const validateMeta = (meta: OfferMeta): MetaError[] => (meta.customer_name.trim() ? [] : ['namn_saknas']);

export interface KalkylSaveFields extends KalkylOfferPayload {
  customer_type: 'privat' | 'foretag';
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_personnummer: string | null;
  fastighetsbeteckning: string | null;
  vat_mode: 'vanlig' | 'omvand';
  vat_rate: number;
  rot_enabled: boolean;
  rot_percent: number;
  rot_persons: number;
  rot_cap_per_person: number;
  rot_used: number;
  valid_until: string | null;
  handpenning_percent: number;
  title: string;
  description: string | null;
}

/**
 * Fälten som "Spara" och "Klar" skriver: kalkylens offertrader och totaler plus kund, ROT och giltighet.
 * Tom titel fylls från defaultOfferTitle, tom beskrivning från offerScopeText.
 */
export function kalkylSaveFields(meta: OfferMeta, data: KalkylData, prices: PriceIndex, settings: KalkylSettings): KalkylSaveFields {
  const opts = offerOptions(meta);
  const privat = meta.customer_type === 'privat';
  const nil = (v: string) => (v.trim() ? v.trim() : null);
  return {
    ...buildOfferPayloadFromKalkyl(data, opts),
    customer_type: meta.customer_type,
    customer_name: nil(meta.customer_name),
    customer_email: nil(meta.customer_email),
    customer_phone: nil(meta.customer_phone),
    customer_address: nil(meta.customer_address),
    customer_personnummer: privat ? nil(meta.customer_personnummer) : null,
    fastighetsbeteckning: privat ? nil(meta.fastighetsbeteckning) : null,
    vat_mode: meta.vat_mode,
    vat_rate: 25,
    rot_enabled: opts.rot_enabled,
    rot_percent: meta.rot_percent,
    rot_persons: meta.rot_persons,
    rot_cap_per_person: meta.rot_cap_per_person,
    rot_used: meta.rot_used,
    valid_until: meta.valid_until || null,
    handpenning_percent: meta.handpenning_percent,
    title: meta.title.trim() || defaultOfferTitle(data),
    description: meta.description.trim() ? meta.description : (offerScopeText(data, prices, settings) || null),
  };
}

export type OfferEditMode = 'edit' | 'sent' | 'readonly';
/** Accepterad offert öppnas skrivskyddad; skickad går att ändra med en upplysning. */
export const offerEditMode = (status: string | null | undefined): OfferEditMode =>
  status === 'accepted' ? 'readonly' : status === 'sent' ? 'sent' : 'edit';
