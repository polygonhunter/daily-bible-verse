import type { GeneratedTextsFile, RefKey } from "../core/types";
import { getBundledTexts } from "./bundled-index";
import type { VerseTextProvider } from "./provider";

export class BundledProvider implements VerseTextProvider {
  private readonly file: GeneratedTextsFile;

  constructor(translationId: string) {
    const file = getBundledTexts(translationId);
    if (!file) throw new Error(`No bundled texts for translation "${translationId}"`);
    this.file = file;
  }

  get translationId(): string {
    return this.file.translationId;
  }

  async getText(key: RefKey): Promise<string | null> {
    return this.file.texts[key] ?? null;
  }
}
