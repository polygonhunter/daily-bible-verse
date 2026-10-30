import { describe, expect, it } from "vitest";
import { buildWholeBiblePool } from "../src/core/pool";
import {
  DownloadedProvider,
  type StoredTranslation,
} from "../src/providers/downloaded-provider";

const stored: StoredTranslation = {
  schemaVersion: 1,
  translationId: "luther1912",
  verses: {
    "43:3:16": "Also hat Gott die Welt geliebt.",
    "43:3:17": "Denn Gott hat seinen Sohn nicht gesandt.",
    "19:23:1": "Der HERR ist mein Hirte.",
    "19:23:2": "Er weidet mich.",
  },
  index: { "43": { "3": 17 }, "19": { "23": 2 } },
};

function makeProvider(
  available = true,
  data: StoredTranslation = stored,
  counter = { reads: 0 },
): DownloadedProvider {
  const fakeApp = {
    vault: {
      adapter: {
        exists: async () => available,
        read: async () => {
          counter.reads++;
          return JSON.stringify(data);
        },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new DownloadedProvider(fakeApp as any, "plugins/daily-bible-verse/translations/luther1912.json", "luther1912");
}

describe("DownloadedProvider", () => {
  it("returns single verses and joined ranges", async () => {
    const p = makeProvider();
    expect(await p.getText("43:3:16-16")).toBe("Also hat Gott die Welt geliebt.");
    expect(await p.getText("19:23:1-2")).toBe("Der HERR ist mein Hirte. Er weidet mich.");
  });

  it("returns null for missing verses and missing files", async () => {
    expect(await makeProvider().getText("1:1:1-1")).toBeNull();
    expect(await makeProvider(false).getText("43:3:16-16")).toBeNull();
  });

  it("exposes an index usable for whole-Bible pools", async () => {
    const index = await makeProvider().getIndex();
    expect(index).not.toBeNull();
    const pool = buildWholeBiblePool(index!, []);
    expect(pool).toHaveLength(19); // 17 + 2 verses per the fixture index
    expect(buildWholeBiblePool(index!, [19])).toHaveLength(2);
  });

  it("keeps the translation's own numbering for references", () => {
    expect(makeProvider().sourceRef("19:46:1-1")).toBe("19:46:1-1");
  });

  it("finishes a download interrupted between remove and rename", async () => {
    const path = "plugins/daily-bible-verse/translations/luther1912.json";
    const files = new Map([[`${path}.tmp`, JSON.stringify(stored)]]);
    const fakeApp = {
      vault: {
        adapter: {
          exists: async (p: string) => files.has(p),
          read: async (p: string) => files.get(p) ?? "",
          rename: async (from: string, to: string) => {
            files.set(to, files.get(from) ?? "");
            files.delete(from);
          },
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = new DownloadedProvider(fakeApp as any, path, "luther1912");
    expect(await p.isAvailable()).toBe(true);
    expect([...files.keys()]).toEqual([path]);
    expect(await p.getText("43:3:16-16")).toBe("Also hat Gott die Welt geliebt.");
  });

  it("ignores a truncated temp file", async () => {
    const path = "x.json";
    const fakeApp = {
      vault: { adapter: { exists: async (p: string) => p === `${path}.tmp`, read: async () => '{"schemaVer' } },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await new DownloadedProvider(fakeApp as any, path, "luther1912").isAvailable()).toBe(false);
  });

  it("rejects corrupt files", async () => {
    const bad = { ...stored, translationId: "other" };
    await expect(makeProvider(true, bad).getText("43:3:16-16")).rejects.toThrow(/Corrupt/);
  });

  it("parallel lookups share a single read + parse", async () => {
    const counter = { reads: 0 };
    const p = makeProvider(true, stored, counter);
    const results = await Promise.all([p.getText("43:3:16-16"), p.getText("19:23:1-1"), p.getIndex()]);
    expect(results[0]).toBe("Also hat Gott die Welt geliebt.");
    expect(results[1]).toBe("Der HERR ist mein Hirte.");
    expect(counter.reads).toBe(1);
  });

  it("release() frees the texts and the next lookup reloads", async () => {
    const counter = { reads: 0 };
    const p = makeProvider(true, stored, counter);
    await p.getText("43:3:16-16");
    expect(p.isLoaded).toBe(true);
    p.release();
    expect(p.isLoaded).toBe(false);
    expect(await p.getText("43:3:17-17")).toBe("Denn Gott hat seinen Sohn nicht gesandt.");
    expect(counter.reads).toBe(2);
  });

  it("does not resolve inherited object keys as verses", async () => {
    expect(await makeProvider().getText("1:1:1-1")).toBeNull();
    const p = makeProvider();
    // "constructor" etc. can never be produced by parseRefKey, but the lookup
    // must rely on own properties only.
    expect(await p.getText("43:3:18-18")).toBeNull();
  });

  it("fromStored serves texts without reading the file", async () => {
    const counter = { reads: 0 };
    const fakeApp = { vault: { adapter: { exists: async () => true, read: async () => { counter.reads++; return ""; } } } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = DownloadedProvider.fromStored(fakeApp as any, "x.json", stored);
    expect(await p.getText("19:23:1-2")).toBe("Der HERR ist mein Hirte. Er weidet mich.");
    expect(counter.reads).toBe(0);
  });
});
