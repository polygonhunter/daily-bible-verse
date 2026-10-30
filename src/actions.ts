import { MarkdownView, moment as obsidianMoment, Notice, type TFile } from "obsidian";
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
} from "obsidian-daily-notes-interface";
import { localDateKey } from "./core/date";
import { findMarkerCallout } from "./core/insert-logic";
import { MARKER } from "./core/renderer";
import { insertCallout, replaceCallout } from "./inserter";
import type DailyBibleVersePlugin from "./main";

// Obsidian's moment export is typed as a namespace; cast once to call it.
const moment = obsidianMoment as unknown as typeof import("moment");

/** User-facing actions shared by commands, the verse modal and the API. */

export interface RerollTarget {
  /** Note whose verse callout gets replaced; null = only re-roll and store. */
  file: TFile | null;
  /** Day whose verse is re-rolled (the note's date, not necessarily today). */
  date: Date;
}

/** Re-roll target: the active daily note (its own date) — otherwise another
 * active note that holds a verse callout (e.g. inserted at the cursor in a
 * project note; today's date, as in 1.0.x) — otherwise today's daily note —
 * otherwise nothing to update, just today's stored verse. */
export async function resolveRerollTarget(plugin: DailyBibleVersePlugin): Promise<RerollTarget> {
  const active = plugin.app.workspace.getActiveFile();
  const activeDate = plugin.dateForFile(active);
  if (active && activeDate) return { file: active, date: activeDate };
  if (active?.extension === "md" && (await activeContent(plugin, active)).includes(MARKER)) {
    return { file: active, date: new Date() };
  }
  return { file: plugin.todaysDailyNote(), date: new Date() };
}

/** Content of the active note — from the editor when open (may be unsaved). */
async function activeContent(plugin: DailyBibleVersePlugin, file: TFile): Promise<string> {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (view?.file?.path === file.path) return view.editor.getValue();
  try {
    return await plugin.app.vault.cachedRead(file);
  } catch {
    return "";
  }
}

/** "today" or the note's date, for notices. */
export function dayLabel(date: Date): string {
  return localDateKey(date) === localDateKey(new Date()) ? "today" : localDateKey(date);
}

/** Replaces the marker callout in `file`. When the file is open in the active
 * editor the change goes through the editor, so Ctrl/Cmd+Z undoes it. */
export async function replaceVerseInFile(
  plugin: DailyBibleVersePlugin,
  file: TFile,
  markdown: string,
): Promise<boolean> {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (view?.file?.path === file.path) {
    const editor = view.editor;
    const lines: string[] = [];
    for (let i = 0; i < editor.lineCount(); i++) lines.push(editor.getLine(i));
    const span = findMarkerCallout(lines);
    if (!span) return false;
    editor.replaceRange(
      markdown,
      { line: span.start, ch: 0 },
      { line: span.end, ch: editor.getLine(span.end).length },
    );
    return true;
  }
  return replaceCallout(plugin.app, file, markdown);
}

/** Re-rolls the verse for `target` (default: resolved from the workspace) and
 * updates the note's callout. */
export async function rerollAndUpdate(plugin: DailyBibleVersePlugin, explicitTarget?: RerollTarget): Promise<void> {
  const target = explicitTarget ?? (await resolveRerollTarget(plugin));
  const rendered = await plugin.rerollForDate(target.date);
  const label = dayLabel(target.date);
  const replaced = target.file ? await replaceVerseInFile(plugin, target.file, rendered.markdown) : false;
  if (replaced && target.file) await plugin.applyReferenceProperty(target.file, rendered.reference);
  let suffix = "";
  if (!target.file) suffix = " (no daily note to update)";
  else if (!replaced) suffix = ` (no verse callout in ${target.file.basename} to update)`;
  new Notice(`Daily Bible Verse: the verse for ${label} is now ${rendered.reference}${suffix}.`);
}

/** Inserts today's verse into today's daily note (creating the note if
 * needed) and opens it. */
export async function insertIntoTodaysDailyNote(plugin: DailyBibleVersePlugin): Promise<void> {
  if (!appHasDailyNotesPluginLoaded()) {
    new Notice("Daily Bible Verse: the Daily Notes (or Periodic Notes) plugin is not enabled.");
    return;
  }
  try {
    await insertAndOpen(plugin);
  } catch (e) {
    console.error("Daily Bible Verse: could not insert the verse into today's daily note", e);
    new Notice("Daily Bible Verse: could not insert the verse — see the developer console.");
  }
}

async function insertAndOpen(plugin: DailyBibleVersePlugin): Promise<void> {
  // todaysDailyNote() tolerates a daily-notes folder that does not exist yet;
  // createDailyNote then creates it.
  let file: TFile | null = plugin.todaysDailyNote();
  if (!file) file = (await createDailyNote(moment())) ?? null;
  if (!file) {
    new Notice("Daily Bible Verse: could not open or create today's daily note.");
    return;
  }
  const rendered = await plugin.renderForDate(new Date());
  plugin.notifyFallback(rendered);
  const action = await insertCallout(plugin.app, file, rendered.markdown, plugin.settings.insertPosition);
  if (action === "already-present") {
    new Notice("Daily Bible Verse: today's note already has a verse.");
  } else {
    await plugin.applyReferenceProperty(file, rendered.reference);
  }
  await plugin.app.workspace.getLeaf().openFile(file);
}
