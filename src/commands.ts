import { MarkdownView, Notice } from "obsidian";
import { insertIntoTodaysDailyNote, rerollAndUpdate } from "./actions";
import { applyToContent, hasPlaceholder, minimalEdit } from "./core/insert-logic";
import { MARKER } from "./core/renderer";
import { translationById } from "./core/translations";
import type DailyBibleVersePlugin from "./main";

/** Command IDs are a public contract (frozen since 1.0.0) so external tools —
 * e.g. the Slashosaurus slash menu — can call them via
 * `executeCommandById("daily-bible-verse:<id>")`. */
export function registerCommands(plugin: DailyBibleVersePlugin): void {
  plugin.addCommand({
    id: "insert-todays-verse",
    name: "Insert today's verse at cursor",
    editorCallback: async (editor, ctx) => {
      try {
        // In a daily note the note's own date decides the verse.
        const date = plugin.dateForFile(ctx.file) ?? new Date();
        const rendered = await plugin.renderForDate(date);
        plugin.notifyFallback(rendered);
        // A callout must start on its own line and needs a blank line after
        // it — otherwise text behind the cursor is pulled into the quote.
        const from = editor.getCursor("from");
        const to = editor.getCursor("to");
        const lead = editor.getLine(from.line).slice(0, from.ch).trim() ? "\n" : "";
        const tail = editor.getLine(to.line).slice(to.ch).trim() ? "\n\n" : "\n";
        editor.replaceSelection(`${lead}${rendered.markdown}${tail}`);
      } catch (e) {
        reportFailure("insert the verse", e);
      }
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
      if (!checking) rerollAndUpdate(plugin).catch((e) => reportFailure("re-roll the verse", e));
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
        (async () => {
          const rendered = await plugin.renderForDate(plugin.dateForFile(file) ?? new Date());
          plugin.notifyFallback(rendered);
          // Through the editor: the check above saw the editor buffer, which
          // may hold a freshly typed, not yet saved placeholder. Undoable.
          // The first whole-Bible load can take a moment: if the pane showed
          // another note meanwhile, this editor no longer holds `file`.
          if (plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file !== file) return;
          const before = editor.getValue();
          if (!hasPlaceholder(before)) return;
          const result = applyToContent(before, rendered.markdown, plugin.settings.insertPosition);
          const edit = minimalEdit(before, result.content);
          if (!edit) return;
          editor.replaceRange(edit.text, editor.offsetToPos(edit.from), editor.offsetToPos(edit.to));
          await plugin.applyReferenceProperty(file, rendered.reference);
        })().catch((e) => reportFailure("replace the placeholder", e));
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

/** Logs a failed command and tells the user instead of failing silently. */
function reportFailure(what: string, e: unknown): void {
  console.error(`Daily Bible Verse: could not ${what}`, e);
  new Notice(`Daily Bible Verse: could not ${what} — see the developer console.`);
}
