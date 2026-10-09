// src/translations/catalog.ts — the single trilingual copy catalog for the position/freshness layer.
// Tasks 6–11 append their keys HERE, never inside a component: the key-parity guard in
// tests/app/positions.test.ts fails the build if any key is missing a language or blank.
// The product is Arabic-first and must never overstate — no live/safe/guaranteed framing here.
export type CatalogLang = 'ar' | 'fr' | 'en';
export type CatalogEntry = { ar: string; fr: string; en: string };

export const catalog: Record<string, CatalogEntry> = {
  // Age of the last fix, formatted from `fixTime` (R30). `{age}` is integer seconds, ASCII digits.
  'position.ageSeconds': { ar: 'منذ {age} ثانية', fr: 'il y a {age} s', en: '{age} s ago' },
  // GPS accuracy as a radius. `{accuracy}` is integer metres.
  'position.accuracyMeters': { ar: '±{accuracy} م', fr: '±{accuracy} m', en: '±{accuracy} m' },
  // A silent source is announced as no-data, never as safety.
  'position.noDataFromServer': { ar: 'لا بيانات من الخادم', fr: 'Aucune donnée du serveur', en: 'No data from the server' },
  'position.locationMayNotBeCurrent': { ar: 'قد لا يكون الموقع الحالي دقيقاً', fr: 'la position actuelle peut ne pas être à jour', en: 'the current location may not be up to date' },
};

// Translate one catalog key into one language, substituting {placeholder} tokens. Digits are handed
// in as plain ASCII strings on purpose: Intl.NumberFormat('ar') would emit Arabic-Indic numerals and
// break the deterministic, testable contract the label regexes assert. Throws rather than returning
// a confident half-sentence when a key or a language value is absent.
export function translate(key: string, lang: CatalogLang, vars?: Record<string, string | number>): string {
  const entry = catalog[key];
  if (!entry) throw new Error(`catalog key is missing: ${key}`);
  const template = entry[lang];
  if (typeof template !== 'string' || template.length === 0) throw new Error(`catalog ${key}.${lang} is blank`);
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(vars?.[name] ?? ''));
}
