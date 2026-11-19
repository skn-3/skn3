import { describe, it, expect } from 'vitest';
import {
  PUSH_BODY_MAX, PUSH_TTL_SECONDS, bearerMatches, classifyPushStatus, messagePayload, pushBody, pushRecipients, pushTitle, pushUrl, testPayload,
  type PushConversation,
} from '../../../supabase/functions/chat-push/logic';
import { conversationDisplayName as shared } from '../../../supabase/functions/_shared/chatNames';
import { conversationDisplayName } from '@/lib/chat';

const SENDER = 's', A = 'a', B = 'b', TEAM = 't';
const names = new Map([[SENDER, 'Gabriel Hanna'], [A, 'Anna Andersson'], [B, 'Bertil Berg'], [TEAM, 'Testteam Norra']]);
const conv = (over: Partial<PushConversation>): PushConversation => ({ id: 'c1', kind: 'direct', channel_key: null, team_user_id: null, title: null, ...over });

describe('mottagare', () => {
  const sent = '2026-11-19T10:00:00.000Z';
  it('avsändaren får ingen notis', () => {
    expect(pushRecipients([{ user_id: SENDER, last_read_at: null }, { user_id: A, last_read_at: null }], { sender_id: SENDER, created_at: sent })).toEqual([A]);
  });
  it('den som redan har läst (läsmarkering lika med eller senare) får ingen', () => {
    const members = [
      { user_id: A, last_read_at: '2026-11-19T10:00:00.000Z' },
      { user_id: B, last_read_at: '2026-11-19T10:00:01.000Z' },
      { user_id: TEAM, last_read_at: '2026-11-19T09:59:59.999Z' },
      { user_id: 'x', last_read_at: null },
    ];
    expect(pushRecipients(members, { sender_id: SENDER, created_at: sent })).toEqual([TEAM, 'x']);
  });
  it('jämför tider, inte text (olika tidszonsformat)', () => {
    expect(pushRecipients([{ user_id: A, last_read_at: '2026-11-19T11:00:00+01:00' }], { sender_id: SENDER, created_at: sent })).toEqual([]);
  });
});

describe('titel', () => {
  it('direktchatt: avsändarens namn', () => {
    expect(pushTitle(conv({}), [SENDER, A], 'Gabriel Hanna', A, names)).toBe('Gabriel Hanna');
  });
  it('kanal och grupp: "<Avsändare> i <namn>"', () => {
    expect(pushTitle(conv({ kind: 'channel', channel_key: 'alla', title: 'Alla' }), [], 'Gabriel Hanna', A, names)).toBe('Gabriel Hanna i Alla');
    expect(pushTitle(conv({ kind: 'channel', channel_key: 'kontoret', title: 'Kontoret' }), [], 'Gabriel Hanna', A, names)).toBe('Gabriel Hanna i Kontoret');
    expect(pushTitle(conv({ kind: 'group', title: 'Takprojektet' }), [SENDER, A, B], 'Gabriel Hanna', A, names)).toBe('Gabriel Hanna i Takprojektet');
    expect(pushTitle(conv({ kind: 'group' }), [SENDER, A, B], 'Gabriel Hanna', A, names)).toBe('Gabriel Hanna i Gabriel Hanna, Bertil Berg');
  });
  it('teamkanal: teamet ser "<Team> och kontoret", personal ser teamets namn', () => {
    const team = conv({ kind: 'channel', channel_key: 'team:t', team_user_id: TEAM, title: 'Testteam Norra' });
    expect(pushTitle(team, [], 'Gabriel Hanna', TEAM, names)).toBe('Gabriel Hanna i Testteam Norra och kontoret');
    expect(pushTitle(team, [], 'Gabriel Hanna', A, names)).toBe('Gabriel Hanna i Testteam Norra');
  });
  it('appen och notisen använder samma namnmodul', () => {
    expect(conversationDisplayName).toBe(shared);
  });
});

describe('text', () => {
  it('avkortas till 140 tecken', () => {
    const long = 'å'.repeat(200);
    const body = pushBody({ body: long });
    expect(PUSH_BODY_MAX).toBe(140);
    expect(Array.from(body)).toHaveLength(140);
    expect(body.endsWith('…')).toBe(true);
    expect(pushBody({ body: 'x'.repeat(140) })).toBe('x'.repeat(140));
  });
  it('slår ihop radbrytningar', () => {
    expect(pushBody({ body: 'Hej\n\nkan du ringa?' })).toBe('Hej kan du ringa?');
  });
  it('bara bild: "Bild"', () => {
    expect(pushBody({ body: '', attachments: [{ path: 'c/1.jpg' }] })).toBe('Bild');
    expect(pushBody({ body: '  ', attachments: [{ path: 'c/1.jpg' }, { path: 'c/2.jpg' }] })).toBe('Bild');
  });
});

describe('innehåll och svarskoder', () => {
  it('url, tag och olästa', () => {
    const p = messagePayload({ conversation: conv({ id: 'abc' }), memberIds: [SENDER, A], message: { id: 'm', conversation_id: 'abc', sender_id: SENDER, body: 'Hej', created_at: '' }, senderName: 'Gabriel Hanna', recipientId: A, names, unread: 3 });
    expect(p).toEqual({ title: 'Gabriel Hanna', body: 'Hej', tag: 'abc', url: '/?chat=abc', unread: 3 });
    expect(pushUrl('abc')).toBe('/?chat=abc');
  });
  it('testnotisen', () => {
    expect(testPayload(2)).toMatchObject({ title: 'SmartKlimat N3prenad', body: 'Notiserna fungerar', unread: 2 });
  });
  it('TTL 24 timmar', () => {
    expect(PUSH_TTL_SECONDS).toBe(86400);
  });
  it('404 och 410 tar bort prenumerationen, andra fel räknas upp', () => {
    expect(classifyPushStatus(201)).toBe('ok');
    expect(classifyPushStatus(200)).toBe('ok');
    expect(classifyPushStatus(404)).toBe('gone');
    expect(classifyPushStatus(410)).toBe('gone');
    expect(classifyPushStatus(413)).toBe('failed');
    expect(classifyPushStatus(429)).toBe('failed');
    expect(classifyPushStatus(500)).toBe('failed');
    expect(classifyPushStatus(0)).toBe('failed');
  });
  it('återanropets bearer jämförs exakt', () => {
    expect(bearerMatches('Bearer abc123', 'abc123')).toBe(true);
    expect(bearerMatches('Bearer abc124', 'abc123')).toBe(false);
    expect(bearerMatches('abc123', 'abc123')).toBe(false);
    expect(bearerMatches('Bearer abc123', null)).toBe(false);
    expect(bearerMatches(null, 'abc123')).toBe(false);
  });
});
