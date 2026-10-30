/** A verse or verse range within a single chapter. Book numbering follows the
 * standard Protestant 1..66 order (43 = John). */
export interface VerseRange {
  book: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

/** Canonical string key for a verse range: "book:chapter:start-end", e.g. "43:3:16-16". */
export type RefKey = string;

export type ThemeId =
  | "encouragement"
  | "comfort"
  | "hope"
  | "love"
  | "wisdom"
  | "gratitude"
  | "faith"
  | "peace";

export const ALL_THEMES: readonly ThemeId[] = [
  "encouragement",
  "comfort",
  "hope",
  "love",
  "wisdom",
  "gratitude",
  "faith",
  "peace",
];

export interface CuratedRef extends VerseRange {
  themes: ThemeId[];
}

export interface CuratedRefsFile {
  schemaVersion: number;
  verses: CuratedRef[];
}

export interface BookNamesTable {
  /** Separator between chapter and verse, e.g. "," (de/it) or ":" (en/es/fr). */
  chapterVerseSeparator: string;
  /** Separator inside a verse range, e.g. "-". */
  rangeSeparator: string;
  /** Book number (as string key, "1".."66") to localized book name. */
  books: Record<string, string>;
}

export type LanguageCode = "de" | "en" | "es" | "fr" | "it";

export interface GeneratedTextsFile {
  translationId: string;
  source: string;
  texts: Record<RefKey, string>;
  /** Curated (KJV-versified) key -> the range the text was read from in this
   * translation, only where the two differ (e.g. German Psalm superscriptions
   * count as verse 1). Keys stay curated for deck and overrides; references
   * and links are formatted from this range. */
  refs?: Record<RefKey, RefKey>;
}

/** Map of chapter -> number of verses, per book. Used for whole-Bible pools. */
export type TranslationIndex = Map<number, Map<number, number>>;
