import { getLanguage, moment as obsidianMoment, Notice, Plugin, type TFile } from "obsidian";
import { getAllDailyNotes, getDailyNote, getDateFromFile } from "obsidian-daily-notes-interface";
import { BOOK_NAMES } from "./core/booknames";
import { CURATED } from "./core/curated";
import { dateKeyToDayIndex, daysSinceEpochLocal, localDateKey } from "./core/date";
import { BOOK_PRESETS, buildCuratedPool, buildWholeBiblePool, poolSizeFromCounts } from "./core/pool";
import { newSeed } from "./core/hash";
import { formatReference, parseRefKey } from "./core/reference";
import { normalizeCalloutType, renderCallout } from "./core/renderer";
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
import { downloadTranslation, translationFilePath, type DownloadPhase } from "./downloader";
import { BundledProvider } from "./providers/bundled-provider";
import { DownloadedProvider } from "./providers/downloaded-provider";
import type { VerseTextProvider } from "./providers/provider";
import { DailyBibleVerseSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS, type DailyBibleVerseSettings } from "./settings";

export interface DownloadedTranslationMeta {
  downloadedAt: string;
  verseCount: number;
  sizeBytes: number;
  /** book -> pool entries; lets the settings count the pool without loading
   * the file. Missing for downloads made before this field existed. */
  bookVerseCounts?: Record<string, number>;
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
/** Downloaded texts (~5-10 MB in memory) are freed after this idle time. */
const PROVIDER_IDLE_RELEASE_MS = 120_000;

// Obsidian's moment export is typed as a namespace; cast once to call it.
const moment = obsidianMoment as unknown as typeof import("moment");

export default class DailyBibleVersePlugin extends Plugin {
  settings: DailyBibleVerseSettings = { ...DEFAULT_SETTINGS };
  overrides: Record<string, DayOverride> = {};
  downloadedTranslations: Record<string, DownloadedTranslationMeta> = {};

  private downloadedProviders: Map<string, DownloadedProvider> = new Map();
  private bundledProviders: Map<string, BundledProvider> = new Map();
  private poolCache: { key: string; info: PoolInfo } | null = null;
  private poolPromise: { key: string; promise: Promise<PoolInfo> } | null = null;
  private idleReleaseTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadPluginData();
    registerCommands(this);
    new DailyNoteWatcher(this).start();
    this.addSettingTab(new DailyBibleVerseSettingTab(this.app, this));
  }

  onunload(): void {
    if (this.idleReleaseTimer !== null) window.clearTimeout(this.idleReleaseTimer);
    this.idleReleaseTimer = null;
  }

  // ---- persistence ------------------------------------------------------

  private async loadPluginData(): Promise<void> {
    const raw = (await this.loadData()) as Partial<PluginData> | null;
    const firstRun = !raw?.settings;
    this.settings = { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) };
    this.overrides = raw?.overrides ?? {};
    this.downloadedTranslations = raw?.downloadedTranslations ?? {};

    if (firstRun) this.applyLocaleDefaults();
    let seeded = false;
    if (!this.settings.baseSeed) {
      this.settings.baseSeed = newSeed();
      seeded = true;
    }
    const pruned = this.pruneOverrides();
    // Only write when something actually changed: an unconditional save on
    // every start touches data.json on every device and provokes sync
    // conflicts.
    if (firstRun || seeded || pruned) await this.savePluginData();
  }

  /** data.json was changed on disk by sync: reload without writing back. */
  async onExternalSettingsChange(): Promise<void> {
    const raw = (await this.loadData()) as Partial<PluginData> | null;
    if (!raw?.settings) return;
    this.settings = { ...DEFAULT_SETTINGS, ...raw.settings };
    this.overrides = raw.overrides ?? {};
    this.downloadedTranslations = raw.downloadedTranslations ?? {};
    this.invalidatePoolCache();
    this.evictUnusedDownloadedProviders();
  }

  /** First run: adopt Obsidian's UI language when we support it. */
  private applyLocaleDefaults(): void {
    const lang = getLanguage();
    if (Object.prototype.hasOwnProperty.call(DEFAULT_TRANSLATION, lang)) {
      this.settings.language = lang as LanguageCode;
      this.settings.translationId = DEFAULT_TRANSLATION[lang as LanguageCode];
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

  /** Drops overrides older than the retention window. True if any were dropped. */
  private pruneOverrides(): boolean {
    const today = daysSinceEpochLocal(new Date());
    let pruned = false;
    for (const key of Object.keys(this.overrides)) {
      let expired: boolean;
      try {
        expired = today - dateKeyToDayIndex(key) > OVERRIDE_RETENTION_DAYS;
      } catch {
        expired = true;
      }
      if (expired) {
        delete this.overrides[key];
        pruned = true;
      }
    }
    return pruned;
  }

  // ---- pools & providers ------------------------------------------------

  invalidatePoolCache(): void {
    this.poolCache = null;
    this.poolPromise = null;
  }

  /** (Re)starts the idle timer that frees the downloaded verse texts. The
   * pool keys stay cached, so a later render only reloads the text file. */
  private scheduleIdleRelease(): void {
    if (this.idleReleaseTimer !== null) window.clearTimeout(this.idleReleaseTimer);
    this.idleReleaseTimer = window.setTimeout(() => {
      this.idleReleaseTimer = null;
      for (const provider of this.downloadedProviders.values()) provider.release();
    }, PROVIDER_IDLE_RELEASE_MS);
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
      provider = new DownloadedProvider(this.app, translationFilePath(this.manifestDir(), translationId), translationId);
      this.downloadedProviders.set(translationId, provider);
    }
    return provider;
  }

  /** Downloads a translation, registers it and keeps the parsed data in
   * memory — no second read + parse of the freshly written file. */
  async downloadAndRegister(
    meta: TranslationMeta,
    onPhase?: (phase: DownloadPhase) => void,
  ): Promise<DownloadedTranslationMeta> {
    const result = await downloadTranslation(this.app, this.manifestDir(), meta, onPhase);
    const entry: DownloadedTranslationMeta = {
      downloadedAt: new Date().toISOString(),
      verseCount: result.verseCount,
      sizeBytes: result.sizeBytes,
      bookVerseCounts: result.bookVerseCounts,
    };
    this.downloadedTranslations[meta.id] = entry;
    this.downloadedProviders.set(
      meta.id,
      DownloadedProvider.fromStored(this.app, translationFilePath(this.manifestDir(), meta.id), result.stored),
    );
    this.invalidatePoolCache();
    this.scheduleIdleRelease();
    await this.savePluginData();
    return entry;
  }

  /** Pool size without building the pool, when it can be derived cheaply from
   * the download meta (settings counter). Null = use getPoolInfo(). */
  async quickPoolSize(): Promise<number | null> {
    const s = this.settings;
    if (s.poolMode === "curated" || this.poolCache) return null;
    const counts = this.downloadedTranslations[s.translationId]?.bookVerseCounts;
    if (!counts) return null;
    if (!(await this.getDownloadedProvider(s.translationId).isAvailable())) return null;
    const books = s.poolMode === "books" ? (BOOK_PRESETS[s.bookPreset]?.books ?? []) : [];
    const size = poolSizeFromCounts(counts, books);
    return size > 0 ? size : null;
  }

  /** After a download or deletion the cached provider/pool must be dropped. */
  resetDownloadedProvider(translationId: string): void {
    this.downloadedProviders.delete(translationId);
    this.invalidatePoolCache();
  }

  /** Frees the in-memory verse maps (~5 MB each) of translations that are no
   * longer selected — relevant on mobile when switching translations. In
   * curated mode no downloaded provider is needed at all. */
  evictUnusedDownloadedProviders(): void {
    const keep = this.settings.poolMode === "curated" ? null : this.settings.translationId;
    for (const id of [...this.downloadedProviders.keys()]) {
      if (id !== keep) this.downloadedProviders.delete(id);
    }
  }

  manifestDir(): string {
    return this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
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
    // Parallel callers (watcher + settings tab + command) share one build.
    if (this.poolPromise?.key === cacheKey) return this.poolPromise.promise;

    const promise = this.buildPoolInfo().then(
      (info) => {
        if (this.poolPromise?.promise === promise) {
          this.poolPromise = null;
          this.poolCache = { key: cacheKey, info };
        }
        return info;
      },
      (e: unknown) => {
        if (this.poolPromise?.promise === promise) this.poolPromise = null;
        throw e;
      },
    );
    this.poolPromise = { key: cacheKey, promise };
    return promise;
  }

  private async buildPoolInfo(): Promise<PoolInfo> {
    const s = this.settings;
    const { poolMode, translationId, bookPreset } = s;
    let info: PoolInfo;
    if (poolMode === "curated") {
      info = { keys: this.curatedKeys(), source: "curated", usedFallback: false };
    } else {
      const index = await this.getDownloadedProvider(translationId)
        .getIndex()
        .catch((e) => {
          console.warn("Daily Bible Verse: downloaded translation is unreadable — using the curated pool", e);
          return null;
        });
      if (!index) {
        info = { keys: this.curatedKeys(), source: "curated", usedFallback: true };
      } else {
        this.scheduleIdleRelease();
        const books = poolMode === "books" ? (BOOK_PRESETS[bookPreset]?.books ?? []) : [];
        info = { keys: buildWholeBiblePool(index, books), source: "downloaded", usedFallback: false };
      }
    }
    if (info.keys.length === 0) {
      // Empty theme selection result — fall back to the full curated pool.
      info = { keys: buildCuratedPool(CURATED.verses, []), source: "curated", usedFallback: true };
    }
    return info;
  }

  private curatedKeys(): RefKey[] {
    return buildCuratedPool(CURATED.verses, this.settings.selectedThemes);
  }

  private providerFor(info: PoolInfo): VerseTextProvider {
    if (info.source === "downloaded") {
      return this.getDownloadedProvider(this.settings.translationId);
    }
    const id = this.currentTranslation().id;
    let provider = this.bundledProviders.get(id);
    if (!provider) {
      provider = new BundledProvider(id);
      this.bundledProviders.set(id, provider);
    }
    return provider;
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
      // verse may be absent from this translation. Walk the deck BACKWARDS
      // (past days) until a verse resolves — walking forward would pull in
      // the verses of the coming days and show them twice.
      for (let offset = 0; offset <= Math.min(pool.keys.length, 50) && text === null; offset++) {
        refKey = selectRefForDay(pool.keys, dayIndex - offset, this.settings.baseSeed);
        text = await provider.getText(refKey);
      }
    }
    if (pool.source === "downloaded") this.scheduleIdleRelease();
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
      calloutType: normalizeCalloutType(s.calloutType) || "bible",
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

  /** Re-rolls the verse of `date` and freezes the result for that day. */
  async rerollForDate(date: Date): Promise<RenderedVerse> {
    const dateKey = localDateKey(date);
    const pool = await this.getPoolInfo();
    const previous = this.overrides[dateKey];
    this.overrides[dateKey] = rerollRefForDay(
      pool.keys,
      daysSinceEpochLocal(date),
      this.settings.baseSeed,
      previous?.rerollCount ?? 0,
      previous?.refKey,
    );
    await this.savePluginData();
    return this.renderForDate(date);
  }

  /** Re-rolls today's verse and freezes the result for the rest of the day. */
  async rerollToday(): Promise<RenderedVerse> {
    return this.rerollForDate(new Date());
  }

  // ---- daily-note helpers -----------------------------------------------

  /** The date of a daily note (per the Daily/Periodic Notes format), or null
   * for any other file or when no daily-notes plugin is configured. */
  dateForFile(file: TFile | null): Date | null {
    if (!file || file.extension !== "md") return null;
    try {
      const m = getDateFromFile(file, "day");
      return m ? m.toDate() : null;
    } catch {
      return null;
    }
  }

  /** Today's existing daily note, or null. Never creates one. */
  todaysDailyNote(): TFile | null {
    try {
      return getDailyNote(moment(), getAllDailyNotes()) ?? null;
    } catch {
      return null;
    }
  }

  notifyFallback(rendered: RenderedVerse): void {
    if (rendered.usedFallbackPool && this.settings.poolMode !== "curated") {
      new Notice(
        "Daily Bible Verse: this translation is not downloaded on this device yet — using the curated verse pool. Download it in the plugin settings.",
      );
    }
  }
}
