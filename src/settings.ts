import type { InsertPosition } from "./core/insert-logic";
import type { LanguageCode } from "./core/types";

export type PoolMode = "curated" | "whole-bible" | "books";

export interface DailyBibleVerseSettings {
  language: LanguageCode;
  translationId: string;
  poolMode: PoolMode;
  /** Empty array = all themes. */
  selectedThemes: string[];
  /** Key of BOOK_PRESETS; used when poolMode is "books". */
  bookPreset: string;
  autoInsertOnDailyNote: boolean;
  insertPosition: InsertPosition;
  calloutType: string;
  emoji: string;
  headerText: string;
  showTranslationName: boolean;
  /** Optional URL template; placeholders: {bookEn} {bookLocal} {chapter} {verse} {ref}. */
  verseLinkTemplate: string;
  /** Whole-Bible/books mode: extend a verse to the end of its sentence
   * (max. 4 verses, same chapter). Display only — the deck is unchanged. */
  completeSentences: boolean;
  /** Optional frontmatter property that receives the reference after an
   * insert, e.g. "bible-verse". Empty = off. */
  referenceProperty: string;
  /** Generated once per vault; drives the deterministic deck shuffle. */
  baseSeed: string;
}

export const DEFAULT_SETTINGS: DailyBibleVerseSettings = {
  language: "en",
  translationId: "kjv",
  poolMode: "curated",
  selectedThemes: [],
  bookPreset: "new-testament",
  autoInsertOnDailyNote: true,
  insertPosition: "after-frontmatter",
  calloutType: "bible",
  emoji: "",
  headerText: "",
  showTranslationName: true,
  verseLinkTemplate: "",
  completeSentences: true,
  referenceProperty: "",
  baseSeed: "",
};

/** Stored settings merged over the defaults. Settings saved by a version
 * without "Complete sentences" (≤ 1.0.6) keep that version's behaviour —
 * otherwise the update would silently change the verse texts and references
 * (and two synced devices on different versions would disagree). Fresh
 * installs (no stored settings) get the new default. */
export function mergeStoredSettings(stored: Partial<DailyBibleVerseSettings>): DailyBibleVerseSettings {
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  if (!Object.prototype.hasOwnProperty.call(stored, "completeSentences")) merged.completeSentences = false;
  return merged;
}
