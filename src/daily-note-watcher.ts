import { moment as obsidianMoment, normalizePath, Notice, TFile, type EventRef, type TAbstractFile } from "obsidian";
import { appHasDailyNotesPluginLoaded, getDailyNoteSettings, getDateFromFile } from "obsidian-daily-notes-interface";
import { isInDailyNotesFolder, isWithinDayWindow, normalizeFolder } from "./core/daily-note-rules";
import { daysSinceEpochLocal } from "./core/date";
import type { InsertAction } from "./core/insert-logic";
import { MARKER } from "./core/renderer";
import { insertCallout } from "./inserter";
import type DailyBibleVersePlugin from "./main";

// Obsidian's moment export is typed as a namespace; cast once to call it.
const moment = obsidianMoment as unknown as typeof import("moment");

/** Auto-inserts the daily verse when a daily note is created.
 *
 * Guards: the vault fires `create` for every file during startup indexing, so
 * we only attach after layout-ready AND check the file was created moments
 * ago. The note must also live in the daily-notes folder and its date must be
 * within ±7 days of today — date-named files elsewhere and old notes synced
 * in on a new device (fresh ctime!) are left alone.
 *
 * Templater may overwrite the note after creation (possibly after a prompt
 * that takes a while), so besides two timed attempts the watcher listens to
 * `modify` of exactly this file for 60 s: whenever the verse marker vanished,
 * the idempotent insert runs again. It stops after the first such re-insert.
 *
 * The watcher keeps the TFile object, not its path: a template that moves or
 * renames the note (tp.file.move / tp.file.rename) must not lose the verse. */
export class DailyNoteWatcher {
  private static readonly ATTEMPT_DELAYS_MS = [0, 1500];
  private static readonly WATCH_WINDOW_MS = 60_000;
  private static readonly FRESH_FILE_WINDOW_MS = 10_000;
  private static readonly DATE_WINDOW_DAYS = 7;

  private readonly timers = new Set<number>();
  private readonly watches = new Set<() => void>();
  /** Per file object, so a note deleted and re-created under the same path
   * is handled again. */
  private readonly handled = new WeakSet<TFile>();
  private readonly loadedAt = Date.now();
  private unloaded = false;

  constructor(private readonly plugin: DailyBibleVersePlugin) {}

  start(): void {
    this.plugin.register(() => {
      this.unloaded = true;
      for (const id of this.timers) window.clearTimeout(id);
      this.timers.clear();
      for (const stop of [...this.watches]) stop();
    });
    this.plugin.app.workspace.onLayoutReady(() => {
      this.plugin.registerEvent(
        this.plugin.app.vault.on("create", (file) => void this.onCreate(file)),
      );
      // "Open daily note on startup" creates today's note before the create
      // listener exists — catch that case once (onCreate is idempotent).
      this.checkTodaysNoteFromStartup();
    });
  }

  /** Looks up today's note by its expected path (no folder scan) and only
   * when auto-insert is on. A slow (mobile) start may take longer than the
   * freshness window until layout-ready, so notes created since the plugin
   * loaded count as fresh here. */
  private checkTodaysNoteFromStartup(): void {
    if (!this.plugin.settings.autoInsertOnDailyNote) return;
    try {
      if (!appHasDailyNotesPluginLoaded()) return;
      const settings = getDailyNoteSettings();
      const name = moment().format(settings?.format || "YYYY-MM-DD");
      const folder = normalizeFolder(settings?.folder);
      const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(folder ? `${folder}/${name}.md` : `${name}.md`));
      if (file) void this.onCreate(file, this.loadedAt - DailyNoteWatcher.FRESH_FILE_WINDOW_MS);
    } catch {
      // Daily-notes folder missing or plugin not configured — nothing to do.
    }
  }

  private setTimer(fn: () => void, delay: number): number {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.unloaded) fn();
    }, delay);
    this.timers.add(id);
    return id;
  }

  /** Returns the note date when `file` qualifies for auto-insert, else null. */
  private qualifyingDate(file: TAbstractFile, freshSince: number): Date | null {
    if (!(file instanceof TFile) || file.extension !== "md") return null;
    if (!this.plugin.settings.autoInsertOnDailyNote) return null;
    if (file.stat.ctime < freshSince) return null;
    try {
      if (!appHasDailyNotesPluginLoaded()) return null;
      const settings = getDailyNoteSettings();
      if (!isInDailyNotesFolder(file.path, settings?.folder, settings?.format || "YYYY-MM-DD")) return null;
      const m = getDateFromFile(file, "day");
      if (!m) return null;
      const noteDate = m.toDate();
      const days = DailyNoteWatcher.DATE_WINDOW_DAYS;
      if (!isWithinDayWindow(daysSinceEpochLocal(noteDate), daysSinceEpochLocal(new Date()), days)) {
        return null;
      }
      return noteDate;
    } catch {
      return null;
    }
  }

  private async onCreate(
    file: TAbstractFile,
    freshSince = Date.now() - DailyNoteWatcher.FRESH_FILE_WINDOW_MS,
  ): Promise<void> {
    if (this.unloaded || !(file instanceof TFile) || this.handled.has(file)) return;
    const noteDate = this.qualifyingDate(file, freshSince);
    if (!noteDate) return;
    this.handled.add(file);

    // The note's date drives the verse: creating yesterday's note late at
    // night yields yesterday's verse.
    let verse: { markdown: string; reference: string };
    try {
      const rendered = await this.plugin.renderForDate(noteDate);
      if (this.unloaded) return;
      this.plugin.notifyFallback(rendered);
      verse = rendered;
    } catch (e) {
      console.error("Daily Bible Verse: could not render the verse for a new daily note", e);
      new Notice("Daily Bible Verse: could not insert the verse — see the developer console.");
      return;
    }

    // The immediate attempt leaves an empty note alone: Templater applies a
    // folder template only while the note is still empty (it checks ~300 ms
    // after creation). The later attempt fills a note that stayed empty.
    for (const delay of DailyNoteWatcher.ATTEMPT_DELAYS_MS) {
      this.setTimer(() => void this.attempt(file, verse, delay === 0), delay);
    }
    this.watchForOverwrites(file, verse);
  }

  /** Re-inserts after a template plugin replaced the content. */
  private watchForOverwrites(file: TFile, verse: { markdown: string; reference: string }): void {
    const vault = this.plugin.app.vault;
    let scheduled = false;
    let ref: EventRef | null = null;
    let timer = 0;
    const stop = () => {
      if (ref) vault.offref(ref);
      ref = null;
      window.clearTimeout(timer);
      this.timers.delete(timer);
      this.watches.delete(stop);
    };
    ref = vault.on("modify", (f) => {
      if (f !== file || scheduled) return;
      scheduled = true;
      // attempt() is idempotent, so overlapping modify events are harmless.
      void Promise.resolve().then(async () => {
        scheduled = false;
        const action = await this.attempt(file, verse);
        if (action === "inserted" || action === "placeholder") stop();
      });
    });
    this.watches.add(stop);
    timer = this.setTimer(stop, DailyNoteWatcher.WATCH_WINDOW_MS);
  }

  /** One idempotent insert attempt. Never throws. */
  private async attempt(
    file: TFile,
    verse: { markdown: string; reference: string },
    skipIfEmpty = false,
  ): Promise<InsertAction | null> {
    if (this.unloaded) return null;
    // Deleted meanwhile? (A rename keeps the object and updates file.path.)
    if (this.plugin.app.vault.getAbstractFileByPath(file.path) !== file) return null;
    try {
      // Cheap pre-check: no write (and thus no own modify event) when the
      // verse is already there.
      const content = await this.plugin.app.vault.cachedRead(file);
      if (content.includes(MARKER) || this.unloaded) return "already-present";
      if (skipIfEmpty && content.trim() === "") return null;
      const action = await insertCallout(this.plugin.app, file, verse.markdown, this.plugin.settings.insertPosition);
      if (action !== "already-present" && !this.unloaded) {
        await this.plugin.applyReferenceProperty(file, verse.reference);
      }
      return action;
    } catch (e) {
      console.error("Daily Bible Verse: auto-insert failed", e);
      return null;
    }
  }
}
