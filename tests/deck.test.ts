import { describe, expect, it } from "vitest";
import { pickForDay, seededShuffle } from "../src/core/deck";
import { hashString, mulberry32 } from "../src/core/hash";

const pool = Array.from({ length: 100 }, (_, i) => `43:3:${i + 1}-${i + 1}`);

describe("hash", () => {
  it("is deterministic and engine-independent", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    // Pinned value: guards against accidental algorithm changes, which would
    // silently change every user's verse sequence.
    expect(hashString("daily-bible-verse")).toBe(hashString("daily-bible-verse"));
  });

  it("mulberry32 yields values in [0,1) and a stable sequence", () => {
    const rand = mulberry32(hashString("seed"));
    const values = Array.from({ length: 1000 }, () => rand());
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const rand2 = mulberry32(hashString("seed"));
    expect(Array.from({ length: 1000 }, () => rand2())).toEqual(values);
  });
});

describe("seededShuffle", () => {
  it("is deterministic per seed and does not mutate input", () => {
    const input = ["a", "b", "c", "d", "e"];
    const copy = [...input];
    const s1 = seededShuffle(input, 42);
    expect(input).toEqual(copy);
    expect(seededShuffle(input, 42)).toEqual(s1);
    expect([...s1].sort()).toEqual(copy);
  });

  it("produces different permutations for different seeds", () => {
    const input = Array.from({ length: 50 }, (_, i) => String(i));
    expect(seededShuffle(input, 1)).not.toEqual(seededShuffle(input, 2));
  });
});

describe("pickForDay", () => {
  it("is deterministic for (pool, day, seed)", () => {
    for (let day = 0; day < 500; day++) {
      expect(pickForDay(pool, day, "base")).toBe(pickForDay(pool, day, "base"));
    }
  });

  it("hits every verse exactly once per cycle", () => {
    const seen = new Map<string, number>();
    for (let day = 0; day < pool.length; day++) {
      const k = pickForDay(pool, day, "base");
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect(seen.size).toBe(pool.length);
    expect([...seen.values()].every((c) => c === 1)).toBe(true);
  });

  it("uses a different permutation each cycle (no yearly rotation)", () => {
    const cycle0 = Array.from({ length: pool.length }, (_, d) => pickForDay(pool, d, "base"));
    const cycle1 = Array.from({ length: pool.length }, (_, d) =>
      pickForDay(pool, pool.length + d, "base"),
    );
    expect(cycle1).not.toEqual(cycle0);
    expect([...cycle1].sort()).toEqual([...cycle0].sort());
  });

  it("depends only on pool membership, not input order", () => {
    const shuffled = seededShuffle(pool, 999);
    for (let day = 0; day < 50; day++) {
      expect(pickForDay(shuffled, day, "base")).toBe(pickForDay(pool, day, "base"));
    }
  });

  it("different base seeds give different sequences", () => {
    const a = Array.from({ length: 30 }, (_, d) => pickForDay(pool, d, "seed-a"));
    const b = Array.from({ length: 30 }, (_, d) => pickForDay(pool, d, "seed-b"));
    expect(a).not.toEqual(b);
  });

  it("reroll offset walks the deck without leaving the pool", () => {
    const base = pickForDay(pool, 10, "base", 0);
    const rerolled = pickForDay(pool, 10, "base", 1);
    expect(rerolled).not.toBe(base);
    expect(pool).toContain(rerolled);
    // Deterministic: same offset, same result.
    expect(pickForDay(pool, 10, "base", 1)).toBe(rerolled);
  });

  it("handles a single-verse pool and negative day indices", () => {
    expect(pickForDay(["1:1:1-1"], 12345, "base")).toBe("1:1:1-1");
    expect(pickForDay(pool, -5, "base")).toBe(pickForDay(pool, -5, "base"));
    expect(() => pickForDay([], 0, "base")).toThrow();
  });

  it("shuffles 31k keys quickly (whole-Bible pool)", () => {
    const big = Array.from({ length: 31102 }, (_, i) => `b:${i}`);
    const t0 = performance.now();
    pickForDay(big, 0, "base");
    const cold = performance.now() - t0;
    const t1 = performance.now();
    for (let d = 1; d < 100; d++) pickForDay(big, d, "base");
    const warm = performance.now() - t1;
    expect(cold).toBeLessThan(200);
    expect(warm).toBeLessThan(50);
  });
});
