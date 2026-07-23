import { MARKER } from "./renderer";

const PLACEHOLDER_SOURCE = String.raw`\{\{\s*bible-verse\s*\}\}`;

/** Stateless placeholder check — deliberately creates a fresh regex per call.
 * A shared /g regex would carry `lastIndex` between calls and silently skip
 * matches (a real bug this replaced). */
export function hasPlaceholder(content: string): boolean {
  return new RegExp(PLACEHOLDER_SOURCE).test(content);
}

function replacePlaceholders(content: string, callout: string): string {
  // Function replacer: `$`-sequences in the callout stay literal.
  return content.replace(new RegExp(PLACEHOLDER_SOURCE, "g"), () => callout);
}

export type InsertPosition = "after-frontmatter" | "top" | "bottom";

export type InsertAction = "placeholder" | "inserted" | "already-present";

export interface InsertResult {
  content: string;
  changed: boolean;
  action: InsertAction;
}

/** Pure content transform shared by all insertion triggers. Idempotent:
 * applying it twice never yields two callouts. Handles LF and CRLF files. */
export function applyToContent(
  content: string,
  callout: string,
  position: InsertPosition,
): InsertResult {
  if (content.includes(MARKER)) {
    return { content, changed: false, action: "already-present" };
  }
  if (hasPlaceholder(content)) {
    return { content: replacePlaceholders(content, callout), changed: true, action: "placeholder" };
  }
  return { content: insertAt(content, callout, position), changed: true, action: "inserted" };
}

function insertAt(content: string, callout: string, position: InsertPosition): string {
  if (position === "bottom") {
    if (content.length === 0) return `${callout}\n`;
    return `${content.replace(/(?:\r?\n)*$/, "")}\n\n${callout}\n`;
  }
  const frontmatterEnd = position === "after-frontmatter" ? frontmatterEndIndex(content) : 0;
  const before = content.slice(0, frontmatterEnd);
  const beforeSeparator = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const after = content.slice(frontmatterEnd).replace(/^(?:\r?\n)*/, "");
  const afterSeparator = after.length > 0 ? "\n" : "";
  return `${before}${beforeSeparator}${callout}\n${afterSeparator}${after}`;
}

/** Index just past the closing `---` line of a leading YAML frontmatter block
 * (including its trailing newline), or 0 when there is none. CRLF-safe: a
 * Windows note starting with `---\r\n` is real frontmatter too — missing it
 * would insert the callout above the YAML block and break its parsing. */
function frontmatterEndIndex(content: string): number {
  const open = /^---\r?\n/.exec(content);
  if (!open) return 0;
  const rest = content.slice(open[0].length);
  const close = /(?:^|\r?\n)(---|\.\.\.)(\r?\n|$)/.exec(rest);
  if (!close) return 0;
  return open[0].length + close.index + close[0].length;
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
