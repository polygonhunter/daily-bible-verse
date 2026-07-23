import moment from "moment";
import { Notice, type TFile } from "obsidian";
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
} from "obsidian-daily-notes-interface";
import { hasPlaceholder } from "./core/insert-logic";
import { MARKER } from "./core/renderer";
import { translationById } from "./core/translations";
import { downloadTranslation } from "./downloader";
import { insertCallout, replaceCallout } from "./inserter";
import type DailyBibleVersePlugin from "./main";

/** Command IDs are a public contract (frozen since 1.0.0) so external tools —
 * e.g. the Slashosaurus slash menu — can call them via
 * `executeCommandById("daily-bible-verse:<id>")`. */
export function registerCommands(plugin: DailyBibleVersePlugin): void {
  plugin.addCommand({
    id: "insert-todays-verse",
    name: "Insert today's verse at cursor",
    editorCallback: async (editor) => {
      const rendered = await plugin.renderForDate(new Date());
      plugin.notifyFallback(rendered);
      editor.replaceSelection(`${rendered.markdown}\n`);
    },
  });

  plugin.addCommand({
    id: "insert-verse-into-daily-note",
    name: "Insert today's verse into today's daily note",
    callback: async () => {
      if (!appHasDailyNotesPluginLoaded()) {
        new Notice("Daily Bible Verse: the Daily Notes (or Periodic Notes) plugin is not enabled.");
        return;
      }
      const today = moment();
      let file: TFile | null = getDailyNote(today, getAllDailyNotes());
      if (!file) file = (await createDailyNote(today)) ?? null;
      if (!file) {
        new Notice("Daily Bible Verse: could not open or create today's daily note.");
        return;
      }
      const rendered = await plugin.renderForDate(new Date());
      plugin.notifyFallback(rendered);
      const action = await insertCallout(
        plugin.app,
        file,
        rendered.markdown,
        plugin.settings.insertPosition,
      );
      if (action === "already-present") {
        new Notice("Daily Bible Verse: today's note already has a verse.");
      }
      await plugin.app.workspace.getLeaf().openFile(file);
    },
  });

  plugin.addCommand({
    id: "reroll-todays-verse",
    name: "Re-roll today's verse",
    callback: async () => {
      const rendered = await plugin.rerollToday();
      const file = plugin.app.workspace.getActiveFile();
      let replaced = false;
      if (file) replaced = await replaceCallout(plugin.app, file, rendered.markdown);
      new Notice(
        `Daily Bible Verse: today's verse is now ${rendered.reference}${replaced ? "" : " (no existing verse callout in the active note to update)"}.`,
      );
    },
  });

  plugin.addCommand({
    id: "replace-bible-verse-placeholders",
    name: "Replace {{bible-verse}} placeholders in the active note",
    callback: async () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) {
        new Notice("Daily Bible Verse: no active note.");
        return;
      }
      const content = await plugin.app.vault.read(file);
      if (content.includes(MARKER)) {
        new Notice("Daily Bible Verse: this note already has a verse.");
        return;
      }
      if (!hasPlaceholder(content)) {
        new Notice("Daily Bible Verse: no {{bible-verse}} placeholder found.");
        return;
      }
      const rendered = await plugin.renderForDate(new Date());
      plugin.notifyFallback(rendered);
      await insertCallout(plugin.app, file, rendered.markdown, plugin.settings.insertPosition);
    },
  });

  plugin.addCommand({
    id: "download-translation",
    name: "Download current translation for whole-Bible mode",
    callback: async () => {
      const meta = translationById(plugin.settings.translationId);
      if (!meta) {
        new Notice("Daily Bible Verse: unknown translation selected.");
        return;
      }
      new Notice(`Daily Bible Verse: downloading ${meta.displayName} (~4-5 MB)…`);
      try {
        const result = await downloadTranslation(plugin.app, plugin.manifestDir(), meta);
        plugin.downloadedTranslations[meta.id] = {
          downloadedAt: new Date().toISOString(),
          verseCount: result.verseCount,
          sizeBytes: result.sizeBytes,
        };
        plugin.resetDownloadedProvider(meta.id);
        await plugin.savePluginData();
        new Notice(
          `Daily Bible Verse: ${meta.displayName} downloaded (${result.verseCount.toLocaleString()} verses).`,
        );
      } catch (e) {
        console.error("Daily Bible Verse: download failed", e);
        new Notice("Daily Bible Verse: download failed — check your internet connection.");
      }
    },
  });
}
