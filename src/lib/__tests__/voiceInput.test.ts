import { describe, it, expect } from 'vitest';
import { pickAudioMimeType, buildVocabularyHint, validateTranscribeAudio, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, VOICE_TERMS } from '../../../supabase/functions/n3-ai/logic';

describe('röstinmatning: mime-val', () => {
  it('väljer första stödda formatet i prioritetsordning', () => {
    expect(pickAudioMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickAudioMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickAudioMimeType((t) => t.startsWith('audio/ogg'))).toBe('audio/ogg');
  });
  it('ger null när inget format stöds', () => {
    expect(pickAudioMimeType(() => false)).toBeNull();
  });
});

describe('röstinmatning: vokabularhint', () => {
  it('innehåller de fasta termerna', () => {
    const hint = buildVocabularyHint([]);
    for (const term of VOICE_TERMS) expect(hint).toContain(term);
  });
  it('lägger till adress, ort och kundnamn utan dubbletter', () => {
    const hint = buildVocabularyHint([
      { address: 'Storgatan 1', city: 'Visby', customer_name: 'Anna Andersson' },
      { address: 'storgatan 1', city: 'Visby', customer_name: 'Anna Andersson' },
      { address: '  ', city: null, customer_name: undefined },
    ]);
    expect(hint).toContain('Storgatan 1');
    expect(hint).toContain('Visby');
    expect(hint).toContain('Anna Andersson');
    expect(hint.toLowerCase().split('storgatan 1').length - 1).toBe(1);
    expect(hint.split('Visby').length - 1).toBe(1);
  });
  it('håller sig inom längdgränsen och bryter vid kommatecken', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      address: `Väldigt Lång Adressvägen Nummer ${i} i Förorten`,
      city: `Ort ${i}`,
      customer_name: `Kund Personsson Nummer ${i}`,
    }));
    const hint = buildVocabularyHint(many);
    expect(hint.length).toBeLessThanOrEqual(800);
    expect(hint.endsWith(',')).toBe(false);
    const capped = buildVocabularyHint([{ address: 'x'.repeat(900) }]);
    expect(capped.length).toBeLessThanOrEqual(800);
  });
});

describe('röstinmatning: storleks- och längdkontroll', () => {
  it('godkänner ljud inom gränserna', () => {
    expect(validateTranscribeAudio(1000, 5)).toBeNull();
    expect(validateTranscribeAudio(MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS)).toBeNull();
  });
  it('avvisar ljud längre än 60 sekunder', () => {
    expect(validateTranscribeAudio(1000, 61)).toBe('Inspelningen får vara högst 60 sekunder.');
  });
  it('avvisar ljud större än 2 MB', () => {
    expect(validateTranscribeAudio(MAX_AUDIO_BYTES + 1, 10)).toBe('Ljudfilen får vara högst 2 MB.');
  });
  it('avvisar tomma eller ogiltiga värden', () => {
    expect(validateTranscribeAudio(0, 10)).not.toBeNull();
    expect(validateTranscribeAudio(1000, 0)).not.toBeNull();
    expect(validateTranscribeAudio(1000, Number.NaN)).not.toBeNull();
  });
});
