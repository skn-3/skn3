/**
 * Tillgängligt namn för en flikknapp i huvudmenyn i sidhuvudet. Under lg-bredd syns bara ikonen,
 * så namnet måste stå i aria-label. Chatt med olästa och Min inkorg med öppna punkter behåller antalet.
 */
export function navTabLabel(label: string, value: string, chatUnread = 0, inboxCount = 0): string {
  if (value === 'chatt' && chatUnread > 0) return `${label}, ${chatUnread} olästa`;
  if (value === 'inbox' && inboxCount > 0) return `${label}, ${inboxCount} öppna punkter`;
  return label;
}
