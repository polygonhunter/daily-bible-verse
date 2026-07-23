import { Notice, Plugin } from "obsidian";
import { BOOK_NAMES } from "./core/booknames";
import { CURATED } from "./core/curated";
import { dateKeyToDayIndex, daysSinceEpochLocal, localDateKey } from "./core/date";
import { BOOK_PRESETS, buildCuratedPool, buildWholeBiblePool } from "./core/pool";
import { formatReference, parseRefKey } from "./core/reference";
import { renderCallout } from "./core/renderer";
import { rerollRefForDay, selectRefForDay, type DayOverride } from "./core/select";
import {
  DEFAULT_TRANSLATION,
  translationById,
  TRANSLATIONS,
  type TranslationMeta,
} from "./core/translations";
import type { LanguageCode, RefKey, VerseRange } from "./core/types";
import { registerCommands } from "./commands";
import { DailyNoteWatcher } from "./daily-note-watcher";
import { translationFilePath } from "./downloader";
import { BundledProvider } from "./providers/bundled-provider";
import { DownloadedProvider } from "./providers/downloaded-provider";
import type { VerseTextProvider } from "./providers/provider";
import { DailyBibleVerseSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS, type DailyBibleVerseSettings } from "./settings";

export interface DownloadedTranslationMeta {
  downloadedAt: string;
  verseCount: number;
  sizeBytes: number;
}

interface PluginData {
  settings: DailyBibleVerseSettings;
  overrides: Record<string, DayOverride>;
  downloadedTranslations: Record<string, DownloadedTranslationMeta>;
}

export interface RenderedVerse {
  markdown: string;
  reference: string;
  refKey: RefKey;
  /** True when whole-Bible mode fell back to the curated pool (no download). */
  usedFallbackPool: boolean;
}

interface PoolInfo {
  keys: RefKey[];
  source: "curated" | "downloaded";
  usedFallback: boolean;
}

const OVERRIDE_RETENTION_DAYS = 60;

export default class DailyBibleVersePlugin extends Plugin {
  settings: DailyBibleVerseSettings = { ...DEFAULT_SETTINGS };
  overrides: Record<string, DayOverride> = {};
  downloadedTranslations: Record<string, DownloadedTranslationMeta> = {};

  private downloadedProviders: Map<string, DownloadedProvider> = new Map();
  private poolCache: { key: string; info: PoolInfo } | null = null;

  async onload(): Promise<void> {
    await this.loadPluginData();
    registerCommands(this);
    new DailyNoteWatcher(this).start();
    this.addSettingTab(new DailyBibleVerseSettingTab(this.app, this));
  }

  // ---- persistence ------------------------------------------------------

  private async loadPluginData(): Promise<void> {
    const raw = (await this.loadData()) as Partial<PluginData> | null;
    const firstRun = !raw?.settings;
    this.settings = { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) };
    this.overrides = raw?.overrides ?? {};
    this.downloadedTranslations = raw?.downloadedTranslations ?? {};

    if (firstRun) this.applyLocaleDefaults();
    if (!this.settings.baseSeed) {
      this.settings.baseSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
    this.pruneOverrides();
    await this.savePluginData();
  }

  /** First run: adopt Obsidian's UI language when we support it. */
  private applyLocaleDefaults(): void {
    try {
      const lang = window.localStorage.getItem("language") ?? "en";
      if ((["de", "en", "es", "fr", "it"] as const).includes(lang as LanguageCode)) {
        this.settings.language = lang as LanguageCode;
        this.settings.translationId = DEFAULT_TRANSLATION[lang as LanguageCode];
      }
    } catch {
      // localStorage unavailable — keep English defaults.
    }
  }

  async savePluginData(): Promise<void> {
    const data: PluginData = {
      settings: this.settings,
      overrides: this.overrides,
      downloadedTranslations: this.downloadedTranslations,
    };
    await this.saveData(data);
  }

  private pruneOverrides(): void {
    const today = daysSinceEpochLocal(new Date());
    for (const key of Object.keys(this.overrides)) {
      try {
        if (today - dateKeyToDayIndex(key) > OVERRIDE_RETENTION_DAYS) delete this.overrides[key];
      } catch {
        delete this.overrides[key];
      }
    }
  }

  // ---- pools & providers ------------------------------------------------

  invalidatePoolCache(): void {
    this.poolCache = null;
  }

  currentTranslation(): TranslationMeta {
    return (
      translationById(this.settings.translationId) ??
      translationById(DEFAULT_TRANSLATION[this.settings.language]) ??
      TRANSLATIONS[0]
    );
  }

  getDownloadedProvider(translationId: string): DownloadedProvider {
    let provider = this.downloadedProviders.get(translationId);
    if (!provider) {
      const dir = this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`;
      provider = new DownloadedProvider(this.app, translationFilePath(dir, translationId), translationId);
      this.downloadedProviders.set(translationId, provider);
    }
    return provider;
  }

  /** After a download or deletion the cached provider/pool must be dropped. */
  resetDownloadedProvider(translationId: string): void {
    this.downloadedProviders.delete(translationId);
    this.invalidatePoolCache();
  }

  manifestDir(): string {
    return this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`;
  }

  async getPoolInfo(): Promise<PoolInfo> {
    const s = this.settings;
    const cacheKey = JSON.stringify([
      s.poolMode,
      s.translationId,
      s.selectedThemes,
      s.bookPreset,
      Object.keys(this.downloadedTranslations),
    ]);
    if (this.poolCache?.key === cacheKey) return this.poolCache.info;

    let info: PoolInfo;
    if (s.poolMode === "curated") {
      info = { keys: this.curatedKeys(), source: "curated", usedFallback: false };
    } else {
      const index = await this.getDownloadedProvider(s.translationId).getIndex().catch(() => null);
      if (!index) {
        info = { keys: this.curatedKeys(), source: "curated", usedFallback: true };
      } else {
        const books = s.poolMode === "books" ? (BOOK_PRESETS[s.bookPreset]?.books ?? []) : [];
        info = { keys: buildWholeBiblePool(index, books), source: "downloaded", usedFallback: false };
      }
    }
    if (info.keys.length === 0) {
      // Empty theme selection result — fall back to the full curated pool.
      info = { keys: buildCuratedPool(CURATED.verses, []), source: "curated", usedFallback: true };
    }
    this.poolCache = { key: cacheKey, info };
    return info;
  }

  private curatedKeys(): RefKey[] {
    return buildCuratedPool(CURATED.verses, this.settings.selectedThemes);
  }

  private providerFor(info: PoolInfo): VerseTextProvider {
    if (info.source === "downloaded") {
      return this.getDownloadedProvider(this.settings.translationId);
    }
    return new BundledProvider(this.currentTranslation().id);
  }

  // ---- verse resolution -------------------------------------------------

  async renderForDate(date: Date): Promise<RenderedVerse> {
    const dateKey = localDateKey(date);
    const dayIndex = daysSinceEpochLocal(date);
    const pool = await this.getPoolInfo();
    const provider = this.providerFor(pool);

    let refKey = selectRefForDay(pool.keys, dayIndex, this.settings.baseSeed, this.overrides[dateKey]);
    let text = await provider.getText(refKey);
    if (text === null) {
      // Defensive: frozen override may point outside the current data, or a
      // verse may be absent from this translation. Walk the deck until a
      // verse resolves.
      for (let offset = 0; offset <= Math.min(pool.keys.length, 50) && text === null; offset++) {
        refKey = selectRefForDay(pool.keys, dayIndex + offset, this.settings.baseSeed);
        text = await provider.getText(refKey);
      }
    }
    if (text === null) throw new Error("Daily Bible Verse: could not resolve a verse text");

    return { ...this.renderVerse(refKey, text), usedFallbackPool: pool.usedFallback };
  }

  private renderVerse(refKey: RefKey, text: string): Omit<RenderedVerse, "usedFallbackPool"> {
    const s = this.settings;
    const range = parseRefKey(refKey);
    const reference = formatReference(range, BOOK_NAMES[s.language]);
    const markdown = renderCallout({
      reference,
      text,
      translationShortName: s.showTranslationName ? this.currentTranslation().shortName : undefined,
      link: this.buildLink(range, reference),
      calloutType: s.calloutType || "bible",
      emoji: s.emoji,
      headerText: s.headerText,
    });
    return { markdown, reference, refKey };
  }

  private buildLink(range: VerseRange, reference: string): string | undefined {
    const template = this.settings.verseLinkTemplate.trim();
    if (!template) return undefined;
    return template
      .replace(/\{bookEn\}/g, encodeURIComponent(BOOK_NAMES.en.books[String(range.book)] ?? ""))
      .replace(/\{bookLocal\}/g, encodeURIComponent(BOOK_NAMES[this.settings.language].books[String(range.book)] ?? ""))
      .replace(/\{chapter\}/g, String(range.chapter))
      .replace(/\{verse\}/g, String(range.verseStart))
      .replace(/\{ref\}/g, encodeURIComponent(reference));
  }

  /** Re-rolls today's verse and freezes the result for the rest of the day. */
  async rerollToday(): Promise<RenderedVerse> {
    const now = new Date();
    const dateKey = localDateKey(now);
    const pool = await this.getPoolInfo();
    const previous = this.overrides[dateKey]?.rerollCount ?? 0;
    this.overrides[dateKey] = rerollRefForDay(
      pool.keys,
      daysSinceEpochLocal(now),
      this.settings.baseSeed,
      previous,
    );
    await this.savePluginData();
    return this.renderForDate(now);
  }

  notifyFallback(rendered: RenderedVerse): void {
    if (rendered.usedFallbackPool && this.settings.poolMode !== "curated") {
      new Notice(
        "Daily Bible Verse: translation not downloaded yet — using the curated verse pool. Download it in the plugin settings.",
      );
    }
  }
}
