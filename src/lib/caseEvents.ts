// Delar upp ändringsrader i ärendeuppdateringar: ekonomikänsliga rader
// (belopp/marginaler) loggas som event_type 'economy' och döljs för montörer,
// övriga som 'update'. Prefixen matchar texterna i CaseDetailPanel:s ändringslista.
const ECONOMY_PREFIXES = ['Ordervärde', 'TB ändrat', 'Extra timmar sålda'];

export function splitCaseChanges(changes: string[]): { update: string[]; economy: string[] } {
  const update: string[] = [];
  const economy: string[] = [];
  for (const c of changes) {
    if (ECONOMY_PREFIXES.some((p) => c.startsWith(p))) economy.push(c);
    else update.push(c);
  }
  return { update, economy };
}
