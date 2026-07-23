import type { BookNamesTable, RefKey, VerseRange } from "./types";

export function refKey(r: VerseRange): RefKey {
  return `${r.book}:${r.chapter}:${r.verseStart}-${r.verseEnd}`;
}

export function parseRefKey(key: RefKey): VerseRange {
  const m = /^(\d{1,2}):(\d{1,3}):(\d{1,3})-(\d{1,3})$/.exec(key);
  if (!m) throw new Error(`Invalid ref key: ${key}`);
  const range = {
    book: Number(m[1]),
    chapter: Number(m[2]),
    verseStart: Number(m[3]),
    verseEnd: Number(m[4]),
  };
  if (
    range.book < 1 ||
    range.book > 66 ||
    range.chapter < 1 ||
    range.verseStart < 1 ||
    range.verseEnd < range.verseStart
  ) {
    throw new Error(`Invalid ref key: ${key}`);
  }
  return range;
}

/** Books that consist of a single chapter; references conventionally omit the
 * chapter number ("Judas 5", not "Judas 1,5"). */
const SINGLE_CHAPTER_BOOKS = new Set([31, 57, 63, 64, 65]);

/** Localized reference, e.g. "Johannes 3,16", "John 3:16", "Psalm 23,1-3". */
export function formatReference(r: VerseRange, table: BookNamesTable): string {
  const name = table.books[String(r.book)];
  if (!name) throw new Error(`Unknown book number: ${r.book}`);
  const verses =
    r.verseEnd > r.verseStart
      ? `${r.verseStart}${table.rangeSeparator}${r.verseEnd}`
      : `${r.verseStart}`;
  if (SINGLE_CHAPTER_BOOKS.has(r.book)) {
    return `${name} ${verses}`;
  }
  return `${name} ${r.chapter}${table.chapterVerseSeparator}${verses}`;
}
