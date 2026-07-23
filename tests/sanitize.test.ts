import { describe, expect, it } from "vitest";
import { sanitizeVerseText } from "../src/core/sanitize";

describe("sanitizeVerseText", () => {
  it("strips Strong's tags including content", () => {
    expect(sanitizeVerseText("In the beginning<S>7225</S> God<S>430</S> created")).toBe(
      "In the beginning God created",
    );
  });

  it("converts <br> to newlines", () => {
    expect(sanitizeVerseText("Line one.<br>Line two.<br/>Line three.")).toBe(
      "Line one.\nLine two.\nLine three.",
    );
  });

  it("strips other tags but keeps their text", () => {
    expect(sanitizeVerseText('<i>Selah</i> and <span class="x">more</span>')).toBe(
      "Selah and more",
    );
  });

  it("drops footnote sups entirely", () => {
    expect(sanitizeVerseText("word<sup>1</sup> next")).toBe("word next");
  });

  it("decodes common entities", () => {
    expect(sanitizeVerseText("God&#39;s love &amp; grace&nbsp;abounds &quot;always&quot;")).toBe(
      "God's love & grace abounds \"always\"",
    );
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeVerseText("  many   spaces\t here  ")).toBe("many spaces here");
  });

  it("strips curly-brace editorial annotations", () => {
    expect(sanitizeVerseText("{To the chief Musician.} Jehovah is my shepherd")).toBe(
      "Jehovah is my shepherd",
    );
    expect(sanitizeVerseText("{A Psalm of David.}")).toBe("");
  });

  it("leaves clean text untouched", () => {
    const clean = "Also hat Gott die Welt geliebt, daß er seinen eingeborenen Sohn gab.";
    expect(sanitizeVerseText(clean)).toBe(clean);
  });
});
