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

function makeProvider(available = true, data: StoredTranslation = stored): DownloadedProvider {
  const fakeApp = {
    vault: {
      adapter: {
        exists: async () => available,
        read: async () => JSON.stringify(data),
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

  it("rejects corrupt files", async () => {
    const bad = { ...stored, translationId: "other" };
    await expect(makeProvider(true, bad).getText("43:3:16-16")).rejects.toThrow(/Corrupt/);
  });
});
