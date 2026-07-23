import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { refKey } from "../src/core/reference";
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
