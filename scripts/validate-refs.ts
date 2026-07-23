/* Structural validation + statistics for data/curated-refs.json.
 * Runs offline (no network). Verse existence against real translation data is
 * enforced by scripts/fetch-verses.ts, which fails loudly on gaps. */
import { readFileSync } from "fs";
import { join } from "path";
import { refKey } from "../src/core/reference";
import { ALL_THEMES, type CuratedRefsFile } from "../src/core/types";

const root = join(__dirname, "..");
const file = JSON.parse(
  readFileSync(join(root, "data/curated-refs.json"), "utf8"),
) as CuratedRefsFile;

const errors: string[] = [];
const seen = new Set<string>();
const themeCounts = new Map<string, number>(ALL_THEMES.map((t) => [t, 0]));

if (file.schemaVersion !== 1) errors.push(`Unexpected schemaVersion: ${file.schemaVersion}`);

for (const ref of file.verses) {
  const key = refKey(ref);
  if (ref.book < 1 || ref.book > 66) errors.push(`${key}: book out of range`);
  if (ref.chapter < 1 || ref.chapter > 150) errors.push(`${key}: chapter out of range`);
  if (ref.verseStart < 1 || ref.verseEnd < ref.verseStart)
    errors.push(`${key}: invalid verse range`);
  if (ref.verseEnd - ref.verseStart > 4)
    errors.push(`${key}: range longer than 5 verses — keep daily verses short`);
  if (seen.has(key)) errors.push(`${key}: duplicate reference`);
  seen.add(key);
  if (ref.themes.length === 0) errors.push(`${key}: no themes`);
  for (const t of ref.themes) {
    if (!(ALL_THEMES as readonly string[]).includes(t)) {
      errors.push(`${key}: unknown theme "${t}"`);
    } else {
      themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
    }
  }
  if (new Set(ref.themes).size !== ref.themes.length) errors.push(`${key}: duplicate themes`);
}

console.log(`Total curated verses: ${file.verses.length}`);
console.log("\nPool size per single theme:");
for (const [theme, count] of themeCounts) {
  const warn = count < 30 ? "  ⚠ below 30 — short cycle" : "";
  console.log(`  ${theme.padEnd(14)} ${String(count).padStart(4)}${warn}`);
}

const books = new Set(file.verses.map((v) => v.book));
console.log(`\nDistinct books used: ${books.size}`);

if (file.verses.length < 300) {
  console.warn(`\n⚠ Only ${file.verses.length} verses — target is ≥ 365 for a repeat-free year.`);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nOK — curated-refs.json is structurally valid.");
