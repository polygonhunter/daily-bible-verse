import type { RefKey } from "../core/types";

export interface VerseTextProvider {
  readonly translationId: string;
  /** Text for a ref-key range, or null when unavailable. */
  getText(key: RefKey): Promise<string | null>;
  /** The range `key`'s text carries in this translation's own numbering —
   * what the reference and the link must name. Usually `key` itself. */
  sourceRef(key: RefKey): RefKey;
}
