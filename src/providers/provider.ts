import type { RefKey } from "../core/types";

export interface VerseTextProvider {
  readonly translationId: string;
  /** Text for a ref-key range, or null when unavailable. */
  getText(key: RefKey): Promise<string | null>;
}
