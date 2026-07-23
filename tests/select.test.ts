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
    const second = rerollRefForDay(pool, 7, "seed", first.rerollCount);
    expect(second.rerollCount).toBe(2);
    expect(second.refKey).not.toBe(first.refKey);
  });
});
