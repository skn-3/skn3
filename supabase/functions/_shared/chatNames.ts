// Visningsnamn för chattkonversationer. Ren modul som delas av appen (src/lib/chat.ts) och chat-push,
// så att en notis och listan i appen alltid visar samma namn.
export type ChatKind = 'direct' | 'group' | 'channel';
export interface ChatNameRow {
  kind: ChatKind;
  channel_key: string | null;
  team_user_id: string | null;
  title: string | null;
  member_ids: string[];
}

/** Visningsnamn. Personal ser teamkanalen med teamets namn, teamet självt ser "<Team> och kontoret". */
export function conversationDisplayName(row: ChatNameRow, viewerId: string | null, names: ReadonlyMap<string, string>): string {
  if (row.kind === 'channel') {
    if (row.channel_key === 'alla') return 'Alla';
    if (row.channel_key === 'kontoret') return 'Kontoret';
    const team = row.title?.trim() || (row.team_user_id ? names.get(row.team_user_id) : undefined) || 'Team';
    return row.team_user_id && row.team_user_id === viewerId ? `${team} och kontoret` : team;
  }
  const others = row.member_ids.filter(id => id !== viewerId).map(id => names.get(id) ?? 'Användare');
  if (row.kind === 'group') return row.title?.trim() || others.join(', ') || 'Grupp';
  return others.join(', ') || 'Användare';
}
