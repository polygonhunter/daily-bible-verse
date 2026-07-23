/** Cleans verse text coming from external sources (getBible/bolls dumps or the
 * runtime whole-Bible download). Some translations embed HTML: Strong's tags
 * (<S>1234</S>), footnote sups, <br> line breaks, entities. Shared between the
 * build-time fetch script and the runtime downloaded-translation provider. */
export function sanitizeVerseText(raw: string): string {
  let s = raw;
  // Strong's numbers and footnote markers: drop tag AND content.
  s = s.replace(/<S>[^<]*<\/S>/gi, "");
  s = s.replace(/<sup>[^<]*<\/sup>/gi, "");
  // <br> variants become newlines (renderer prefixes each line with "> ").
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // Any remaining tags: keep inner text, drop markup.
  s = s.replace(/<[^>]+>/g, "");
  // Minimal entity set seen in Bible dumps.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  // Collapse whitespace but preserve intentional newlines.
  s = s
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && i < arr.length - 1))
    .join("\n");
  return s.trim();
}
