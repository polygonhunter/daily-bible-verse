import { Notice } from "obsidian";
import { insertIntoTodaysDailyNote, rerollAndUpdate } from "./actions";
import { hasPlaceholder } from "./core/insert-logic";
import { MARKER } from "./core/renderer";
import { translationById } from "./core/translations";
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
    id: "show-todays-verse",
    name: "Show today's verse",
    callback: () => plugin.showTodaysVerse(),
  });

  plugin.addCommand({
    id: "insert-verse-into-daily-note",
    name: "Insert today's verse into today's daily note",
    callback: () => insertIntoTodaysDailyNote(plugin),
  });

  plugin.addCommand({
    id: "reroll-todays-verse",
    name: "Re-roll today's verse",
    checkCallback: (checking) => {
      // Offered without an active file or in a Markdown note — not while a
      // PDF, canvas or image is focused.
      const active = plugin.app.workspace.getActiveFile();
      if (active && active.extension !== "md") return false;
      if (!checking) void rerollAndUpdate(plugin);
      return true;
    },
  });

  plugin.addCommand({
    id: "replace-bible-verse-placeholders",
    name: "Replace {{bible-verse}} placeholders in the active note",
    editorCheckCallback: (checking, editor, ctx) => {
      const file = ctx.file;
      if (!file) return false;
      const content = editor.getValue();
      if (content.includes(MARKER) || !hasPlaceholder(content)) return false;
      if (!checking) {
        void (async () => {
          const rendered = await plugin.renderForDate(plugin.dateForFile(file) ?? new Date());
          plugin.notifyFallback(rendered);
          const action = await insertCallout(plugin.app, file, rendered.markdown, plugin.settings.insertPosition);
          if (action !== "already-present") await plugin.applyReferenceProperty(file, rendered.reference);
        })();
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "download-translation",
    name: "Download current translation for whole-Bible mode",
    checkCallback: (checking) => {
      if (plugin.settings.poolMode === "curated") return false;
      const meta = translationById(plugin.settings.translationId);
      if (!meta) return false;
      if (!checking) {
        void (async () => {
          new Notice(`Daily Bible Verse: downloading ${meta.displayName} (~4-5 MB)…`);
          try {
            const result = await plugin.downloadAndRegister(meta);
            new Notice(
              `Daily Bible Verse: ${meta.displayName} downloaded (${result.verseCount.toLocaleString()} verses).`,
            );
          } catch (e) {
            console.error("Daily Bible Verse: download failed", e);
            new Notice("Daily Bible Verse: download failed — check your internet connection.");
          }
        })();
      }
      return true;
    },
  });
}
