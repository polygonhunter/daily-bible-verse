import { normalizePath, requestUrl, type App } from "obsidian";
import { parseBebliaXml } from "./core/beblia";
import { BEBLIA_BASE_URL, type TranslationMeta } from "./core/translations";
import type { StoredTranslation } from "./providers/downloaded-provider";

export function translationFilePath(manifestDir: string, translationId: string): string {
  return normalizePath(`${manifestDir}/translations/${translationId}.json`);
}

/** One-time download of a full translation (~4-5 MB) for whole-Bible mode.
 * Fetched via requestUrl (no CORS restrictions, mobile-safe), parsed with the
 * same sanitizer as the bundled data, stored in the plugin folder. */
export async function downloadTranslation(
  app: App,
  manifestDir: string,
  meta: TranslationMeta,
): Promise<{ verseCount: number; sizeBytes: number }> {
  const response = await requestUrl({ url: `${BEBLIA_BASE_URL}${meta.bebliaFile}` });
  const parsed = parseBebliaXml(response.text);
  if (parsed.verses.size < 20000) {
    throw new Error(`Downloaded data for ${meta.id} looks incomplete (${parsed.verses.size} verses)`);
  }

  const stored: StoredTranslation = {
    schemaVersion: 1,
    translationId: meta.id,
    verses: Object.fromEntries(parsed.verses),
    index: Object.fromEntries(
      [...parsed.index.entries()].map(([book, chapters]) => [
        String(book),
        Object.fromEntries([...chapters.entries()].map(([c, n]) => [String(c), n])),
      ]),
    ),
  };

  const dir = normalizePath(`${manifestDir}/translations`);
  if (!(await app.vault.adapter.exists(dir))) {
    await app.vault.adapter.mkdir(dir);
  }
  const json = JSON.stringify(stored);
  await writeAtomically(app, translationFilePath(manifestDir, meta.id), json);
  return { verseCount: parsed.verses.size, sizeBytes: new TextEncoder().encode(json).byteLength };
}

/** Writes to `<path>.tmp` first and renames afterwards, so an interrupted
 * write (app closed, disk full, mobile kill) never leaves a truncated file
 * that would later fail to parse. */
async function writeAtomically(app: App, path: string, data: string): Promise<void> {
  const adapter = app.vault.adapter;
  const tmp = `${path}.tmp`;
  try {
    await adapter.write(tmp, data);
    if (await adapter.exists(path)) await adapter.remove(path);
    await adapter.rename(tmp, path);
  } catch (e) {
    try {
      if (await adapter.exists(tmp)) await adapter.remove(tmp);
    } catch {
      // best effort
    }
    throw e;
  }
}

export async function deleteDownloadedTranslation(
  app: App,
  manifestDir: string,
  translationId: string,
): Promise<void> {
  const path = translationFilePath(manifestDir, translationId);
  if (await app.vault.adapter.exists(path)) {
    await app.vault.adapter.remove(path);
  }
}
