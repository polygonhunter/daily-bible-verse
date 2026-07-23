import type { GeneratedTextsFile } from "../core/types";
import darby1890 from "../../data/generated/texts.darby1890.json";
import diodati1649 from "../../data/generated/texts.diodati1649.json";
import elberfelder1905 from "../../data/generated/texts.elberfelder1905.json";
import kjv from "../../data/generated/texts.kjv.json";
import luther1912 from "../../data/generated/texts.luther1912.json";
import rva from "../../data/generated/texts.rva.json";
import segond1910 from "../../data/generated/texts.segond1910.json";

/** Curated verse texts for every bundled translation, inlined into the plugin
 * bundle at build time (~600 KB total) so curated mode works fully offline. */
export const BUNDLED_TEXTS: Record<string, GeneratedTextsFile> = {
  luther1912,
  elberfelder1905,
  kjv,
  darby1890,
  rva,
  segond1910,
  diodati1649,
};
