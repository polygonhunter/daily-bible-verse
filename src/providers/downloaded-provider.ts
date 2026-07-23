import type { App } from "obsidian";
import { parseRefKey } from "../core/reference";
import type { RefKey, TranslationIndex } from "../core/types";
import type { VerseTextProvider } from "./provider";

/** On-disk format of a downloaded whole-Bible translation
 * (<pluginDir>/translations/<id>.json). */
export interface StoredTranslation {
  schemaVersion: 1;
  translationId: string;
  /** "book:chapter:verse" -> sanitized text. */
  verses: Record<string, string>;
  /** book -> chapter -> verse count. */
  index: Record<string, Record<string, number>>;
}

export class DownloadedProvider implements VerseTextProvider {
  private verses: Map<string, string> | null = null;
  private index: TranslationIndex | null = null;

  constructor(
    private readonly app: App,
    private readonly filePath: string,
    readonly translationId: string,
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.app.vault.adapter.exists(this.filePath);
  }

  /** Parses the stored file once (~4-5 MB) and caches the maps in memory. */
  private async ensureLoaded(): Promise<boolean> {
    if (this.verses) return true;
    if (!(await this.isAvailable())) return false;
    const raw = await this.app.vault.adapter.read(this.filePath);
    const stored = JSON.parse(raw) as StoredTranslation;
    if (stored.schemaVersion !== 1 || stored.translationId !== this.translationId) {
      throw new Error(`Corrupt translation file: ${this.filePath}`);
    }
    this.verses = new Map(Object.entries(stored.verses));
    const index: TranslationIndex = new Map();
    for (const [book, chapters] of Object.entries(stored.index)) {
      index.set(Number(book), new Map(Object.entries(chapters).map(([c, n]) => [Number(c), n])));
    }
    this.index = index;
    return true;
  }

  async getIndex(): Promise<TranslationIndex | null> {
    return (await this.ensureLoaded()) ? this.index : null;
  }

  async getText(key: RefKey): Promise<string | null> {
    if (!(await this.ensureLoaded())) return null;
    const r = parseRefKey(key);
    const parts: string[] = [];
    for (let v = r.verseStart; v <= r.verseEnd; v++) {
      const text = this.verses?.get(`${r.book}:${r.chapter}:${v}`);
      if (!text) return null;
      parts.push(text);
    }
    return parts.join(" ");
  }
}
