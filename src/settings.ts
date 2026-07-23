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
  emoji: "📖",
  headerText: "",
  showTranslationName: true,
  verseLinkTemplate: "",
  baseSeed: "",
};
