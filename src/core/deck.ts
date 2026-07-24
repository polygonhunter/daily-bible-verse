import { hashString, mulberry32 } from "./hash";

/** Fisher-Yates shuffle with a deterministic seed. Does not mutate the input. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = items.slice();
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Verses drawn in the first N days of a cycle must not have appeared in the
 * last N days of the previous cycle — without this, a reshuffle could bring a
 * verse back within a few days across the cycle boundary. */
export function boundaryGap(n: number): number {
  return Math.min(30, Math.floor(n / 3));
}

// Decks are memoized per pool-array identity, then per (seed, cycle). Relevant
// for the whole-Bible pool (~31k keys), where sorting + shuffling on every
// lookup would be wasted work.
const deckCache = new WeakMap<
  readonly string[],
  { sorted: string[]; decks: Map<string, string[]> }
>();

function rawShuffle(sorted: readonly string[], baseSeed: string, cycle: number): string[] {
  return seededShuffle(sorted, hashString(`${baseSeed}#${cycle}#${sorted.length}`));
}

function getDeck(poolKeys: readonly string[], baseSeed: string, cycle: number): string[] {
  let entry = deckCache.get(poolKeys);
  if (!entry) {
    entry = { sorted: [...poolKeys].sort(), decks: new Map() };
    deckCache.set(poolKeys, entry);
  }
  const cacheKey = `${baseSeed}#${cycle}`;
  let deck = entry.decks.get(cacheKey);
  if (deck) return deck;

  const n = entry.sorted.length;
  deck = rawShuffle(entry.sorted, baseSeed, cycle);

  // Boundary repair: swap early verses that also sit in the previous cycle's
  // tail into the middle region. Only indices < gap are touched and swap
  // candidates come from [gap, n - gap), so every deck's TAIL equals its raw
  // shuffle — which is why the previous tail can be recomputed here without
  // any stored state, keeping the whole scheme deterministic on all devices.
  const gap = boundaryGap(n);
  if (cycle !== 0 && gap > 0 && n - 2 * gap > 0) {
    const previousTail = new Set(rawShuffle(entry.sorted, baseSeed, cycle - 1).slice(n - gap));
    let swap = gap;
    for (let i = 0; i < gap; i++) {
      if (!previousTail.has(deck[i])) continue;
      while (swap < n - gap && previousTail.has(deck[swap])) swap++;
      if (swap >= n - gap) break;
      [deck[i], deck[swap]] = [deck[swap], deck[i]];
      swap++;
    }
  }

  entry.decks.set(cacheKey, deck);
  // Keep at most a handful of cycles per pool (cycle transitions at most once
  // a day, so this never grows in practice).
  if (entry.decks.size > 4) {
    const oldest = entry.decks.keys().next().value;
    if (oldest !== undefined) entry.decks.delete(oldest);
  }
  return deck;
}

/**
 * Shuffled-deck daily pick: "randomness with system".
 *
 * The pool is sorted (so only membership matters, not input order) and shuffled
 * with a seed derived from (baseSeed, cycle, poolSize). Day N takes position
 * N mod poolSize of the current cycle's deck — every verse appears exactly once
 * per cycle, each cycle uses a fresh permutation, and the boundary repair above
 * guarantees a minimum re-occurrence distance even across reshuffles. Fully
 * deterministic: no history storage, reproducible on every device.
 */
export function pickForDay(
  poolKeys: readonly string[],
  dayIndex: number,
  baseSeed: string,
  rerollOffset = 0,
): string {
  const n = poolKeys.length;
  if (n === 0) throw new Error("pickForDay: empty pool");
  const cycle = Math.floor(dayIndex / n);
  const pos = ((dayIndex % n) + n) % n;
  const deck = getDeck(poolKeys, baseSeed, cycle);
  return deck[(pos + (rerollOffset % n)) % n];
}
