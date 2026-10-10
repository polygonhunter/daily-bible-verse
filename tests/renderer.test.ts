import { describe, expect, it } from "vitest";
import { MARKER, normalizeCalloutType, renderCallout } from "../src/core/renderer";

const base = {
  reference: "Johannes 3,16",
  text: "Also hat Gott die Welt geliebt, daß er seinen eingeborenen Sohn gab.",
  calloutType: "bible",
  emoji: "📖",
  headerText: "",
};

describe("renderCallout", () => {
  it("renders the default callout", () => {
    const md = renderCallout({ ...base, translationShortName: "Luther 1912" });
    expect(md).toBe(
      [
        `> [!bible] 📖 Johannes 3,16 ${MARKER}`,
        "> Also hat Gott die Welt geliebt, daß er seinen eingeborenen Sohn gab.",
        ">",
        "> — Luther 1912",
      ].join("\n"),
    );
  });

  it("supports header text, no emoji, no translation footer", () => {
    const md = renderCallout({ ...base, emoji: "", headerText: "Vers des Tages" });
    expect(md.startsWith(`> [!bible] Vers des Tages — Johannes 3,16 ${MARKER}`)).toBe(true);
    expect(md).not.toContain("> —");
  });

  it("links the reference when a link is given", () => {
    const md = renderCallout({ ...base, link: "https://example.org/x" });
    expect(md).toContain("[Johannes 3,16](https://example.org/x)");
  });

  it("prefixes every line of multi-line verse text", () => {
    const md = renderCallout({ ...base, text: "Zeile eins\nZeile zwei\nZeile drei" });
    const lines = md.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.startsWith(">"))).toBe(true);
  });

  it("uses the configured callout type", () => {
    expect(renderCallout({ ...base, calloutType: "quote" }).startsWith("> [!quote]")).toBe(true);
  });
});

describe("normalizeCalloutType", () => {
  it("accepts simple types and trims", () => {
    expect(normalizeCalloutType(" quote ")).toBe("quote");
    expect(normalizeCalloutType("my-Type2")).toBe("my-Type2");
    expect(normalizeCalloutType("")).toBe("");
  });

  it("accepts underscores, umlauts and callout metadata", () => {
    expect(normalizeCalloutType("verse_of_day")).toBe("verse_of_day");
    expect(normalizeCalloutType("bibelvers-ü")).toBe("bibelvers-ü");
    expect(normalizeCalloutType("infobox|left")).toBe("infobox|left");
  });

  it("rejects types that break the callout syntax", () => {
    expect(normalizeCalloutType("bad type")).toBeNull();
    expect(normalizeCalloutType("x]")).toBeNull();
    expect(normalizeCalloutType("[x")).toBeNull();
    expect(normalizeCalloutType("a\nb")).toBeNull();
  });
});
