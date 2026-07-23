import { describe, expect, it } from "vitest";
import { applyToContent } from "../src/core/insert-logic";
import { MARKER, renderCallout } from "../src/core/renderer";

/** Simulates the DailyNoteWatcher retry schedule: each timed attempt runs the
 * same idempotent transform, while Templater may overwrite the file content
 * between attempts. The invariant: whatever the timing, the note ends with
 * exactly one verse callout. */

const callout = renderCallout({
  reference: "Johannes 3,16",
  text: "Also hat Gott die Welt geliebt.",
  translationShortName: "Luther 1912",
  calloutType: "bible",
  emoji: "📖",
  headerText: "",
});

function countMarkers(content: string): number {
  return content.split(MARKER).length - 1;
}

describe("daily-note insertion with Templater interference", () => {
  it("template with {{bible-verse}} placeholder lands after first insert", () => {
    let content = ""; // note is created empty
    const attempt = () => {
      content = applyToContent(content, callout, "after-frontmatter").content;
    };

    attempt(); // t=0ms — inserts into the empty note
    expect(countMarkers(content)).toBe(1);

    // Templater overwrites the whole file with the rendered template.
    content = "---\ntags: [daily]\n---\n# Montag\n\n{{bible-verse}}\n\n## Tasks\n";
    attempt(); // t=400ms — fills the placeholder
    attempt(); // t=1500ms — no-op
    attempt(); // t=3500ms — no-op

    expect(countMarkers(content)).toBe(1);
    expect(content).not.toContain("{{bible-verse}}");
    expect(content.indexOf("> [!bible]")).toBeGreaterThan(content.indexOf("# Montag"));
  });

  it("template without placeholder still ends with exactly one callout", () => {
    let content = "";
    const attempt = () => {
      content = applyToContent(content, callout, "after-frontmatter").content;
    };

    attempt();
    content = "---\ntags: [daily]\n---\n# Notes\n"; // Templater overwrites, no placeholder
    attempt();
    attempt();

    expect(countMarkers(content)).toBe(1);
    expect(content.startsWith("---\ntags: [daily]\n---\n> [!bible]")).toBe(true);
  });

  it("no Templater at all: subsequent attempts are no-ops", () => {
    let content = "";
    const results = [0, 1, 2, 3].map(() => {
      const r = applyToContent(content, callout, "after-frontmatter");
      content = r.content;
      return r.action;
    });
    expect(results).toEqual(["inserted", "already-present", "already-present", "already-present"]);
    expect(countMarkers(content)).toBe(1);
  });
});
