import { TFile, type TAbstractFile } from "obsidian";
import { appHasDailyNotesPluginLoaded, getDateFromFile } from "obsidian-daily-notes-interface";
import { insertCallout } from "./inserter";
import type DailyBibleVersePlugin from "./main";

/** Auto-inserts the daily verse when a daily note is created.
 *
 * Guards: the vault fires `create` for every file during startup indexing, so
 * we only attach after layout-ready AND check the file was created moments ago
 * (also skips files synced in from other devices). Because Templater may
 * overwrite the note content shortly after creation, the idempotent insert is
 * retried on a short schedule — each attempt is a no-op when the verse marker
 * survived, and re-inserts (or fills a {{bible-verse}} placeholder) when the
 * template replaced the content. */
export class DailyNoteWatcher {
  private static readonly ATTEMPT_DELAYS_MS = [0, 400, 1500, 3500];
  private static readonly FRESH_FILE_WINDOW_MS = 10_000;

  constructor(private readonly plugin: DailyBibleVersePlugin) {}

  start(): void {
    this.plugin.app.workspace.onLayoutReady(() => {
      this.plugin.registerEvent(
        this.plugin.app.vault.on("create", (file) => void this.onCreate(file)),
      );
    });
  }

  private async onCreate(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    if (!this.plugin.settings.autoInsertOnDailyNote) return;
    if (Date.now() - file.stat.ctime > DailyNoteWatcher.FRESH_FILE_WINDOW_MS) return;

    let noteDate: Date | null = null;
    try {
      if (!appHasDailyNotesPluginLoaded()) return;
      const m = getDateFromFile(file, "day");
      if (!m) return;
      noteDate = m.toDate();
    } catch {
      return;
    }

    // The note's date drives the verse: creating yesterday's note late at
    // night yields yesterday's verse.
    const rendered = await this.plugin.renderForDate(noteDate);
    this.plugin.notifyFallback(rendered);
    for (const delay of DailyNoteWatcher.ATTEMPT_DELAYS_MS) {
      const id = window.setTimeout(() => {
        void insertCallout(
          this.plugin.app,
          file,
          rendered.markdown,
          this.plugin.settings.insertPosition,
        );
      }, delay);
      this.plugin.registerInterval(id);
    }
  }
}
