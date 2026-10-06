/** Pure guards for the automatic insertion into daily notes. */

/** Normalizes a vault folder setting: "" / "/" / "./" mean the vault root. */
export function normalizeFolder(folder: string | undefined): string {
  return (folder ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "");
}

/**
 * True when `filePath` lies where the Daily (or Periodic) Notes plugin puts
 * daily notes. A configured folder must be a path prefix (sub-folders are
 * allowed, e.g. a `YYYY/MM/DD` format or manual archiving). With the vault
 * root as folder, the note may only be nested as deep as the format itself
 * nests — so `Meetings/2026-10-06.md` is not mistaken for a daily note.
 */
export function isInDailyNotesFolder(filePath: string, folder: string | undefined, format: string): boolean {
  const dir = normalizeFolder(folder);
  const path = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (dir) return path.startsWith(`${dir}/`);
  const depth = path.split("/").length;
  const formatDepth = format.split("/").length;
  return depth <= formatDepth;
}

/** True when the note's day is within ±`days` of today. Older or future
 * notes (e.g. synced in on a new device) are never touched automatically. */
export function isWithinDayWindow(noteDayIndex: number, todayDayIndex: number, days: number): boolean {
  return Math.abs(noteDayIndex - todayDayIndex) <= days;
}
