/* Build-time data generation: downloads the public-domain source Bibles,
 * extracts the curated verses for every bundled translation, normalizes
 * versification differences, and emits data/generated/texts.<id>.json.
 *
 * Never runs inside the plugin — end users get the committed output. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseBebliaXml, type ParsedBible } from "../src/core/beblia";
import { refKey } from "../src/core/reference";
import { BEBLIA_BASE_URL, TRANSLATIONS } from "../src/core/translations";
import type { CuratedRefsFile, GeneratedTextsFile } from "../src/core/types";
import { fetchCached } from "./lib/sources";

const root = join(__dirname, "..");
const curated = JSON.parse(
  readFileSync(join(root, "data/curated-refs.json"), "utf8"),
) as CuratedRefsFile;

/** Optional manual fixes: { [translationId]: { [refKey]: "b:c:s-e" } } maps a
 * curated (KJV-versified) ref to the range to read from that translation. */
const overridesPath = join(root, "data/ref-overrides.json");
const overrides: Record<string, Record<string, string>> = existsSync(overridesPath)
  ? JSON.parse(readFileSync(overridesPath, "utf8"))
  : {};

/** Famous-verse spot checks: catches silently shifted versification. */
const SPOT_CHECKS: Record<string, Array<{ key: string; mustContain: string }>> = {
  de: [
    { key: "43:3:16-16", mustContain: "Welt" },
    { key: "19:23:1-3", mustContain: "Hirte" },
  ],
  en: [
    { key: "43:3:16-16", mustContain: "world" },
    { key: "19:23:1-3", mustContain: "shepherd" },
  ],
  es: [
    { key: "43:3:16-16", mustContain: "mundo" },
    { key: "19:23:1-3", mustContain: "pastor" },
  ],
  fr: [
    { key: "43:3:16-16", mustContain: "monde" },
    { key: "19:23:1-3", mustContain: "berger" },
  ],
  it: [
    { key: "43:3:16-16", mustContain: "mondo" },
    { key: "19:23:1-3", mustContain: "pastore" },
  ],
};

function loadBible(bebliaFile: string): ParsedBible {
  const xml = fetchCached(`${BEBLIA_BASE_URL}${bebliaFile}`, bebliaFile);
  return parseBebliaXml(xml);
}

async function main(): Promise<void> {
  console.log("Loading source Bibles…");
  const kjvMeta = TRANSLATIONS.find((t) => t.id === "kjv");
  if (!kjvMeta) throw new Error("KJV must be in the translation registry (versification reference)");
  const kjv = loadBible(kjvMeta.bebliaFile);

  let failed = false;

  for (const meta of TRANSLATIONS) {
    const bible = meta.id === "kjv" ? kjv : loadBible(meta.bebliaFile);
    const texts: Record<string, string> = {};
    const missing: string[] = [];
    let shifted = 0;

    for (const ref of curated.verses) {
      const key = refKey(ref);
      const override = overrides[meta.id]?.[key];
      let { book, chapter, verseStart, verseEnd } = ref;
      if (override) {
        const m = /^(\d+):(\d+):(\d+)-(\d+)$/.exec(override);
        if (!m) throw new Error(`Bad override for ${meta.id}/${key}: ${override}`);
        [book, chapter, verseStart, verseEnd] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      }

      // Versification: many non-English editions count Psalm superscriptions
      // (and e.g. Hosea 14:1) as leading verses. When a chapter has extra
      // leading verses relative to the KJV, shift the requested verses by the
      // difference. Chapters with fewer verses (e.g. Joel 2 in German
      // editions) align 1:1 for the verses they do contain.
      const kjvCount = kjv.index.get(book)?.get(chapter) ?? 0;
      const count = bible.index.get(book)?.get(chapter) ?? 0;
      const delta = !override && count > kjvCount ? count - kjvCount : 0;
      if (delta > 0) shifted++;

      const parts: string[] = [];
      for (let v = verseStart; v <= verseEnd; v++) {
        const text = bible.verses.get(`${book}:${chapter}:${v + delta}`);
        if (!text) {
          missing.push(`${key}${delta ? ` (shifted +${delta})` : ""}`);
          break;
        }
        parts.push(text);
      }
      if (parts.length === verseEnd - verseStart + 1) {
        texts[key] = parts.join(" ");
      }
    }

    for (const check of SPOT_CHECKS[meta.language] ?? []) {
      const text = texts[check.key];
      if (!text || !text.toLowerCase().includes(check.mustContain.toLowerCase())) {
        console.error(
          `✗ ${meta.id}: spot check failed for ${check.key} — expected "${check.mustContain}" in: ${text ?? "<missing>"}`,
        );
        failed = true;
      }
    }

    if (missing.length > 0) {
      console.error(`✗ ${meta.id}: ${missing.length} missing verse(s):`);
      for (const k of missing) console.error(`    ${k}`);
      failed = true;
      continue;
    }

    const out: GeneratedTextsFile = {
      translationId: meta.id,
      source: `beblia:${meta.bebliaFile}`,
      texts: Object.fromEntries(Object.entries(texts).sort(([a], [b]) => a.localeCompare(b))),
    };
    mkdirSync(join(root, "data/generated"), { recursive: true });
    writeFileSync(
      join(root, `data/generated/texts.${meta.id}.json`),
      JSON.stringify(out, null, 1) + "\n",
    );
    console.log(
      `✓ ${meta.id}: ${Object.keys(texts).length} verses (${shifted} chapter(s) with versification shift)`,
    );
  }

  if (failed) {
    console.error("\nFAILED — resolve the refs above (or add data/ref-overrides.json entries).");
    process.exit(1);
  }
  console.log("\nAll translations generated.");
}

void main();
