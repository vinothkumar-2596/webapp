/**
 * Country recognition.
 *
 * v1 matched against 9 hardcoded names and silently defaulted everything
 * else to "France" — printing the wrong country on real parcels bound for
 * the Netherlands, Poland, Ireland, and so on.
 *
 * Here the list covers the realistic Amazon EU destinations in French,
 * English, and the local endonym. Anything unrecognised returns null, and
 * the label is flagged 'unknown-country' rather than guessed.
 */

interface CountryDef {
  /** Canonical display name, printed on the label. */
  name: string;
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** Lowercased aliases: French, English, endonym, common abbreviations. */
  aliases: string[];
}

const COUNTRIES: CountryDef[] = [
  { name: 'France', code: 'FR', aliases: ['france', 'fr', 'french republic', 'république française'] },
  { name: 'Belgique', code: 'BE', aliases: ['belgique', 'belgium', 'belgië', 'belgien', 'be'] },
  { name: 'Luxembourg', code: 'LU', aliases: ['luxembourg', 'luxemburg', 'lëtzebuerg', 'lu'] },
  { name: 'Suisse', code: 'CH', aliases: ['suisse', 'switzerland', 'schweiz', 'svizzera', 'ch'] },
  { name: 'Monaco', code: 'MC', aliases: ['monaco', 'mc'] },
  { name: 'Espagne', code: 'ES', aliases: ['espagne', 'spain', 'españa', 'espana', 'es'] },
  { name: 'Portugal', code: 'PT', aliases: ['portugal', 'pt'] },
  { name: 'Italie', code: 'IT', aliases: ['italie', 'italy', 'italia', 'it'] },
  { name: 'Allemagne', code: 'DE', aliases: ['allemagne', 'germany', 'deutschland', 'de'] },
  { name: 'Autriche', code: 'AT', aliases: ['autriche', 'austria', 'österreich', 'osterreich', 'at'] },
  { name: 'Pays-Bas', code: 'NL', aliases: ['pays-bas', 'pays bas', 'netherlands', 'nederland', 'holland', 'nl'] },
  { name: 'Irlande', code: 'IE', aliases: ['irlande', 'ireland', 'éire', 'eire', 'ie'] },
  {
    name: 'Royaume-Uni',
    code: 'GB',
    aliases: [
      'royaume-uni', 'royaume uni', 'united kingdom', 'great britain',
      'england', 'angleterre', 'scotland', 'écosse', 'wales', 'pays de galles',
      'uk', 'gb',
    ],
  },
  { name: 'Danemark', code: 'DK', aliases: ['danemark', 'denmark', 'danmark', 'dk'] },
  { name: 'Suède', code: 'SE', aliases: ['suède', 'suede', 'sweden', 'sverige', 'se'] },
  { name: 'Norvège', code: 'NO', aliases: ['norvège', 'norvege', 'norway', 'norge', 'no'] },
  { name: 'Finlande', code: 'FI', aliases: ['finlande', 'finland', 'suomi', 'fi'] },
  { name: 'Pologne', code: 'PL', aliases: ['pologne', 'poland', 'polska', 'pl'] },
  { name: 'Tchéquie', code: 'CZ', aliases: ['tchéquie', 'tchequie', 'czechia', 'czech republic', 'česko', 'cz'] },
  { name: 'Slovaquie', code: 'SK', aliases: ['slovaquie', 'slovakia', 'slovensko', 'sk'] },
  { name: 'Hongrie', code: 'HU', aliases: ['hongrie', 'hungary', 'magyarország', 'magyarorszag', 'hu'] },
  { name: 'Roumanie', code: 'RO', aliases: ['roumanie', 'romania', 'românia', 'ro'] },
  { name: 'Bulgarie', code: 'BG', aliases: ['bulgarie', 'bulgaria', 'българия', 'bg'] },
  { name: 'Grèce', code: 'GR', aliases: ['grèce', 'grece', 'greece', 'ελλάδα', 'gr'] },
  { name: 'Croatie', code: 'HR', aliases: ['croatie', 'croatia', 'hrvatska', 'hr'] },
  { name: 'Slovénie', code: 'SI', aliases: ['slovénie', 'slovenie', 'slovenia', 'slovenija', 'si'] },
  { name: 'Estonie', code: 'EE', aliases: ['estonie', 'estonia', 'eesti', 'ee'] },
  { name: 'Lettonie', code: 'LV', aliases: ['lettonie', 'latvia', 'latvija', 'lv'] },
  { name: 'Lituanie', code: 'LT', aliases: ['lituanie', 'lithuania', 'lietuva', 'lt'] },
  { name: 'Chypre', code: 'CY', aliases: ['chypre', 'cyprus', 'κύπρος', 'cy'] },
  { name: 'Malte', code: 'MT', aliases: ['malte', 'malta', 'mt'] },
];

/** Alias → canonical name, built once. */
const LOOKUP: ReadonlyMap<string, CountryDef> = (() => {
  const m = new Map<string, CountryDef>();
  for (const c of COUNTRIES) {
    m.set(c.name.toLowerCase(), c);
    for (const a of c.aliases) m.set(a, c);
  }
  return m;
})();

/** Strip accents and punctuation so "Suède" and "Suede" both match. */
function normalise(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Accent-insensitive alias index, derived from LOOKUP. */
const NORMALISED: ReadonlyMap<string, CountryDef> = (() => {
  const m = new Map<string, CountryDef>();
  for (const [alias, def] of LOOKUP) {
    const key = normalise(alias);
    if (key) m.set(key, def);
  }
  return m;
})();

/**
 * Resolve a line of text to a canonical country name.
 * Returns null when the line is not a recognised country — never a guess.
 */
export function matchCountry(line: string): string | null {
  const key = normalise(line);
  if (!key) return null;

  // Two-letter codes only match when the line is exactly that code, so a
  // street line like "12 Rue de" cannot be mistaken for a country.
  if (key.length <= 2) {
    const exact = NORMALISED.get(key);
    return exact ? exact.name : null;
  }

  const hit = NORMALISED.get(key);
  return hit ? hit.name : null;
}

/** All canonical country names, for the manual-correction dropdown. */
export function allCountryNames(): string[] {
  return COUNTRIES.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'fr'));
}
