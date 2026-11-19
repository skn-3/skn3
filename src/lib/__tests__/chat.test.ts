import { expect, it } from 'vitest';
import { extractCaseIdFromText, caseFallbackBody, shouldSendOnKey } from '../chat';
it('skickar vid Enter och radbryter vid Shift+Enter, oavsett skärm', () => {
  expect(shouldSendOnKey({ key: 'Enter' })).toBe(true);
  expect(shouldSendOnKey({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true);
  expect(shouldSendOnKey({ key: 'Enter', shiftKey: true })).toBe(false);
  expect(shouldSendOnKey({ key: 'Enter', isComposing: true })).toBe(false);
  expect(shouldSendOnKey({ key: 'a' })).toBe(false);
});
it('hittar ärendet i en länk med ?case eller &case', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  expect(extractCaseIdFromText(`Se https://example.test/?case=${id}`)).toBe(id);
  expect(extractCaseIdFromText(`Se https://example.test/?tab=alla&case=${id}&x=1`)).toBe(id);
});
it('returnerar null utan giltig ärendelänk', () => {
  expect(extractCaseIdFromText('Ärende: Testvägen')).toBeNull();
  expect(extractCaseIdFromText('?case=inte-en-uuid')).toBeNull();
});
it('väljer första ärendelänken när två finns', () => {
  expect(extractCaseIdFromText('/?case=12345678-1234-1234-1234-123456789abc /?case=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('12345678-1234-1234-1234-123456789abc');
});
it('ger adressen som förhandstext', () => {
  expect(caseFallbackBody('Björkvägen 14')).toBe('Ärende: Björkvägen 14');
});