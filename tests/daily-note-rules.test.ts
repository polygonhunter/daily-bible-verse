import { describe, expect, it } from "vitest";
import { isInDailyNotesFolder, isWithinDayWindow, normalizeFolder } from "../src/core/daily-note-rules";

describe("normalizeFolder", () => {
  it("maps root variants to the empty string", () => {
    expect(normalizeFolder("")).toBe("");
    expect(normalizeFolder("/")).toBe("");
    expect(normalizeFolder(undefined)).toBe("");
    expect(normalizeFolder("  Journal/Daily/ ")).toBe("Journal/Daily");
    expect(normalizeFolder("/Journal//Daily")).toBe("Journal/Daily");
  });
});

describe("isInDailyNotesFolder", () => {
  it("accepts notes inside the configured folder, including sub-folders", () => {
    expect(isInDailyNotesFolder("Daily/2026-10-06.md", "Daily", "YYYY-MM-DD")).toBe(true);
    expect(isInDailyNotesFolder("Daily/2026/10/2026-10-06.md", "Daily/", "YYYY/MM/YYYY-MM-DD")).toBe(true);
  });

  it("rejects date-named notes outside the folder", () => {
    expect(isInDailyNotesFolder("Meetings/2026-10-06.md", "Daily", "YYYY-MM-DD")).toBe(false);
    expect(isInDailyNotesFolder("DailyArchive/2026-10-06.md", "Daily", "YYYY-MM-DD")).toBe(false);
  });

  it("vault root: only as deep as the format nests", () => {
    expect(isInDailyNotesFolder("2026-10-06.md", "", "YYYY-MM-DD")).toBe(true);
    expect(isInDailyNotesFolder("Meetings/2026-10-06.md", "", "YYYY-MM-DD")).toBe(false);
    expect(isInDailyNotesFolder("2026/10/2026-10-06.md", "/", "YYYY/MM/YYYY-MM-DD")).toBe(true);
  });
});

describe("isWithinDayWindow", () => {
  it("allows ±7 days around today", () => {
    expect(isWithinDayWindow(100, 100, 7)).toBe(true);
    expect(isWithinDayWindow(93, 100, 7)).toBe(true);
    expect(isWithinDayWindow(107, 100, 7)).toBe(true);
    expect(isWithinDayWindow(92, 100, 7)).toBe(false);
    expect(isWithinDayWindow(10, 100, 7)).toBe(false);
  });
});
