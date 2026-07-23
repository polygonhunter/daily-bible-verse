import { sanitizeVerseText } from "./sanitize";
import type { TranslationIndex } from "./types";

export interface ParsedBible {
  /** "book:chapter:verse" (single verse, no range) -> sanitized text. */
  verses: Map<string, string>;
  /** book -> chapter -> highest verse number. */
  index: TranslationIndex;
}

/** Parses a Beblia Holy-Bible-XML-Format document:
 *   <bible ...><testament ...><book number="43"><chapter number="3">
 *     <verse number="16">...</verse>
 * Shared by the build-time fetch script and the runtime whole-Bible download,
 * so both go through the exact same sanitizing. */
export function parseBebliaXml(xml: string): ParsedBible {
  const verses = new Map<string, string>();
  const index: TranslationIndex = new Map();
  const re =
    /<book\s+number="(\d+)"|<chapter\s+number="(\d+)"|<verse\s+number="(\d+)"\s*>([\s\S]*?)<\/verse>/g;
  let book = 0;
  let chapter = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) {
      book = Number(m[1]);
    } else if (m[2] !== undefined) {
      chapter = Number(m[2]);
    } else {
      const verse = Number(m[3]);
      if (book === 0 || chapter === 0) continue;
      const text = sanitizeVerseText(m[4]);
      // Skip separator artifacts like Darby's trailing "***" pseudo-verses —
      // they must never become a daily verse in whole-Bible mode.
      if (text.length === 0 || !/\p{L}/u.test(text)) continue;
      verses.set(`${book}:${chapter}:${verse}`, text);
      let chapters = index.get(book);
      if (!chapters) {
        chapters = new Map();
        index.set(book, chapters);
      }
      chapters.set(chapter, Math.max(chapters.get(chapter) ?? 0, verse));
    }
  }
  if (verses.size < 1000) {
    throw new Error(`Beblia parse produced only ${verses.size} verses — unexpected format`);
  }
  return { verses, index };
}
