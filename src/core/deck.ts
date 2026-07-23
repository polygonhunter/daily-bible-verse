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

// Decks are memoized per pool-array identity, then per cycle seed. Relevant for
// the whole-Bible pool (~31k keys), where sorting + shuffling on every lookup
// would be wasted work.
const deckCache = new WeakMap<readonly string[], { sorted: string[]; decks: Map<number, string[]> }>();

function getDeck(poolKeys: readonly string[], seed: number): string[] {
  let entry = deckCache.get(poolKeys);
  if (!entry) {
    entry = { sorted: [...poolKeys].sort(), decks: new Map() };
    deckCache.set(poolKeys, entry);
  }
  let deck = entry.decks.get(seed);
  if (!deck) {
    deck = seededShuffle(entry.sorted, seed);
    entry.decks.set(seed, deck);
    // Keep at most a handful of cycles per pool (cycle transitions at most
    // once a day, so this never grows in practice).
    if (entry.decks.size > 4) {
      const oldest = entry.decks.keys().next().value;
      if (oldest !== undefined) entry.decks.delete(oldest);
    }
  }
  return deck;
}

/**
 * Shuffled-deck daily pick: "randomness with system".
 *
 * The pool is sorted (so only membership matters, not input order) and shuffled
 * with a seed derived from (baseSeed, cycle, poolSize). Day N takes position
 * N mod poolSize of the current cycle's deck — every verse appears exactly once
 * per cycle, and each cycle uses a fresh permutation, so there are no
 * short-interval repeats and no yearly rotation. Fully deterministic: no
 * history storage, reproducible on every device.
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
  const seed = hashString(`${baseSeed}#${cycle}#${n}`);
  const deck = getDeck(poolKeys, seed);
  return deck[(pos + (rerollOffset % n)) % n];
}
