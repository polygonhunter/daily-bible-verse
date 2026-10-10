import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeStoredSettings } from "../src/settings";

describe("mergeStoredSettings", () => {
  it("keeps 'complete sentences' off for settings saved by 1.0.x", () => {
    const merged = mergeStoredSettings({ poolMode: "whole-bible", baseSeed: "abc" });
    expect(merged.completeSentences).toBe(false);
    expect(merged.poolMode).toBe("whole-bible");
    expect(merged.insertPosition).toBe(DEFAULT_SETTINGS.insertPosition);
  });

  it("respects a stored value", () => {
    expect(mergeStoredSettings({ completeSentences: true }).completeSentences).toBe(true);
    expect(mergeStoredSettings({ completeSentences: false }).completeSentences).toBe(false);
  });

  it("new installs keep the default", () => {
    expect(DEFAULT_SETTINGS.completeSentences).toBe(true);
  });
});
