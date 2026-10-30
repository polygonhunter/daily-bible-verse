import { moment as obsidianMoment } from "obsidian";

/** Obsidian's moment export is typed as a namespace; cast once to call it.
 * (Never import "moment" itself — Obsidian provides no such module.) */
export const moment = obsidianMoment as unknown as typeof import("moment");
