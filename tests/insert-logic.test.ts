import { describe, expect, it } from "vitest";
import { applyToContent, hasPlaceholder, replaceMarkerCallout } from "../src/core/insert-logic";
import { MARKER, renderCallout } from "../src/core/renderer";

const callout = renderCallout({
  reference: "John 3:16",
  text: "For God so loved the world.",
  translationShortName: "WEB",
  calloutType: "bible",
  emoji: "📖",
  headerText: "",
});

const fm = "---\ntitle: Test\ntags: [daily]\n---\n";

describe("applyToContent", () => {
  it("is a no-op when the marker is already present", () => {
    const inserted = applyToContent("Some note", callout, "top");
    const again = applyToContent(inserted.content, callout, "top");
    expect(again.changed).toBe(false);
    expect(again.action).toBe("already-present");
    expect(again.content).toBe(inserted.content);
  });

  it("replaces placeholders (all occurrences, flexible spacing)", () => {
    const content = `${fm}# Heading\n{{bible-verse}}\n\ntext\n{{ bible-verse }}\n`;
    const result = applyToContent(content, callout, "top");
    expect(result.action).toBe("placeholder");
    expect(result.content).not.toContain("{{");
    expect(result.content.split(MARKER)).toHaveLength(3);
  });

  it("placeholder wins over position", () => {
    const content = `body\n{{bible-verse}}\n`;
    const result = applyToContent(content, callout, "bottom");
    expect(result.action).toBe("placeholder");
    expect(result.content.startsWith("body")).toBe(true);
  });

  it("inserts after frontmatter", () => {
    const result = applyToContent(`${fm}\n# Today\n`, callout, "after-frontmatter");
    expect(result.action).toBe("inserted");
    expect(result.content).toBe(`${fm}${callout}\n\n# Today\n`);
  });

  it("inserts at top when there is no frontmatter", () => {
    const result = applyToContent("# Today\n", callout, "after-frontmatter");
    expect(result.content).toBe(`${callout}\n\n# Today\n`);
  });

  it("does not treat a mid-document --- as frontmatter", () => {
    const content = "intro\n---\nnot frontmatter\n";
    const result = applyToContent(content, callout, "after-frontmatter");
    expect(result.content.startsWith(`> [!bible]`)).toBe(true);
  });

  it("inserts at bottom with separating blank line", () => {
    const result = applyToContent(`${fm}# Today\nsome text\n`, callout, "bottom");
    expect(result.content).toBe(`${fm}# Today\nsome text\n\n${callout}\n`);
  });

  it("handles empty content", () => {
    expect(applyToContent("", callout, "after-frontmatter").content).toBe(`${callout}\n`);
    expect(applyToContent("", callout, "bottom").content).toBe(`${callout}\n`);
  });

  it("is idempotent for every position", () => {
    for (const pos of ["after-frontmatter", "top", "bottom"] as const) {
      const once = applyToContent(`${fm}body\n`, callout, pos);
      const twice = applyToContent(once.content, callout, pos);
      expect(twice.content).toBe(once.content);
    }
  });
});

describe("CRLF (Windows line endings)", () => {
  const crlfFm = "---\r\ntitle: Test\r\ntags: [daily]\r\n---\r\n";

  it("detects CRLF frontmatter and inserts below it", () => {
    const result = applyToContent(`${crlfFm}\r\n# Today\r\n`, callout, "after-frontmatter");
    expect(result.action).toBe("inserted");
    // The callout must come AFTER the closing ---, never above the YAML block.
    expect(result.content.startsWith(crlfFm)).toBe(true);
    expect(result.content.indexOf("> [!bible]")).toBeGreaterThan(result.content.indexOf("---\r\n---".slice(0, 3)));
    expect(result.content.indexOf("> [!bible]")).toBeGreaterThan(crlfFm.length - 1);
  });

  it("replaces placeholders in CRLF content", () => {
    const result = applyToContent(`${crlfFm}# Head\r\n{{bible-verse}}\r\n`, callout, "top");
    expect(result.action).toBe("placeholder");
    expect(result.content).not.toContain("{{");
  });

  it("is idempotent and bottom-insert works with CRLF", () => {
    const once = applyToContent(`${crlfFm}body\r\n`, callout, "bottom");
    const twice = applyToContent(once.content, callout, "bottom");
    expect(twice.content).toBe(once.content);
    expect(once.content).toContain("body");
  });

  it("replaceMarkerCallout keeps CRLF surroundings intact", () => {
    const content = `${crlfFm}${callout}\n\r\n# Notes\r\n`;
    const replaced = replaceMarkerCallout(content, callout.replace("John 3:16", "Psalm 23:1"));
    expect(replaced).toContain("Psalm 23:1");
    expect(replaced).toContain("# Notes");
  });
});

describe("edge cases", () => {
  it("frontmatter-only note without trailing newline gets its own line", () => {
    const result = applyToContent("---\ntitle: x\n---", callout, "after-frontmatter");
    expect(result.content).toBe(`---\ntitle: x\n---\n${callout}\n`);
  });

  it("hasPlaceholder is stateless across repeated calls (lastIndex regression)", () => {
    const content = "note\n{{bible-verse}}\n";
    // The old shared /g regex made a second .test() miss the match, so the
    // command inserted at the default position AND left the placeholder.
    expect(hasPlaceholder(content)).toBe(true);
    expect(hasPlaceholder(content)).toBe(true);
    const result = applyToContent(content, callout, "top");
    expect(result.action).toBe("placeholder");
    expect(result.content).not.toContain("{{bible-verse}}");
  });

  it("keeps $-sequences in the callout literal during placeholder replacement", () => {
    const dollarCallout = "> [!bible] Test $& $1 $` <!--daily-bible-verse-->\n> text";
    const result = applyToContent("a\n{{bible-verse}}\nb\n", dollarCallout, "top");
    expect(result.content).toContain("$& $1 $`");
  });
});

describe("replaceMarkerCallout", () => {
  it("replaces the whole callout block and nothing else", () => {
    const content = `${fm}${callout}\n\n# Notes\n> a normal quote\n`;
    const next = callout.replace("John 3:16", "Psalm 23:1");
    const replaced = replaceMarkerCallout(content, next);
    expect(replaced).toContain("Psalm 23:1");
    expect(replaced).not.toContain("John 3:16");
    expect(replaced).toContain("> a normal quote");
  });

  it("returns null when no marker exists", () => {
    expect(replaceMarkerCallout("# Nothing here\n", callout)).toBeNull();
  });
});
