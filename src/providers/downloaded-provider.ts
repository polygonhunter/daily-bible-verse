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

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

export class DownloadedProvider implements VerseTextProvider {
  /** Kept as the parsed plain object — converting ~31k entries into a Map
   * doubled the peak memory and cost time for no benefit. */
  private verses: Record<string, string> | null = null;
  private index: TranslationIndex | null = null;
  /** In-flight load, shared by parallel callers (no double read + parse). */
  private loading: Promise<boolean> | null = null;

  constructor(
    private readonly app: App,
    private readonly filePath: string,
    readonly translationId: string,
  ) {}

  /** Provider pre-filled from data already in memory (right after a download). */
  static fromStored(app: App, filePath: string, stored: StoredTranslation): DownloadedProvider {
    const provider = new DownloadedProvider(app, filePath, stored.translationId);
    provider.adopt(stored);
    return provider;
  }

  async isAvailable(): Promise<boolean> {
    return this.app.vault.adapter.exists(this.filePath);
  }

  /** True while the verse texts are held in memory. */
  get isLoaded(): boolean {
    return this.verses !== null;
  }

  /** Frees the in-memory texts (~5-10 MB). The next lookup reloads lazily. */
  release(): void {
    if (this.loading && !this.verses) return; // a load is in flight — let it finish
    this.verses = null;
    this.index = null;
    this.loading = null;
  }

  private adopt(stored: StoredTranslation): void {
    if (stored.schemaVersion !== 1 || stored.translationId !== this.translationId) {
      throw new Error(`Corrupt translation file: ${this.filePath}`);
    }
    const index: TranslationIndex = new Map();
    for (const [book, chapters] of Object.entries(stored.index)) {
      index.set(Number(book), new Map(Object.entries(chapters).map(([c, n]) => [Number(c), n])));
    }
    this.verses = stored.verses;
    this.index = index;
  }

  private async load(): Promise<boolean> {
    if (!(await this.isAvailable())) return false;
    const raw = await this.app.vault.adapter.read(this.filePath);
    this.adopt(JSON.parse(raw) as StoredTranslation);
    return true;
  }

  /** Parses the stored file once (~4-5 MB) and caches it in memory. */
  private ensureLoaded(): Promise<boolean> {
    if (this.verses) return Promise.resolve(true);
    if (!this.loading) {
      const loading = this.load().then(
        (ok) => {
          if (!ok && this.loading === loading) this.loading = null; // allow a later retry
          return ok;
        },
        (e: unknown) => {
          if (this.loading === loading) this.loading = null;
          throw e;
        },
      );
      this.loading = loading;
    }
    return this.loading;
  }

  async getIndex(): Promise<TranslationIndex | null> {
    return (await this.ensureLoaded()) ? this.index : null;
  }

  async getText(key: RefKey): Promise<string | null> {
    if (!(await this.ensureLoaded())) return null;
    const verses = this.verses;
    if (!verses) return null;
    const r = parseRefKey(key);
    const parts: string[] = [];
    for (let v = r.verseStart; v <= r.verseEnd; v++) {
      const id = `${r.book}:${r.chapter}:${v}`;
      if (!hasOwn(verses, id) || !verses[id]) return null;
      parts.push(verses[id]);
    }
    return parts.join(" ");
  }
}
