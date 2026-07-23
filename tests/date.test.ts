import { describe, expect, it } from "vitest";
import { dateKeyToDayIndex, daysSinceEpochLocal, localDateKey } from "../src/core/date";

describe("date", () => {
  it("formats local date keys", () => {
    expect(localDateKey(new Date(2026, 6, 23, 12, 0))).toBe("2026-07-23");
    expect(localDateKey(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
  });

  it("differs by one across a local midnight boundary", () => {
    const before = new Date(2026, 6, 23, 23, 59);
    const after = new Date(2026, 6, 24, 0, 1);
    expect(daysSinceEpochLocal(after) - daysSinceEpochLocal(before)).toBe(1);
    expect(localDateKey(before)).not.toBe(localDateKey(after));
  });

  it("is stable across times within the same day", () => {
    const morning = new Date(2026, 6, 23, 0, 0, 1);
    const evening = new Date(2026, 6, 23, 23, 59, 59);
    expect(daysSinceEpochLocal(morning)).toBe(daysSinceEpochLocal(evening));
  });

  it("dateKeyToDayIndex inverts localDateKey/daysSinceEpochLocal", () => {
    const d = new Date(2026, 6, 23, 15, 30);
    expect(dateKeyToDayIndex(localDateKey(d))).toBe(daysSinceEpochLocal(d));
    expect(() => dateKeyToDayIndex("23.07.2026")).toThrow();
  });

  it("consecutive date keys map to consecutive day indices (DST-safe)", () => {
    // March 2026 contains the EU DST switch (29.03.); indices must still be contiguous.
    let prev = dateKeyToDayIndex("2026-03-01");
    for (let day = 2; day <= 31; day++) {
      const idx = dateKeyToDayIndex(`2026-03-${String(day).padStart(2, "0")}`);
      expect(idx - prev).toBe(1);
      prev = idx;
    }
  });
});
