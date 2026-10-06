import type { GeneratedTextsFile } from "../core/types";
import darby1890 from "../../data/generated/texts.darby1890.json";
import diodati1649 from "../../data/generated/texts.diodati1649.json";
import elberfelder1905 from "../../data/generated/texts.elberfelder1905.json";
import kjv from "../../data/generated/texts.kjv.json";
import luther1912 from "../../data/generated/texts.luther1912.json";
import rva from "../../data/generated/texts.rva.json";
import segond1910 from "../../data/generated/texts.segond1910.json";

/** Curated verse texts for every bundled translation, inlined into the plugin
 * bundle at build time (~600 KB total) so curated mode works fully offline.
 *
 * The production build (esbuild.config.mjs) embeds each file as a JSON
 * STRING instead of an object literal: the JS engine then only has to scan a
 * string at plugin load, and just the one translation in use is parsed —
 * lazily, on first access. Under vitest the imports are plain objects, hence
 * the typeof switch. */
const RAW: Record<string, unknown> = {
  luther1912,
  elberfelder1905,
  kjv,
  darby1890,
  rva,
  segond1910,
  diodati1649,
};

const parsed = new Map<string, GeneratedTextsFile>();

export function bundledTranslationIds(): string[] {
  return Object.keys(RAW);
}

export function getBundledTexts(translationId: string): GeneratedTextsFile | undefined {
  const cached = parsed.get(translationId);
  if (cached) return cached;
  if (!Object.prototype.hasOwnProperty.call(RAW, translationId)) return undefined;
  const raw = RAW[translationId];
  const file = (typeof raw === "string" ? JSON.parse(raw) : raw) as GeneratedTextsFile;
  parsed.set(translationId, file);
  return file;
}
