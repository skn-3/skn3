import { describe, expect, it } from 'vitest';
import {
  CHAT_GROUP_WINDOW_MS, chatDayLabel, chatInitials, chatPreviewLine, chatRoleLabel, chatSidebarSections, conversationSubtitle,
  groupChatMessages, orderConversations, type ChatMessage, type ChatOverviewRow,
} from '../chat';

const ME = 'me';
const names = new Map([[ME, 'Sara Säljare'], ['anna', 'Anna Koordinator'], ['bo', 'Bo Montör'], ['norr', 'Team Norra'], ['syd', 'Team Södra']]);
const roles = new Map([[ME, 'seller'], ['anna', 'coordinator'], ['bo', 'montor'], ['norr', 'montor'], ['syd', 'montor']]);
function row(over: Partial<ChatOverviewRow>): ChatOverviewRow {
  return { id: 'c', kind: 'direct', channel_key: null, team_user_id: null, is_group: false, title: null, created_at: '2026-11-01T08:00:00+00:00', member_ids: [ME, 'anna'], last_read_at: null, unread: 0, latest: null, ...over };
}
/** Lokala tider så att testerna inte beror på tidszon. */
function at(y: number, mo: number, d: number, h: number, mi: number, s = 0) { return new Date(y, mo - 1, d, h, mi, s).toISOString(); }
function msg(id: string, created_at: string, sender_id = 'anna', over: Partial<ChatMessage> = {}): ChatMessage {
  return { id, conversation_id: 'c', sender_id, body: id, created_at, case_id: null, attachments: [], ...over };
}
const NOW = new Date(2026, 10, 19, 12, 0); // torsdag 19 november 2026

describe('datumetiketter', () => {
  it('Idag och I går', () => {
    expect(chatDayLabel(at(2026, 11, 19, 0, 5), NOW)).toBe('Idag');
    expect(chatDayLabel(at(2026, 11, 18, 23, 55), NOW)).toBe('I går');
  });
  it('annars veckodag och datum, med år först för tidigare år', () => {
    expect(chatDayLabel(at(2026, 11, 17, 9, 0), NOW)).toBe('tisdag 17 november');
    expect(chatDayLabel(at(2025, 12, 31, 9, 0), NOW)).toBe('onsdag 31 december 2025');
  });
  it('I går över ett månadsskifte', () => {
    expect(chatDayLabel(at(2026, 11, 30, 22, 0), new Date(2026, 11, 1, 8, 0))).toBe('I går');
  });
});

describe('gruppering av meddelanden', () => {
  it('samma avsändare inom fem minuter grupperas, bara det första visar huvud', () => {
    const rows = groupChatMessages([
      msg('a', at(2026, 11, 19, 9, 0)),
      msg('b', at(2026, 11, 19, 9, 2)),
      msg('c', at(2026, 11, 19, 9, 5)),
    ], NOW);
    expect(rows.map(r => r.showHeader)).toEqual([true, false, false]);
  });
  it('mer än fem minuter från gruppens första meddelande börjar en ny grupp', () => {
    const start = new Date(2026, 10, 19, 9, 0).getTime();
    const rows = groupChatMessages([
      msg('a', new Date(start).toISOString()),
      msg('b', new Date(start + 3 * 60000).toISOString()),
      msg('c', new Date(start + CHAT_GROUP_WINDOW_MS + 1000).toISOString()),
    ], NOW);
    expect(rows.map(r => r.showHeader)).toEqual([true, false, true]);
  });
  it('ny avsändare börjar alltid en ny grupp, även egna meddelanden', () => {
    const rows = groupChatMessages([
      msg('a', at(2026, 11, 19, 9, 0), 'anna'),
      msg('b', at(2026, 11, 19, 9, 1), ME),
      msg('c', at(2026, 11, 19, 9, 2), 'anna'),
    ], NOW);
    expect(rows.map(r => r.showHeader)).toEqual([true, true, true]);
  });
  it('ny dag ger datumavdelare och nytt huvud även inom fem minuter', () => {
    const rows = groupChatMessages([
      msg('a', at(2026, 11, 18, 23, 58)),
      msg('b', at(2026, 11, 19, 0, 1)),
      msg('c', at(2026, 11, 19, 0, 2)),
    ], NOW);
    expect(rows.map(r => r.dayLabel)).toEqual(['I går', 'Idag', null]);
    expect(rows.map(r => r.showHeader)).toEqual([true, true, false]);
  });
});

describe('underrader i huvudet', () => {
  it('Alla och Kontoret med antal medlemmar', () => {
    expect(conversationSubtitle(row({ kind: 'channel', channel_key: 'alla', member_ids: [ME, 'anna', 'bo'] }), ME, names, roles)).toBe('Hela företaget · 3 medlemmar');
    expect(conversationSubtitle(row({ kind: 'channel', channel_key: 'kontoret', member_ids: [ME] }), ME, names, roles)).toBe('Bara kontoret · 1 medlem');
  });
  it('teamkanal: personalen ser "<Teamnamn> och kontoret"', () => {
    const team = row({ kind: 'channel', channel_key: 'team:norr', team_user_id: 'norr', title: 'Team Norra', member_ids: ['norr', ME, 'anna'] });
    expect(conversationSubtitle(team, ME, names, roles)).toBe('Team Norra och kontoret');
    expect(conversationSubtitle(team, 'anna', names, roles)).toBe('Team Norra och kontoret');
  });
  it('teamkanal: teamet självt ser "Teamkanal · N medlemmar", singular vid en medlem', () => {
    const team = row({ kind: 'channel', channel_key: 'team:norr', team_user_id: 'norr', title: 'Team Norra', member_ids: ['norr', ME, 'anna'] });
    expect(conversationSubtitle(team, 'norr', names, roles)).toBe('Teamkanal · 3 medlemmar');
    expect(conversationSubtitle({ ...team, member_ids: ['norr'] }, 'norr', names, roles)).toBe('Teamkanal · 1 medlem');
  });
  it('direktchatt visar den andres roll, grupp visar namnen', () => {
    expect(conversationSubtitle(row({}), ME, names, roles)).toBe('Koordinator');
    expect(conversationSubtitle(row({ member_ids: [ME, 'bo'] }), ME, names, roles)).toBe('Montör');
    expect(conversationSubtitle(row({ member_ids: ['anna', ME] }), 'anna', names, roles)).toBe('Säljare');
    expect(conversationSubtitle(row({ kind: 'group', is_group: true, title: 'Samordning', member_ids: [ME, 'anna', 'bo'] }), ME, names, roles)).toBe('Anna Koordinator, Bo Montör');
  });
});

describe('sektioner i listan', () => {
  const rows = [
    row({ id: 'alla', kind: 'channel', is_group: true, channel_key: 'alla', member_ids: [ME, 'anna', 'bo', 'norr', 'syd'] }),
    row({ id: 'kontoret', kind: 'channel', is_group: true, channel_key: 'kontoret', member_ids: [ME, 'anna'] }),
    row({ id: 'syd', kind: 'channel', is_group: true, channel_key: 'team:syd', team_user_id: 'syd', title: 'Team Södra' }),
    row({ id: 'norr', kind: 'channel', is_group: true, channel_key: 'team:norr', team_user_id: 'norr', title: 'Team Norra' }),
    row({ id: 'd1', latest: msg('m1', '2026-11-10T08:00:00+00:00') }),
    row({ id: 'g1', kind: 'group', is_group: true, title: 'Samordning', member_ids: [ME, 'anna', 'bo'], latest: msg('m2', '2026-11-12T08:00:00+00:00') }),
  ];
  it('personal: Alla och Kontoret under Kanaler, teamkanaler i bokstavsordning under Team, N3prenad-AI först under Direkt', () => {
    const s = chatSidebarSections(orderConversations(rows, ME, names), ME, true);
    expect(s.channels.map(c => c.name)).toEqual(['Alla', 'Kontoret']);
    expect(s.teams.map(c => c.name)).toEqual(['Team Norra', 'Team Södra']);
    expect(s.direct.map(i => i.type === 'ai' ? 'ai' : i.conversation.id)).toEqual(['ai', 'g1', 'd1']);
  });
  it('montör: Alla och den egna teamkanalen under Kanaler, ingen Team-sektion', () => {
    const visible = rows.filter(r => r.id === 'alla' || r.id === 'norr' || r.id === 'g1');
    const s = chatSidebarSections(orderConversations(visible, 'norr', names), 'norr', false);
    expect(s.channels.map(c => c.name)).toEqual(['Alla', 'Team Norra och kontoret']);
    expect(s.teams).toEqual([]);
    expect(s.direct.map(i => i.type === 'ai' ? 'ai' : i.conversation.id)).toEqual(['ai', 'g1']);
  });
  it('montör ser aldrig en annans teamkanal under Team även om den skulle finnas i datan', () => {
    const s = chatSidebarSections(orderConversations(rows, 'norr', names), 'norr', false);
    expect(s.teams).toEqual([]);
    expect(s.channels.map(c => c.id)).toEqual(['alla', 'kontoret', 'norr']);
  });
  it('tomma kanaler visas', () => {
    const s = chatSidebarSections(orderConversations(rows, ME, names), ME, true);
    expect(s.channels.every(c => c.latest === null)).toBe(true);
    expect(s.channels).toHaveLength(2);
  });
  it('sökningen filtrerar på namn utan hänsyn till skiftläge', () => {
    const s = chatSidebarSections(orderConversations(rows, ME, names), ME, true, 'NORR');
    expect(s.channels).toEqual([]);
    expect(s.teams.map(c => c.name)).toEqual(['Team Norra']);
    expect(s.direct).toEqual([]);
    expect(chatSidebarSections(orderConversations(rows, ME, names), ME, true, 'n3pren').direct).toEqual([{ type: 'ai' }]);
  });
});

describe('roll, initialer och förhandsrad', () => {
  it('rollnamn och initialer', () => {
    expect([chatRoleLabel('seller'), chatRoleLabel('coordinator'), chatRoleLabel('montor'), chatRoleLabel(null)]).toEqual(['Säljare', 'Koordinator', 'Montör', '']);
    expect([chatInitials('Anna Koordinator'), chatInitials('GVMO'), chatInitials('  ')]).toEqual(['AK', 'GV', '?']);
  });
  it('förhandsrad "Avsändare: text", Du för egna, Bild när meddelandet bara är en bild', () => {
    expect(chatPreviewLine(msg('m', '2026-11-19T08:00:00Z', 'anna', { body: 'Hej\nhej' }), ME, names)).toBe('Anna: Hej hej');
    expect(chatPreviewLine(msg('m', '2026-11-19T08:00:00Z', ME, { body: 'Klart' }), ME, names)).toBe('Du: Klart');
    expect(chatPreviewLine(msg('m', '2026-11-19T08:00:00Z', 'bo', { body: '', attachments: [{ path: 'c/x.jpg', name: 'x.jpg', type: 'image/jpeg', size: 1, width: 10, height: 10 }] }), ME, names)).toBe('Bo: Bild');
    expect(chatPreviewLine(null, ME, names)).toBe('Inga meddelanden ännu');
  });
});
