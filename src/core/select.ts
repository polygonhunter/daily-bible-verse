import { boundaryGap, pickForDay } from "./deck";
import { hashString } from "./hash";
import type { RefKey } from "./types";

export interface DayOverride {
  /** Frozen resolved ref — keeps the day's verse stable even if the pool,
   * themes or seed change afterwards. */
  refKey: RefKey;
  rerollCount: number;
}

export function selectRefForDay(
  poolKeys: readonly RefKey[],
  dayIndex: number,
  baseSeed: string,
  override?: DayOverride,
): RefKey {
  if (override?.refKey) return override.refKey;
  return pickForDay(poolKeys, dayIndex, baseSeed);
}

/** How many upcoming days a re-roll must not "steal" a verse from. */
const UPCOMING_HORIZON_DAYS = 30;

/**
 * Next re-roll for a day. Returns the resolved key to freeze in the override.
 *
 * The replacement is drawn from a verse of a PAST day (at least
 * `max(1, boundaryGap(n))` days back). Drawing `deck[pos + k]` — as earlier
 * versions did — is exactly the verse of day d+k, which then appeared twice
 * within a few days. Candidates are walked deterministically from a hashed
 * start, skipping today's deck verse, the previous override and any verse
 * scheduled for the next 30 days (when the pool is large enough). Fully
 * deterministic: the same inputs give the same result on every device.
 */
export function rerollRefForDay(
  poolKeys: readonly RefKey[],
  dayIndex: number,
  baseSeed: string,
  previousRerollCount: number,
  previousRefKey?: RefKey,
): DayOverride {
  const rerollCount = previousRerollCount + 1;
  const n = poolKeys.length;
  const today = pickForDay(poolKeys, dayIndex, baseSeed);
  if (n <= 1) return { refKey: today, rerollCount };

  const minBack = Math.max(1, boundaryGap(n));
  const span = n - minBack; // ≥ 1, since boundaryGap(n) ≤ n / 3
  const horizon = Math.min(UPCOMING_HORIZON_DAYS, Math.max(0, n - 3));
  const upcoming = new Set<RefKey>();
  for (let j = 1; j <= horizon; j++) upcoming.add(pickForDay(poolKeys, dayIndex + j, baseSeed));

  const start = hashString(`${baseSeed}#reroll#${dayIndex}#${rerollCount}`) % span;
  const candidate = (i: number): RefKey =>
    pickForDay(poolKeys, dayIndex - (minBack + ((start + i) % span)), baseSeed);

  // Strict pass first, then relax the constraints for tiny pools.
  const passes: Array<(key: RefKey) => boolean> = [
    (key) => key !== today && key !== previousRefKey && !upcoming.has(key),
    (key) => key !== today && key !== previousRefKey,
    (key) => key !== today,
  ];
  for (const accept of passes) {
    for (let i = 0; i < span; i++) {
      const key = candidate(i);
      if (accept(key)) return { refKey: key, rerollCount };
    }
  }
  return { refKey: today, rerollCount };
}
