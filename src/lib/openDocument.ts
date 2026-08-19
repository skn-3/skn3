// Öppnar dokument i ny flik på ett iOS-säkert sätt.
// Safari blockerar window.open som sker efter en await — därför öppnas fliken
// SYNKRONT i klickgesten och pekas om när URL:en hämtats.
export async function openDocumentInNewTab(
  getUrl: () => Promise<string | null>,
  opts: { fallbackSameTab?: boolean } = {},
): Promise<boolean> {
  const { fallbackSameTab = true } = opts;
  const w = window.open('', '_blank');
  if (w) {
    try {
      w.document.write('<p>Öppnar dokument…</p>');
    } catch {}
  }
  try {
    const url = await getUrl();
    if (!url) throw new Error('Ingen URL');
    if (w) { w.location.replace(url); return true; }
    if (fallbackSameTab) { window.location.assign(url); return true; }
    return false;
  } catch {
    try { w?.close(); } catch {}
    return false;
  }
}
