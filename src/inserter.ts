import type { App, TFile } from "obsidian";
import {
  applyToContent,
  replaceMarkerCallout,
  type InsertAction,
  type InsertPosition,
} from "./core/insert-logic";

/** Runs the idempotent insert transform atomically (vault.process guarantees
 * no read-modify-write race with other plugins or a late Templater pass). */
export async function insertCallout(
  app: App,
  file: TFile,
  callout: string,
  position: InsertPosition,
): Promise<InsertAction> {
  let action: InsertAction = "already-present";
  await app.vault.process(file, (content) => {
    const result = applyToContent(content, callout, position);
    action = result.action;
    return result.content;
  });
  return action;
}

/** Replaces an existing marker callout (used by re-roll). Returns false when
 * the file contains no marker callout. */
export async function replaceCallout(app: App, file: TFile, newCallout: string): Promise<boolean> {
  let replaced = false;
  await app.vault.process(file, (content) => {
    const result = replaceMarkerCallout(content, newCallout);
    replaced = result !== null;
    return result ?? content;
  });
  return replaced;
}
