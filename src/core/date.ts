/** All date math uses local calendar components so the verse flips at local
 * midnight (matching daily notes) and is immune to DST offsets. */

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysSinceEpochLocal(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** Day index for a "YYYY-MM-DD" key. Inverse of localDateKey ∘ daysSinceEpochLocal. */
export function dateKeyToDayIndex(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}
