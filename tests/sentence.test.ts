import { describe, expect, it } from "vitest";
import { endsSentence, extendToSentence } from "../src/core/sentence";

const chapter: Record<number, string> = {
  1: "In the beginning God created the heaven and the earth.",
  2: "And he said unto them,",
  3: "Go ye into all the world;",
  4: "and preach the gospel.",
  5: "And they went",
  6: "out",
  7: "and on",
  8: "and on",
  9: "and on.",
  10: "Er sprach: »Fürchtet euch nicht!«",
};
const get = (v: number) => chapter[v] ?? null;
const range = (start: number, end = start) => ({ book: 41, chapter: 16, verseStart: start, verseEnd: end });

describe("endsSentence", () => {
  it("recognizes sentence ends including closing quotes", () => {
    expect(endsSentence("Amen.")).toBe(true);
    expect(endsSentence("Why?”")).toBe(true);
    expect(endsSentence("»Fürchtet euch nicht!«")).toBe(true);
    expect(endsSentence("(so it was.)")).toBe(true);
    expect(endsSentence("And he said unto them,")).toBe(false);
    expect(endsSentence("Go ye;")).toBe(false);
  });
});

describe("extendToSentence", () => {
  it("leaves complete verses alone", async () => {
    const r = range(1);
    expect(await extendToSentence(r, get)).toBe(r);
  });

  it("extends a fragment until the sentence ends", async () => {
    expect(await extendToSentence(range(2), get)).toEqual(range(2, 4));
  });

  it("never spans more than maxVerses", async () => {
    expect(await extendToSentence(range(5), get)).toEqual(range(5, 8));
    expect(await extendToSentence(range(5), get, 2)).toEqual(range(5, 6));
  });

  it("stops at the end of the chapter", async () => {
    const tail = { 1: "and so", 2: "it goes" };
    expect(await extendToSentence(range(1), (v) => (tail as Record<number, string>)[v] ?? null)).toEqual(range(1, 2));
  });

  it("works with async lookups", async () => {
    expect(await extendToSentence(range(2), async (v) => get(v))).toEqual(range(2, 4));
  });
});
