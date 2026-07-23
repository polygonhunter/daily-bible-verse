import { describe, expect, it } from "vitest";
import { formatReference, parseRefKey, refKey } from "../src/core/reference";
import type { BookNamesTable } from "../src/core/types";
import de from "../data/booknames/de.json";
import en from "../data/booknames/en.json";
import es from "../data/booknames/es.json";
import fr from "../data/booknames/fr.json";
import it_ from "../data/booknames/it.json";

const tables: Record<string, BookNamesTable> = { de, en, es, fr, it: it_ };

describe("refKey / parseRefKey", () => {
  it("round-trips", () => {
    const r = { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 };
    expect(parseRefKey(refKey(r))).toEqual(r);
    const range = { book: 19, chapter: 23, verseStart: 1, verseEnd: 3 };
    expect(parseRefKey(refKey(range))).toEqual(range);
  });

  it("rejects malformed keys", () => {
    for (const bad of ["", "43:3:16", "43:3:16-15", "0:1:1-1", "67:1:1-1", "43-3-16", "a:b:c-d"]) {
      expect(() => parseRefKey(bad), bad).toThrow();
    }
  });
});

describe("formatReference", () => {
  const john316 = { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 };
  const psalm23 = { book: 19, chapter: 23, verseStart: 1, verseEnd: 3 };

  it("formats per-language conventions", () => {
    expect(formatReference(john316, tables.de)).toBe("Johannes 3,16");
    expect(formatReference(john316, tables.en)).toBe("John 3:16");
    expect(formatReference(john316, tables.es)).toBe("Juan 3:16");
    expect(formatReference(john316, tables.fr)).toBe("Jean 3:16");
    expect(formatReference(john316, tables.it)).toBe("Giovanni 3,16");
  });

  it("formats ranges", () => {
    expect(formatReference(psalm23, tables.de)).toBe("Psalm 23,1-3");
    expect(formatReference(psalm23, tables.en)).toBe("Psalm 23:1-3");
  });

  it("omits the chapter for single-chapter books", () => {
    const jude = { book: 65, chapter: 1, verseStart: 24, verseEnd: 25 };
    expect(formatReference(jude, tables.de)).toBe("Judas 24-25");
    expect(formatReference(jude, tables.en)).toBe("Jude 24-25");
  });

  it("every language table covers all 66 books", () => {
    for (const [lang, table] of Object.entries(tables)) {
      for (let book = 1; book <= 66; book++) {
        expect(table.books[String(book)], `${lang} book ${book}`).toBeTruthy();
      }
      expect(Object.keys(table.books)).toHaveLength(66);
    }
  });
});
