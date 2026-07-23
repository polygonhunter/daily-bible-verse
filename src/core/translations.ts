import type { LanguageCode } from "./types";

export interface TranslationMeta {
  /** Stable plugin-internal id (also the generated data file name). */
  id: string;
  language: LanguageCode;
  displayName: string;
  /** Short attribution shown in the callout footer. */
  shortName: string;
  /** File name in the Beblia Holy-Bible-XML-Format repository. */
  bebliaFile: string;
}

/** All bundled translations are public domain — verified against the source
 * files' own status attributes. Copyrighted translations (Luther 2017,
 * Schlachter 1951/2000, Hoffnung für alle, NIV, ESV, ...) must NOT be added
 * here without a license. */
export const TRANSLATIONS: readonly TranslationMeta[] = [
  { id: "luther1912", language: "de", displayName: "Luther 1912", shortName: "Luther 1912", bebliaFile: "GermanLuther1912Bible.xml" },
  { id: "elberfelder1905", language: "de", displayName: "Elberfelder 1905", shortName: "Elberfelder 1905", bebliaFile: "GermanElber1905Bible.xml" },
  { id: "kjv", language: "en", displayName: "King James Version", shortName: "KJV", bebliaFile: "EnglishKJBible.xml" },
  { id: "darby1890", language: "en", displayName: "Darby Translation (1890)", shortName: "Darby 1890", bebliaFile: "EnglishDarbyBible.xml" },
  { id: "rva", language: "es", displayName: "Reina-Valera Antigua (1909)", shortName: "Reina-Valera 1909", bebliaFile: "SpanishRVESBible.xml" },
  { id: "segond1910", language: "fr", displayName: "Louis Segond 1910", shortName: "Segond 1910", bebliaFile: "FrenchBible.xml" },
  { id: "diodati1649", language: "it", displayName: "Diodati 1649", shortName: "Diodati 1649", bebliaFile: "Italian1649Bible.xml" },
];

export const DEFAULT_TRANSLATION: Record<LanguageCode, string> = {
  de: "luther1912",
  en: "kjv",
  es: "rva",
  fr: "segond1910",
  it: "diodati1649",
};

/** Raw-file base for both the build-time fetch script and the runtime
 * whole-Bible download (no API key, no rate limits, CDN-backed). */
export const BEBLIA_BASE_URL =
  "https://raw.githubusercontent.com/Beblia/Holy-Bible-XML-Format/master/";

export function translationById(id: string): TranslationMeta | undefined {
  return TRANSLATIONS.find((t) => t.id === id);
}

export function translationsForLanguage(language: LanguageCode): TranslationMeta[] {
  return TRANSLATIONS.filter((t) => t.language === language);
}
