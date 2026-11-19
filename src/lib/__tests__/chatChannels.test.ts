import { describe, expect, it } from 'vitest';
import {
  addRealtimeMessage, applyMessageToOverview, chatListEntries, conversationDisplayName, markOverviewRead, mergeLatestPage,
  mergeMessages, mergeOlderPage, olderCursor, orderConversations, toOverviewRow, type ChatMessage, type ChatOverviewRow,
} from '../chat';

const ME = 'me';
const TEAM = 'team-gvmo';
const names = new Map([[ME, 'Sara Säljare'], [TEAM, 'GVMO'], ['anna', 'Anna Koordinator'], ['bo', 'Bo Montör']]);
function row(over: Partial<ChatOverviewRow>): ChatOverviewRow {
  return { id: 'c', kind: 'direct', channel_key: null, team_user_id: null, is_group: false, title: null, created_at: '2026-11-01T08:00:00+00:00', member_ids: [ME, 'anna'], last_read_at: null, unread: 0, latest: null, ...over };
}
function msg(id: string, created_at: string, over: Partial<ChatMessage> = {}): ChatMessage {
  return { id, conversation_id: 'c', sender_id: 'anna', body: id, created_at, case_id: null, attachments: [], ...over };
}

describe('visningsnamn', () => {
  it('visar kanalerna alla och kontoret som Alla och Kontoret', () => {
    expect(conversationDisplayName(row({ kind: 'channel', channel_key: 'alla', title: 'x' }), ME, names)).toBe('Alla');
    expect(conversationDisplayName(row({ kind: 'channel', channel_key: 'kontoret', title: 'x' }), ME, names)).toBe('Kontoret');
  });
  it('personal ser teamets namn, teamet självt ser "<Team> och kontoret"', () => {
    const team = row({ kind: 'channel', channel_key: `team:${TEAM}`, team_user_id: TEAM, title: 'GVMO' });
    expect(conversationDisplayName(team, ME, names)).toBe('GVMO');
    expect(conversationDisplayName(team, TEAM, names)).toBe('GVMO och kontoret');
  });
  it('direktchatt visar den andres namn, grupp visar titel och annars namnen', () => {
    expect(conversationDisplayName(row({}), ME, names)).toBe('Anna Koordinator');
    expect(conversationDisplayName(row({ kind: 'group', is_group: true, title: 'Montörsamordning', member_ids: [ME, 'anna', 'bo'] }), ME, names)).toBe('Montörsamordning');
    expect(conversationDisplayName(row({ kind: 'group', is_group: true, title: '  ', member_ids: [ME, 'anna', 'bo'] }), ME, names)).toBe('Anna Koordinator, Bo Montör');
  });
});

describe('ordning', () => {
  const rows = [
    row({ id: 'd-old', latest: msg('m1', '2026-11-10T08:00:00+00:00') }),
    row({ id: 'team-b', kind: 'channel', is_group: true, channel_key: 'team:b', team_user_id: 'b', title: 'Östra teamet' }),
    row({ id: 'kontoret', kind: 'channel', is_group: true, channel_key: 'kontoret', title: 'Kontoret' }),
    row({ id: 'g-new', kind: 'group', is_group: true, title: 'Grupp', created_at: '2026-11-12T08:00:00+00:00' }),
    row({ id: 'team-a', kind: 'channel', is_group: true, channel_key: 'team:a', team_user_id: 'a', title: 'Ängby' }),
    row({ id: 'alla', kind: 'channel', is_group: true, channel_key: 'alla', title: 'Alla' }),
    row({ id: 'team-c', kind: 'channel', is_group: true, channel_key: 'team:c', team_user_id: 'c', title: 'Bergs' }),
    row({ id: 'd-new', latest: msg('m2', '2026-11-11T08:00:00+00:00') }),
  ];
  it('N3prenad-AI först, sedan Alla, Kontoret, teamkanaler i bokstavsordning och sist chattar efter senaste aktivitet', () => {
    const entries = chatListEntries(rows, ME, names);
    expect(entries[0]).toEqual({ type: 'ai' });
    expect(entries.slice(1).map(e => e.type === 'conversation' ? e.conversation.id : 'ai'))
      .toEqual(['alla', 'kontoret', 'team-c', 'team-a', 'team-b', 'g-new', 'd-new', 'd-old']);
  });
  it('visar kanaler även när de är tomma', () => {
    const list = orderConversations([row({ id: 'alla', kind: 'channel', is_group: true, channel_key: 'alla', latest: null })], ME, names);
    expect(list.map(c => c.name)).toEqual(['Alla']);
  });
});

describe('meddelandesidor', () => {
  const a = msg('a', '2026-11-01T08:00:00.100000+00:00');
  const b = msg('b', '2026-11-01T08:00:00.100000+00:00');
  const c = msg('c', '2026-11-01T09:00:00+00:00');
  it('slår ihop sidor utan dubbletter i ordningen (created_at, id)', () => {
    expect(mergeMessages([c, b], [b, a]).map(m => m.id)).toEqual(['a', 'b', 'c']);
  });
  it('markören för äldre är det äldsta inlästa meddelandet', () => {
    expect(olderCursor([a, b, c])).toEqual({ created_at: a.created_at, id: 'a' });
    expect(olderCursor([])).toBeNull();
  });
  it('har äldre när en hel sida kom och behåller äldre sidor när de senaste hämtas om', () => {
    const first = mergeLatestPage(undefined, [b, c], 2);
    expect(first.hasOlder).toBe(true);
    const withOlder = mergeOlderPage(first, [a], 2);
    expect(withOlder).toEqual({ messages: [a, b, c], hasOlder: false });
    const d = msg('d', '2026-11-01T10:00:00+00:00');
    expect(mergeLatestPage(withOlder, [c, d], 2)).toEqual({ messages: [a, b, c, d], hasOlder: false });
  });
  it('lägger till realtime-meddelanden en gång och bara i inläst konversation', () => {
    const page = { messages: [a, b], hasOlder: false };
    const once = addRealtimeMessage(page, c)!;
    expect(once.messages.map(m => m.id)).toEqual(['a', 'b', 'c']);
    expect(addRealtimeMessage(once, c)).toBe(once);
    expect(addRealtimeMessage(undefined, c)).toBeUndefined();
    expect(addRealtimeMessage(page, msg('x', c.created_at, { conversation_id: 'annan' }))).toBe(page);
  });
});

describe('översikten', () => {
  it('räknar ett nytt meddelande från någon annan som oläst en gång', () => {
    const rows = [row({ last_read_at: '2026-11-01T08:00:00+00:00' })];
    const m = msg('n', '2026-11-01T09:00:00+00:00');
    const first = applyMessageToOverview(rows, m, ME);
    expect(first.known).toBe(true);
    expect(first.rows[0].unread).toBe(1);
    expect(first.rows[0].latest?.id).toBe('n');
    expect(applyMessageToOverview(first.rows, m, ME).rows[0].unread).toBe(1);
    expect(applyMessageToOverview(rows, msg('mine', '2026-11-01T09:00:00+00:00', { sender_id: ME }), ME).rows[0].unread).toBe(0);
    expect(applyMessageToOverview(rows, msg('x', m.created_at, { conversation_id: 'okand' }), ME).known).toBe(false);
  });
  it('nollställer olästa vid läsmarkering', () => {
    const read = markOverviewRead([row({ unread: 3 })], 'c', '2026-11-02T08:00:00Z');
    expect(read[0]).toMatchObject({ unread: 0, last_read_at: '2026-11-02T08:00:00Z' });
  });
  it('tolkar rader från chat_overview', () => {
    const parsed = toOverviewRow({ id: 'k', kind: 'channel', channel_key: 'alla', team_user_id: null, is_group: true, title: 'Alla', created_at: '2026-11-01', member_ids: ['a'], last_read_at: null, unread: '2', latest: { id: 'm', conversation_id: 'k', sender_id: 'a', body: 'Hej', created_at: '2026-11-01T08:00:00+00:00', case_id: null, attachments: [] } });
    expect(parsed.unread).toBe(2);
    expect(parsed.latest?.body).toBe('Hej');
    expect(toOverviewRow({ id: 'k', kind: 'okänd', is_group: false, latest: null }).kind).toBe('direct');
  });
});
