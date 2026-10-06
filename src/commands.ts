import { Notice } from "obsidian";
import { insertIntoTodaysDailyNote, rerollAndUpdate } from "./actions";
import { hasPlaceholder } from "./core/insert-logic";
import { MARKER } from "./core/renderer";
import { translationById } from "./core/translations";
import { downloadTranslation } from "./downloader";
import { insertCallout } from "./inserter";
import type DailyBibleVersePlugin from "./main";

/** Command IDs are a public contract (frozen since 1.0.0) so external tools —
 * e.g. the Slashosaurus slash menu — can call them via
 * `executeCommandById("daily-bible-verse:<id>")`. */
export function registerCommands(plugin: DailyBibleVersePlugin): void {
  plugin.addCommand({
    id: "insert-todays-verse",
    name: "Insert today's verse at cursor",
    editorCallback: async (editor, ctx) => {
      // In a daily note the note's own date decides the verse.
      const date = plugin.dateForFile(ctx.file) ?? new Date();
      const rendered = await plugin.renderForDate(date);
      plugin.notifyFallback(rendered);
      editor.replaceSelection(`${rendered.markdown}\n`);
    },
  });

  plugin.addCommand({
    id: "insert-verse-into-daily-note",
    name: "Insert today's verse into today's daily note",
    callback: () => insertIntoTodaysDailyNote(plugin),
  });

  plugin.addCommand({
    id: "reroll-todays-verse",
    name: "Re-roll today's verse",
    callback: () => rerollAndUpdate(plugin),
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
      const rendered = await plugin.renderForDate(plugin.dateForFile(file) ?? new Date());
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
