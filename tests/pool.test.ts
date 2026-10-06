import { describe, expect, it } from "vitest";
import {
  BOOK_PRESETS,
  bookVerseCountsFromIndex,
  buildCuratedPool,
  buildWholeBiblePool,
  poolSizeFromCounts,
} from "../src/core/pool";
import type { CuratedRef, TranslationIndex } from "../src/core/types";
import curated from "../data/curated-refs.json";

const refs: CuratedRef[] = [
  { book: 43, chapter: 3, verseStart: 16, verseEnd: 16, themes: ["love", "faith"] },
  { book: 19, chapter: 23, verseStart: 1, verseEnd: 3, themes: ["comfort", "peace"] },
  { book: 20, chapter: 3, verseStart: 5, verseEnd: 6, themes: ["faith", "wisdom"] },
];

describe("buildCuratedPool", () => {
  it("returns all refs for an empty theme selection", () => {
    expect(buildCuratedPool(refs, [])).toEqual(["43:3:16-16", "19:23:1-3", "20:3:5-6"]);
  });

  it("filters with OR semantics across themes", () => {
    expect(buildCuratedPool(refs, ["faith"])).toEqual(["43:3:16-16", "20:3:5-6"]);
    expect(buildCuratedPool(refs, ["peace", "wisdom"])).toEqual(["19:23:1-3", "20:3:5-6"]);
    expect(buildCuratedPool(refs, ["hope"])).toEqual([]);
  });
});

describe("buildWholeBiblePool", () => {
  const index: TranslationIndex = new Map([
    [1, new Map([[1, 3], [2, 2]])],
    [43, new Map([[1, 2]])],
  ]);

  it("enumerates every verse present in the index", () => {
    const pool = buildWholeBiblePool(index, []);
    expect(pool).toHaveLength(7);
    expect(pool).toContain("1:1:1-1");
    expect(pool).toContain("1:2:2-2");
    expect(pool).toContain("43:1:2-2");
  });

  it("filters by selected books", () => {
    expect(buildWholeBiblePool(index, [43])).toEqual(["43:1:1-1", "43:1:2-2"]);
  });

  it("has sensible presets", () => {
    expect(BOOK_PRESETS["new-testament"].books).toHaveLength(27);
    expect(BOOK_PRESETS["new-testament"].books[0]).toBe(40);
    expect(BOOK_PRESETS["old-testament"].books).toHaveLength(39);
    expect(BOOK_PRESETS.gospels.books).toEqual([40, 41, 42, 43]);
    expect(BOOK_PRESETS.wisdom.books).toEqual([18, 19, 20, 21, 22]);
    expect(BOOK_PRESETS.prophets.books[0]).toBe(23);
    expect(BOOK_PRESETS.prophets.books[16]).toBe(39);
    expect(BOOK_PRESETS.pauline.books[0]).toBe(45);
    expect(BOOK_PRESETS.pauline.books[13]).toBe(58);
  });
});

describe("curated-refs.json (bundled data)", () => {
  it("builds a pool of the documented size with no duplicates", () => {
    const pool = buildCuratedPool(curated.verses as CuratedRef[], []);
    expect(pool.length).toBeGreaterThanOrEqual(300);
    expect(new Set(pool).size).toBe(pool.length);
  });

  it("every theme has a usable pool on its own", () => {
    for (const theme of ["encouragement", "comfort", "hope", "love", "wisdom", "gratitude", "faith", "peace"]) {
      const pool = buildCuratedPool(curated.verses as CuratedRef[], [theme]);
      expect(pool.length, theme).toBeGreaterThanOrEqual(30);
    }
  });
});

describe("poolSizeFromCounts", () => {
  it("matches the size of the enumerated whole-Bible pool", () => {
    const stored = { "1": { "1": 31, "2": 25 }, "19": { "23": 6 }, "43": { "3": 36 } };
    const index: TranslationIndex = new Map(
      Object.entries(stored).map(([b, ch]) => [
        Number(b),
        new Map(Object.entries(ch).map(([c, n]) => [Number(c), n])),
      ]),
    );
    const counts = bookVerseCountsFromIndex(stored);
    expect(counts).toEqual({ "1": 56, "19": 6, "43": 36 });
    expect(poolSizeFromCounts(counts, [])).toBe(buildWholeBiblePool(index, []).length);
    expect(poolSizeFromCounts(counts, [19, 43])).toBe(buildWholeBiblePool(index, [19, 43]).length);
    expect(poolSizeFromCounts(counts, [2])).toBe(0);
  });
});
