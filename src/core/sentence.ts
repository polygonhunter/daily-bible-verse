import type { VerseRange } from "./types";

/** Ends with sentence punctuation, optionally followed by closing quotes or
 * brackets: `.`, `!`, `?`, `…` + `"'”’»«)]`. */
const SENTENCE_END = /[.!?…]["'”’»«)\]]*\s*$/u;

export function endsSentence(text: string): boolean {
  return SENTENCE_END.test(text);
}

/**
 * Extends a verse range forward until its text ends a sentence, so a random
 * whole-Bible verse is not a fragment like "And he said unto them,".
 * Stays within the chapter (stops at the first missing verse) and never spans
 * more than `maxVerses` verses. Pure and deterministic: the same range gives
 * the same result on every device. Returns the input when nothing changes.
 */
export async function extendToSentence(
  range: VerseRange,
  getVerseText: (verse: number) => Promise<string | null> | string | null,
  maxVerses = 4,
): Promise<VerseRange> {
  const last = await getVerseText(range.verseEnd);
  if (last === null || endsSentence(last)) return range;
  let verseEnd = range.verseEnd;
  while (verseEnd - range.verseStart + 1 < maxVerses) {
    const next = await getVerseText(verseEnd + 1);
    if (next === null) break; // end of chapter (or gap)
    verseEnd++;
    if (endsSentence(next)) break;
  }
  return verseEnd === range.verseEnd ? range : { ...range, verseEnd };
}
