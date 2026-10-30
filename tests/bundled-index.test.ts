import { describe, expect, it } from "vitest";
import { bundledTranslationIds, getBundledTexts } from "../src/providers/bundled-index";
import { BundledProvider } from "../src/providers/bundled-provider";
import { TRANSLATIONS } from "../src/core/translations";
import { BOOK_NAMES } from "../src/core/booknames";
import { formatReference, parseRefKey } from "../src/core/reference";

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

  it("names the verses in the translation's own numbering", async () => {
    // Luther counts the superscription of Psalm 46 as verse 1: the curated
    // (KJV) key 46:1-2 holds Luther's verses 2-3.
    const luther = new BundledProvider("luther1912");
    expect(await luther.getText("19:46:1-2")).toMatch(/^Gott ist unsre Zuversicht/);
    expect(luther.sourceRef("19:46:1-2")).toBe("19:46:2-3");
    expect(formatReference(parseRefKey(luther.sourceRef("19:46:1-2")), BOOK_NAMES.de)).toBe("Psalm 46,2-3");
    // Unshifted keys and translations stay as they are.
    expect(luther.sourceRef("43:3:16-16")).toBe("43:3:16-16");
    expect(new BundledProvider("kjv").sourceRef("19:46:1-2")).toBe("19:46:1-2");
    expect(luther.sourceRef("constructor")).toBe("constructor");
  });
});
