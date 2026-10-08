import { describe, it, expect } from 'vitest';
import { parseRichText, stripRichText, toggleRichMarker, hasRichMarkup } from '../richText';

describe('parseRichText', () => {
  it('parsar fet och röd', () => {
    expect(parseRichText('Ring **kund** innan ==montage==')).toEqual([[
      { text: 'Ring ', bold: false, red: false },
      { text: 'kund', bold: true, red: false },
      { text: ' innan ', bold: false, red: false },
      { text: 'montage', bold: false, red: true },
    ]]);
  });

  it('kombinerar fet och röd', () => {
    expect(parseRichText('**==OBS==**')).toEqual([[{ text: 'OBS', bold: true, red: true }]]);
  });

  it('lämnar udda markörer som text', () => {
    expect(parseRichText('Obs== kod a**b')).toEqual([[{ text: 'Obs== kod a**b', bold: false, red: false }]]);
    expect(parseRichText('**fet** och en ** till')).toEqual([[
      { text: 'fet', bold: true, red: false },
      { text: ' och en ** till', bold: false, red: false },
    ]]);
  });

  it('håller markörer inom raden', () => {
    expect(parseRichText('**rad1\nrad2**')).toEqual([
      [{ text: '**rad1', bold: false, red: false }],
      [{ text: 'rad2**', bold: false, red: false }],
    ]);
  });

  it('hanterar tomma rader', () => {
    expect(parseRichText('a\n\nb')).toEqual([
      [{ text: 'a', bold: false, red: false }],
      [],
      [{ text: 'b', bold: false, red: false }],
    ]);
  });
});

describe('stripRichText / hasRichMarkup', () => {
  it('tar bort markörer', () => {
    expect(stripRichText('Ring **kund** innan ==montage==\nrad 2')).toBe('Ring kund innan montage\nrad 2');
  });
  it('känner igen markup', () => {
    expect(hasRichMarkup('vanlig text')).toBe(false);
    expect(hasRichMarkup('**fet**')).toBe(true);
  });
});

describe('toggleRichMarker', () => {
  it('lägger på markör runt markering', () => {
    expect(toggleRichMarker('ring kund', 5, 9, '**')).toEqual({ text: 'ring **kund**', selectionStart: 7, selectionEnd: 11 });
  });
  it('tar bort markör när markeringen ligger inuti', () => {
    expect(toggleRichMarker('ring **kund**', 7, 11, '**')).toEqual({ text: 'ring kund', selectionStart: 5, selectionEnd: 9 });
  });
  it('tar bort markör när markeringen inkluderar markörerna', () => {
    expect(toggleRichMarker('ring **kund**', 5, 13, '**')).toEqual({ text: 'ring kund', selectionStart: 5, selectionEnd: 9 });
  });
  it('sätter in tomma markörer utan markering', () => {
    expect(toggleRichMarker('ring ', 5, 5, '==')).toEqual({ text: 'ring ====', selectionStart: 7, selectionEnd: 7 });
  });
});