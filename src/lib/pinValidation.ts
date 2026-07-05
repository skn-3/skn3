// Avvisar förutsägbara 6-siffriga PIN-koder:
//  - alla siffror lika (t.ex. 111111, 000000)
//  - stigande sekvens (t.ex. 123456)
//  - fallande sekvens (t.ex. 654321)
//  - upprepade block (t.ex. 123123)
export const PREDICTABLE_PIN_MESSAGE = 'Välj en mindre förutsägbar kod.';

export function isPredictablePin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false;
  const d = pin.split('').map(Number);

  // Alla siffror lika (fångar även 000000)
  if (d.every((x) => x === d[0])) return true;

  // Stigande / fallande sekvens med steg +1 eller -1 (mod 10)
  const diffs = d.slice(1).map((v, i) => (v - d[i] + 10) % 10);
  if (diffs.every((x) => x === 1)) return true; // 123456, 567890 osv
  if (diffs.every((x) => x === 9)) return true; // 654321, 098765 osv

  // Upprepat 3-siffrigt block (t.ex. 123123, 456456)
  if (pin.slice(0, 3) === pin.slice(3, 6)) return true;

  return false;
}
