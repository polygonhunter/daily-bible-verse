/** Invisible idempotency marker placed on the callout title line. All automatic
 * insertion paths check for it; the re-roll command uses it to find and replace
 * the existing callout. Independent of the user-configurable callout type. */
export const MARKER = "<!--daily-bible-verse-->";

export interface RenderInput {
  /** Localized reference, e.g. "Johannes 3,16". */
  reference: string;
  /** Sanitized verse text; may contain newlines. */
  text: string;
  /** e.g. "Luther 1912"; omitted when showTranslationName is off. */
  translationShortName?: string;
  /** Optional URL; when set, the reference becomes a link. */
  link?: string;
  calloutType: string;
  /** Emoji prefix for the title; empty string disables it. */
  emoji: string;
  /** Optional heading, e.g. "Vers des Tages" -> "Vers des Tages — Johannes 3,16". */
  headerText: string;
}

/** Emits the static markdown callout that gets written into notes. */
export function renderCallout(input: RenderInput): string {
  const refPart = input.link ? `[${input.reference}](${input.link})` : input.reference;
  const titleParts: string[] = [];
  if (input.emoji) titleParts.push(input.emoji);
  if (input.headerText) titleParts.push(`${input.headerText} —`);
  titleParts.push(refPart);

  const lines: string[] = [];
  lines.push(`> [!${input.calloutType}] ${titleParts.join(" ")} ${MARKER}`);
  for (const textLine of input.text.split("\n")) {
    lines.push(`> ${textLine}`);
  }
  if (input.translationShortName) {
    lines.push(">");
    lines.push(`> — ${input.translationShortName}`);
  }
  return lines.join("\n");
}
