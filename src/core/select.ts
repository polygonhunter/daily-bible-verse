import { pickForDay } from "./deck";
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

/** Next re-roll: advances the deck offset and returns the resolved key to
 * freeze in the override. */
export function rerollRefForDay(
  poolKeys: readonly RefKey[],
  dayIndex: number,
  baseSeed: string,
  previousRerollCount: number,
): DayOverride {
  const rerollCount = previousRerollCount + 1;
  return {
    refKey: pickForDay(poolKeys, dayIndex, baseSeed, rerollCount),
    rerollCount,
  };
}
