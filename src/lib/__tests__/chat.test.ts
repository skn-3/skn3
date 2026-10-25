import { expect, it } from 'vitest';
import { countUnreadMessages, extractCaseIdFromText, caseFallbackBody, shouldSendOnKey } from '../chat';
it('skickar vid Enter och radbryter vid Shift+Enter, oavsett skärm', () => {
  expect(shouldSendOnKey({ key: 'Enter' })).toBe(true);
  expect(shouldSendOnKey({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true);
  expect(shouldSendOnKey({ key: 'Enter', shiftKey: true })).toBe(false);
  expect(shouldSendOnKey({ key: 'Enter', isComposing: true })).toBe(false);
  expect(shouldSendOnKey({ key: 'a' })).toBe(false);
});
it('räknar bara nya inkommande meddelanden i medlemmens konversation', () => {
  const member = { conversation_id: 'c', user_id: 'me', last_read_at: '2026-10-25T10:00:00Z' };
  const messages = [
    { id: '1', conversation_id: 'c', sender_id: 'other', body: 'a', created_at: '2026-10-25T10:01:00Z' },
    { id: '2', conversation_id: 'c', sender_id: 'me', body: 'b', created_at: '2026-10-25T10:02:00Z' },
    { id: '3', conversation_id: 'c', sender_id: 'other', body: 'c', created_at: '2026-10-25T09:00:00Z' },
    { id: '4', conversation_id: 'other-c', sender_id: 'other', body: 'd', created_at: '2026-10-25T10:03:00Z' },
  ];
  expect(countUnreadMessages(messages, member, 'me')).toBe(1);
  expect(countUnreadMessages(messages, { ...member, last_read_at: null }, 'me')).toBe(2);
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