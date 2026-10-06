import { describe, expect, it } from "vitest";
import { bundledTranslationIds, getBundledTexts } from "../src/providers/bundled-index";
import { BundledProvider } from "../src/providers/bundled-provider";
import { TRANSLATIONS } from "../src/core/translations";

describe("bundled texts (lazy)", () => {
  it("covers every translation and caches the parsed file", () => {
    expect(bundledTranslationIds().sort()).toEqual(TRANSLATIONS.map((t) => t.id).sort());
    const kjv = getBundledTexts("kjv");
    expect(kjv?.translationId).toBe("kjv");
    expect(getBundledTexts("kjv")).toBe(kjv);
    expect(getBundledTexts("nope")).toBeUndefined();
    expect(getBundledTexts("constructor")).toBeUndefined();
  });

  it("BundledProvider resolves John 3:16", async () => {
    expect(await new BundledProvider("kjv").getText("43:3:16-16")).toMatch(/God so loved the world/);
  });
});
