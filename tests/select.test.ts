import { describe, expect, it } from "vitest";
import { pickForDay } from "../src/core/deck";
import { rerollRefForDay, selectRefForDay } from "../src/core/select";

const pool = Array.from({ length: 50 }, (_, i) => `19:1:${i + 1}-${i + 1}`);

describe("selectRefForDay", () => {
  it("uses the deck when no override exists", () => {
    expect(selectRefForDay(pool, 7, "seed")).toBe(pickForDay(pool, 7, "seed"));
  });

  it("a frozen override wins over the deck — even if the pool changed", () => {
    const override = { refKey: "43:3:16-16", rerollCount: 2 };
    expect(selectRefForDay(pool, 7, "seed", override)).toBe("43:3:16-16");
    expect(selectRefForDay(pool.slice(0, 10), 7, "seed", override)).toBe("43:3:16-16");
  });
});

describe("rerollRefForDay", () => {
  it("advances deterministically and differs from the original pick", () => {
    const original = selectRefForDay(pool, 7, "seed");
    const first = rerollRefForDay(pool, 7, "seed", 0);
    expect(first.rerollCount).toBe(1);
    expect(first.refKey).not.toBe(original);
    expect(rerollRefForDay(pool, 7, "seed", 0)).toEqual(first);
    const second = rerollRefForDay(pool, 7, "seed", first.rerollCount, first.refKey);
    expect(second.rerollCount).toBe(2);
    expect(second.refKey).not.toBe(first.refKey);
    expect(second.refKey).not.toBe(original);
  });

  it("never steals the verse of one of the next 30 days", () => {
    for (const p of [pool, Array.from({ length: 400 }, (_, i) => `19:${1 + (i % 150)}:${1 + Math.floor(i / 150)}-${1 + Math.floor(i / 150)}`)]) {
      for (let day = 0; day < 3 * p.length; day += 7) {
        let previous: string | undefined;
        for (let count = 0; count < 3; count++) {
          const r = rerollRefForDay(p, day, "seed", count, previous);
          for (let j = 1; j <= 30; j++) {
            expect(r.refKey).not.toBe(pickForDay(p, day + j, "seed"));
          }
          expect(r.refKey).not.toBe(pickForDay(p, day, "seed"));
          previous = r.refKey;
        }
      }
    }
  });

  it("handles tiny pools without throwing", () => {
    expect(rerollRefForDay(["1:1:1-1"], 3, "s", 0).refKey).toBe("1:1:1-1");
    const two = ["1:1:1-1", "1:1:2-2"];
    const r = rerollRefForDay(two, 3, "s", 0);
    expect(r.refKey).not.toBe(pickForDay(two, 3, "s"));
  });
});
