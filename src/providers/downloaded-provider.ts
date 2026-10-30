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
    if (await this.app.vault.adapter.exists(this.filePath)) return true;
    return this.recoverInterruptedWrite();
  }

  /** A download killed between removing the old file and renaming the new
   * one leaves only `<file>.tmp`. The rename only starts once that write has
   * finished, so a temp file that parses as this translation is complete:
   * finish the rename instead of reporting "not downloaded". */
  private async recoverInterruptedWrite(): Promise<boolean> {
    const adapter = this.app.vault.adapter;
    const tmp = `${this.filePath}.tmp`;
    try {
      if (!(await adapter.exists(tmp))) return false;
      const stored = JSON.parse(await adapter.read(tmp)) as StoredTranslation;
      if (stored.schemaVersion !== 1 || stored.translationId !== this.translationId) return false;
      await adapter.rename(tmp, this.filePath);
      return true;
    } catch {
      // Truncated temp file (killed during the write itself) — not usable.
      return false;
    }
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

  /** Whole-Bible keys already use this translation's own numbering. */
  sourceRef(key: RefKey): RefKey {
    return key;
  }
}
