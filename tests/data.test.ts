import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parseRefKey, refKey } from "../src/core/reference";
import { TRANSLATIONS } from "../src/core/translations";
import type { CuratedRefsFile, GeneratedTextsFile } from "../src/core/types";

const root = join(__dirname, "..");
const curated = JSON.parse(
  readFileSync(join(root, "data/curated-refs.json"), "utf8"),
) as CuratedRefsFile;

describe("generated verse data", () => {
  const allKeys = curated.verses.map(refKey);

  for (const meta of TRANSLATIONS) {
    it(`texts.${meta.id}.json covers every curated ref`, () => {
      const file = JSON.parse(
        readFileSync(join(root, `data/generated/texts.${meta.id}.json`), "utf8"),
      ) as GeneratedTextsFile;
      expect(file.translationId).toBe(meta.id);
      for (const key of allKeys) {
        expect(file.texts[key], `${meta.id} missing ${key}`).toBeTruthy();
      }
      // No stale keys from removed refs.
      expect(Object.keys(file.texts).sort()).toEqual([...allKeys].sort());
      // Source refs: only for curated keys, same book and span, valid.
      for (const [key, source] of Object.entries(file.refs ?? {})) {
        expect(allKeys, `${meta.id} refs has stray key ${key}`).toContain(key);
        expect(source).not.toBe(key);
        const a = parseRefKey(key);
        const b = parseRefKey(source);
        expect(b.book, `${meta.id} ${key}`).toBe(a.book);
        expect(b.verseEnd - b.verseStart, `${meta.id} ${key}`).toBe(a.verseEnd - a.verseStart);
      }
      // No unsanitized HTML remnants.
      for (const [key, text] of Object.entries(file.texts)) {
        expect(text, `${meta.id} ${key} contains markup`).not.toMatch(/<[a-zA-Z/]/);
      }
    });
  }

  it("registry has one default per language and unique ids", () => {
    const ids = TRANSLATIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lang of ["de", "en", "es", "fr", "it"] as const) {
      expect(TRANSLATIONS.some((t) => t.language === lang)).toBe(true);
    }
  });
});

describe("architecture", () => {
  it("src/core stays free of Obsidian imports", () => {
    const coreDir = join(root, "src/core");
    for (const file of readdirSync(coreDir)) {
      const content = readFileSync(join(coreDir, file), "utf8");
      expect(content, `${file} imports obsidian`).not.toMatch(/from ["']obsidian["']/);
    }
  });
});
