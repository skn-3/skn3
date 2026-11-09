// Gemensamma mottagare för mejl som byggs på servern. Klienten skickar aldrig adresser
// till de fasta mallarna; de slås upp här.
export const COORDINATOR_TO = 'mirna.malke@mockfjards.se';
export const MAIL_CC = 'mf@malke.se';

/** Montörsteamens adresser (samma som EMAIL_MAP i appen). */
export const TEAM_EMAILS: Record<string, string> = {
  'GVMO': 'gvmo.bygg@gmail.com',
  'Samy': 'info@smtmbygg.se',
  'Alex NBD': 'alex@nbdentreprenad.com',
  'Jerk': 'jerk.ryttman@mockfjards.se',
  'Villaspecialisten': 'Edvin@villaspecialisten.se',
};

/** Säljarnas adresser (samma som EMAIL_MAP i appen). */
export const SELLER_EMAILS: Record<string, string> = {
  'Daniel Malke': 'daniel.malke@mockfjards.se',
  'Gabriel Hanna': 'gabriel.hanna@mockfjards.se',
};
