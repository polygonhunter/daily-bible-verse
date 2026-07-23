/* Build-time data generation: downloads the public-domain source Bibles,
 * extracts the curated verses for every bundled translation, normalizes
 * versification differences, and emits data/generated/texts.<id>.json.
 *
 * Never runs inside the plugin — end users get the committed output. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseBebliaXml, type ParsedBible } from "../src/core/beblia";
import { refKey } from "../src/core/reference";
import { BEBLIA_BASE_URL, TRANSLATIONS, type TranslationMeta } from "../src/core/translations";
import type { CuratedRefsFile, GeneratedTextsFile } from "../src/core/types";
import { fetchCached } from "./lib/sources";

const root = join(__dirname, "..");
const curated = JSON.parse(
  readFileSync(join(root, "data/curated-refs.json"), "utf8"),
) as CuratedRefsFile;

/** Manual versification fixes: { [translationId]: { [refKey]: "b:c:s-e" } } maps a
 * curated (KJV-versified) ref to the range to read from that translation. An
 * identical mapping disables the automatic leading-verse shift. */
const overridesPath = join(root, "data/ref-overrides.json");
const overrides: Record<string, Record<string, string>> = existsSync(overridesPath)
  ? JSON.parse(readFileSync(overridesPath, "utf8"))
  : {};

/** Translations whose chapters are 1:1 KJV-aligned even when they contain
 * MORE verses than the KJV — their surplus entries are trailing artifacts
 * (Darby: "***" separators at Psalm ends), not leading superscriptions. */
const NO_AUTO_SHIFT = new Set(["darby1890"]);

/** Known-legitimate length outliers (audited manually — not misalignments):
 * Darby Romans 8:1 follows the critical text (short verse); the Romance
 * translations merge Psalm 34's long superscription into verse 1. */
const ALLOWED_OUTLIERS = new Set([
  "45:8:1-1|darby1890",
  "19:34:1-1|rva",
  "19:34:1-1|segond1910",
  "19:34:1-1|diodati1649",
]);

/** Source-specific text cleanup, applied per verse after sanitizing.
 * (Darby's {curly-brace} annotations are already stripped generically by
 * core/sanitize.ts, which also covers the runtime whole-Bible download.) */
const POST_PROCESS: Record<string, (text: string) => string> = {
  // The RVA source corrupts opening "¡" into a soft hyphen (U+00AD).
  rva: (t) => t.replace(/­/g, "¡"),
  // The Segond source drops the accent on the divine name and leaves a stray
  // trailing " -" in a few verses.
  segond1910: (t) => t.replace(/\bEternel\b/g, "Éternel").replace(/\s-\s*$/, ""),
};

/** Famous-verse spot checks: catches silently shifted versification. */
const SPOT_CHECKS: Record<string, Array<{ key: string; mustContain: string }>> = {
  de: [
    { key: "43:3:16-16", mustContain: "Welt" },
    { key: "19:23:1-3", mustContain: "Hirte" },
    // 3 John and Ecclesiastes 4 carry their surplus verse at the chapter END
    // in German sources — the leading-shift heuristic once misfired here
    // (fixed via ref-overrides.json).
    { key: "64:1:2-2", mustContain: "gesund" },
    { key: "21:4:9-10", mustContain: "besser" },
  ],
  en: [
    { key: "43:3:16-16", mustContain: "world" },
    { key: "19:23:1-3", mustContain: "shepherd" },
    { key: "19:23:4-4", mustContain: "though" },
    { key: "19:46:1-2", mustContain: "refuge" },
    { key: "19:51:10-10", mustContain: "heart" },
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

interface TranslationResult {
  meta: TranslationMeta;
  texts: Record<string, string>;
  /** "book:chapter" -> { delta, refs affected } for review. */
  shifted: Map<string, { delta: number; refs: string[] }>;
  missing: string[];
}

function loadBible(bebliaFile: string): ParsedBible {
  const xml = fetchCached(`${BEBLIA_BASE_URL}${bebliaFile}`, bebliaFile);
  return parseBebliaXml(xml);
}

function extract(meta: TranslationMeta, bible: ParsedBible, kjv: ParsedBible): TranslationResult {
  const texts: Record<string, string> = {};
  const shifted = new Map<string, { delta: number; refs: string[] }>();
  const missing: string[] = [];
  const post = POST_PROCESS[meta.id] ?? ((t: string) => t);

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
    // (and e.g. Hosea 14:1) as extra LEADING verses. When a chapter has more
    // verses than the KJV, shift the requested verses by the difference.
    // Chapters whose extra verse sits at the END (e.g. German 3 John) need an
    // entry in data/ref-overrides.json instead — the audit report below lists
    // every shifted chapter for manual review.
    const kjvCount = kjv.index.get(book)?.get(chapter) ?? 0;
    const count = bible.index.get(book)?.get(chapter) ?? 0;
    const delta =
      !override && !NO_AUTO_SHIFT.has(meta.id) && count > kjvCount ? count - kjvCount : 0;
    if (delta > 0) {
      const chapterKey = `${book}:${chapter}`;
      const entry = shifted.get(chapterKey) ?? { delta, refs: [] };
      entry.refs.push(key);
      shifted.set(chapterKey, entry);
    }

    const parts: string[] = [];
    for (let v = verseStart; v <= verseEnd; v++) {
      const text = bible.verses.get(`${book}:${chapter}:${v + delta}`);
      if (!text) {
        missing.push(`${key}${delta ? ` (shifted +${delta})` : ""}`);
        break;
      }
      parts.push(post(text));
    }
    if (parts.length === verseEnd - verseStart + 1) {
      texts[key] = parts.join(" ").trim();
    }
  }
  return { meta, texts, shifted, missing };
}

/** Cross-translation length audit: a verse whose (normalized) length is far
 * off the median of the other translations is likely the WRONG verse. */
function lengthAudit(results: TranslationResult[]): string[] {
  const warnings: string[] = [];
  const means = new Map<string, number>();
  for (const r of results) {
    const lengths = Object.values(r.texts).map((t) => t.length);
    means.set(r.meta.id, lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length));
  }
  const allKeys = curated.verses.map(refKey);
  for (const key of allKeys) {
    const norms = results
      .filter((r) => r.texts[key])
      .map((r) => ({ id: r.meta.id, norm: r.texts[key].length / (means.get(r.meta.id) ?? 1) }));
    if (norms.length < 3) continue;
    const sorted = [...norms].sort((a, b) => a.norm - b.norm);
    const median = sorted[Math.floor(sorted.length / 2)].norm;
    for (const { id, norm } of norms) {
      const ratio = norm / median;
      if ((ratio < 0.5 || ratio > 2.0) && !ALLOWED_OUTLIERS.has(`${key}|${id}`)) {
        warnings.push(`${key} ${id}: length ratio ${ratio.toFixed(2)} vs median — verify verse alignment`);
      }
    }
  }
  return warnings;
}

async function main(): Promise<void> {
  console.log("Loading source Bibles…");
  const kjvMeta = TRANSLATIONS.find((t) => t.id === "kjv");
  if (!kjvMeta) throw new Error("KJV must be in the translation registry (versification reference)");
  const kjv = loadBible(kjvMeta.bebliaFile);

  const results: TranslationResult[] = [];
  for (const meta of TRANSLATIONS) {
    const bible = meta.id === "kjv" ? kjv : loadBible(meta.bebliaFile);
    results.push(extract(meta, bible, kjv));
  }

  let failed = false;

  // Shift report — every auto-shifted chapter, for manual review.
  console.log("\nVersification shift report (auto-shifted chapters):");
  for (const r of results) {
    if (r.shifted.size === 0) continue;
    const chapters = [...r.shifted.entries()]
      .map(([ch, info]) => `${ch}(+${info.delta}:${info.refs.length} refs)`)
      .join(", ");
    console.log(`  ${r.meta.id}: ${chapters}`);
  }

  const lengthWarnings = lengthAudit(results);
  if (lengthWarnings.length > 0) {
    console.warn(`\n⚠ Length-outlier audit (${lengthWarnings.length}):`);
    for (const w of lengthWarnings) console.warn(`  ${w}`);
  } else {
    console.log("\nLength-outlier audit: clean.");
  }

  for (const r of results) {
    for (const check of SPOT_CHECKS[r.meta.language] ?? []) {
      const text = r.texts[check.key];
      if (!text || !text.toLowerCase().includes(check.mustContain.toLowerCase())) {
        console.error(
          `✗ ${r.meta.id}: spot check failed for ${check.key} — expected "${check.mustContain}" in: ${text ?? "<missing>"}`,
        );
        failed = true;
      }
    }
    if (r.missing.length > 0) {
      console.error(`✗ ${r.meta.id}: ${r.missing.length} missing verse(s):`);
      for (const k of r.missing) console.error(`    ${k}`);
      failed = true;
      continue;
    }
    const out: GeneratedTextsFile = {
      translationId: r.meta.id,
      source: `beblia:${r.meta.bebliaFile}`,
      texts: Object.fromEntries(Object.entries(r.texts).sort(([a], [b]) => a.localeCompare(b))),
    };
    mkdirSync(join(root, "data/generated"), { recursive: true });
    writeFileSync(
      join(root, `data/generated/texts.${r.meta.id}.json`),
      JSON.stringify(out, null, 1) + "\n",
    );
    console.log(`✓ ${r.meta.id}: ${Object.keys(r.texts).length} verses written`);
  }

  if (failed) {
    console.error("\nFAILED — resolve the refs above (or add data/ref-overrides.json entries).");
    process.exit(1);
  }
  console.log("\nAll translations generated.");
}

void main();
