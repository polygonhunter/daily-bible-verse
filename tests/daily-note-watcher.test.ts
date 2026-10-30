import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian-daily-notes-interface", () => ({
  appHasDailyNotesPluginLoaded: () => true,
  getDailyNoteSettings: () => ({ folder: "Daily", format: "YYYY-MM-DD" }),
  getDateFromFile: (file: { basename: string }) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(file.basename);
    if (!m) return null;
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return { toDate: () => date };
  },
}));

// Same module instance as the "obsidian" alias the watcher imports.
import { TFile } from "./stubs/obsidian";
import { DailyNoteWatcher } from "../src/daily-note-watcher";
import { MARKER } from "../src/core/renderer";

type Listener = (file: unknown) => void;

function todayName(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function setup() {
  const files = new Map<string, TFile>();
  const contents = new Map<TFile, string>();
  const listeners: Record<string, Listener[]> = { create: [], modify: [] };
  let layoutReady: (() => void) | null = null;
  const vault = {
    on: (name: string, fn: Listener) => {
      listeners[name].push(fn);
      return { name, fn };
    },
    offref: (ref: { name: string; fn: Listener }) => {
      listeners[ref.name] = listeners[ref.name].filter((l) => l !== ref.fn);
    },
    getAbstractFileByPath: (p: string) => files.get(p) ?? null,
    cachedRead: async (f: TFile) => contents.get(f) ?? "",
    process: async (f: TFile, fn: (c: string) => string) => {
      const next = fn(contents.get(f) ?? "");
      contents.set(f, next);
      return next;
    },
  };
  const verse = "> [!bible] Johannes 3,16 " + MARKER + "\n> Also hat Gott die Welt geliebt.";
  const plugin = {
    settings: { autoInsertOnDailyNote: true, insertPosition: "after-frontmatter" },
    app: {
      vault,
      workspace: { onLayoutReady: (fn: () => void) => (layoutReady = fn) },
      fileManager: { processFrontMatter: async () => {} },
    },
    register: () => {},
    registerEvent: () => {},
    renderForDate: async () => ({ markdown: verse, reference: "Johannes 3,16", usedFallbackPool: false }),
    notifyFallback: () => {},
    applyReferenceProperty: async () => {},
    todaysDailyNotePath: () => `Daily/${todayName()}.md`,
  };
  const watcher = new DailyNoteWatcher(plugin as never);
  const create = (path: string, content = "") => {
    const f = new TFile(path);
    files.set(path, f);
    contents.set(f, content);
    for (const l of listeners.create) l(f);
    return f;
  };
  const move = (f: TFile, to: string) => {
    files.delete(f.path);
    f.path = to;
    files.set(to, f);
  };
  const overwrite = (f: TFile, content: string) => {
    contents.set(f, content);
    for (const l of listeners.modify) l(f);
  };
  const remove = (f: TFile) => {
    files.delete(f.path);
    contents.delete(f);
  };
  return {
    watcher,
    plugin,
    files,
    contents,
    create,
    move,
    overwrite,
    remove,
    ready: () => layoutReady?.(),
  };
}

const markers = (s: string | undefined) => (s ?? "").split(MARKER).length - 1;

describe("DailyNoteWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the verse when Templater moves the note and overwrites it later", async () => {
    const env = setup();
    env.watcher.start();
    env.ready();
    const f = env.create(`Daily/${todayName()}.md`);
    await vi.advanceTimersByTimeAsync(5000); // both timed attempts are done
    expect(markers(env.contents.get(f))).toBe(1);

    // After a template prompt (t = 5 s), tp.file.move gives a new path, then
    // the rendered template replaces the content.
    env.move(f, `Daily/Archiv/${todayName()}.md`);
    env.overwrite(f, "# Heute\n");
    await vi.advanceTimersByTimeAsync(2000);
    expect(markers(env.contents.get(f))).toBe(1);
  });

  it("leaves a new empty note alone until a Templater folder template had its chance", async () => {
    const env = setup();
    env.watcher.start();
    env.ready();
    const f = env.create(`Daily/${todayName()}.md`);
    await vi.advanceTimersByTimeAsync(0);
    // Templater applies folder templates only to an empty note (~300 ms).
    expect(env.contents.get(f)).toBe("");
    await vi.advanceTimersByTimeAsync(300);
    env.overwrite(f, "# Heute\n");
    await vi.advanceTimersByTimeAsync(1500);
    expect(env.contents.get(f)).toContain("# Heute");
    expect(markers(env.contents.get(f))).toBe(1);
  });

  it("fills a note created with content (core template) right away", async () => {
    const env = setup();
    env.watcher.start();
    env.ready();
    const f = env.create(`Daily/${todayName()}.md`, "# Template\n");
    await vi.advanceTimersByTimeAsync(0);
    expect(markers(env.contents.get(f))).toBe(1);
  });

  it("handles a note deleted and re-created under the same path", async () => {
    const env = setup();
    env.watcher.start();
    env.ready();
    const path = `Daily/${todayName()}.md`;
    const first = env.create(path);
    await vi.advanceTimersByTimeAsync(0);
    env.remove(first);
    const second = env.create(path);
    await vi.advanceTimersByTimeAsync(1500);
    expect(markers(env.contents.get(second))).toBe(1);
  });

  it("startup check: picks up today's note created during a slow start", async () => {
    const env = setup();
    env.watcher.start();
    // Note created at plugin load, layout-ready only 30 s later.
    const f = new TFile(`Daily/${todayName()}.md`);
    env.files.set(f.path, f);
    env.contents.set(f, "");
    await vi.advanceTimersByTimeAsync(30_000);
    env.ready();
    await vi.advanceTimersByTimeAsync(1500);
    expect(markers(env.contents.get(f))).toBe(1);
  });

  it("startup check does nothing when auto-insert is off", async () => {
    const env = setup();
    env.plugin.settings.autoInsertOnDailyNote = false;
    env.watcher.start();
    const f = new TFile(`Daily/${todayName()}.md`);
    env.files.set(f.path, f);
    env.contents.set(f, "");
    env.ready();
    await vi.advanceTimersByTimeAsync(2000);
    expect(markers(env.contents.get(f))).toBe(0);
  });

  it("ignores date-named notes outside the daily-notes folder", async () => {
    const env = setup();
    env.watcher.start();
    env.ready();
    const f = env.create(`Meetings/${todayName()}.md`);
    await vi.advanceTimersByTimeAsync(2000);
    expect(markers(env.contents.get(f))).toBe(0);
  });
});
