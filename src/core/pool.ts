import { refKey } from "./reference";
import type { CuratedRef, RefKey, TranslationIndex } from "./types";

/** Curated pool, optionally filtered by themes (OR semantics).
 * An empty theme selection means "all themes". */
export function buildCuratedPool(
  refs: readonly CuratedRef[],
  selectedThemes: readonly string[],
): RefKey[] {
  if (selectedThemes.length === 0) return refs.map(refKey);
  const selected = new Set(selectedThemes);
  return refs.filter((r) => r.themes.some((t) => selected.has(t))).map(refKey);
}

/** Single-verse pool enumerated from the verses actually present in a
 * downloaded translation — versification differences can never produce a
 * missing verse this way. An empty book selection means "whole Bible". */
export function buildWholeBiblePool(
  index: TranslationIndex,
  selectedBooks: readonly number[],
): RefKey[] {
  const books = selectedBooks.length > 0 ? new Set(selectedBooks) : null;
  const keys: RefKey[] = [];
  for (const [book, chapters] of index) {
    if (books && !books.has(book)) continue;
    for (const [chapter, verseCount] of chapters) {
      for (let v = 1; v <= verseCount; v++) {
        keys.push(`${book}:${chapter}:${v}-${v}`);
      }
    }
  }
  return keys;
}

export const BOOK_PRESETS: Record<string, { label: string; books: number[] }> = {
  "old-testament": {
    label: "Old Testament",
    books: Array.from({ length: 39 }, (_, i) => i + 1),
  },
  "new-testament": {
    label: "New Testament",
    books: Array.from({ length: 27 }, (_, i) => i + 40),
  },
  gospels: { label: "Gospels", books: [40, 41, 42, 43] },
  psalms: { label: "Psalms", books: [19] },
  "psalms-proverbs": { label: "Psalms & Proverbs", books: [19, 20] },
};
