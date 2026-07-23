import { MARKER } from "./renderer";

export const PLACEHOLDER_RE = /\{\{\s*bible-verse\s*\}\}/g;

export type InsertPosition = "after-frontmatter" | "top" | "bottom";

export type InsertAction = "placeholder" | "inserted" | "already-present";

export interface InsertResult {
  content: string;
  changed: boolean;
  action: InsertAction;
}

/** Pure content transform shared by all insertion triggers. Idempotent:
 * applying it twice never yields two callouts. */
export function applyToContent(
  content: string,
  callout: string,
  position: InsertPosition,
): InsertResult {
  if (content.includes(MARKER)) {
    return { content, changed: false, action: "already-present" };
  }
  if (PLACEHOLDER_RE.test(content)) {
    PLACEHOLDER_RE.lastIndex = 0;
    return {
      content: content.replace(PLACEHOLDER_RE, callout),
      changed: true,
      action: "placeholder",
    };
  }
  return { content: insertAt(content, callout, position), changed: true, action: "inserted" };
}

function insertAt(content: string, callout: string, position: InsertPosition): string {
  if (position === "bottom") {
    if (content.length === 0) return `${callout}\n`;
    return `${content.replace(/\n*$/, "")}\n\n${callout}\n`;
  }
  const frontmatterEnd = position === "after-frontmatter" ? frontmatterEndIndex(content) : 0;
  const before = content.slice(0, frontmatterEnd);
  const after = content.slice(frontmatterEnd).replace(/^\n*/, "");
  const separator = after.length > 0 ? "\n" : "";
  return `${before}${callout}\n${separator}${after}`;
}

/** Index just past the closing `---` line of a leading YAML frontmatter block
 * (including its trailing newline), or 0 when there is none. */
function frontmatterEndIndex(content: string): number {
  if (!content.startsWith("---\n") && content !== "---") return 0;
  const close = /\n(---|\.\.\.)(\n|$)/.exec(content.slice(3));
  if (!close) return 0;
  return 3 + close.index + 1 + close[1].length + (close[2] ? 1 : 0);
}

/** Replaces an existing marker callout (found via MARKER) with a new one.
 * Returns null when no marker callout exists. Used by the re-roll command. */
export function replaceMarkerCallout(content: string, newCallout: string): string | null {
  const lines = content.split("\n");
  const start = lines.findIndex((l) => l.includes(MARKER) && l.trimStart().startsWith(">"));
  if (start === -1) return null;
  let end = start;
  while (end + 1 < lines.length && lines[end + 1].trimStart().startsWith(">")) end++;
  const replaced = [...lines.slice(0, start), newCallout, ...lines.slice(end + 1)];
  return replaced.join("\n");
}
