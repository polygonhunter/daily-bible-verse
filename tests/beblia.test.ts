import { describe, expect, it } from "vitest";
import { parseBebliaXml } from "../src/core/beblia";

function fixture(): string {
  const verses = Array.from(
    { length: 1200 },
    (_, i) => `<verse number="${(i % 30) + 1}">Text ${i}</verse>`,
  );
  // 40 chapters of 30 verses inside book 1, plus a small book 43.
  const chapters = Array.from(
    { length: 40 },
    (_, c) => `<chapter number="${c + 1}">${verses.slice(c * 30, c * 30 + 30).join("")}</chapter>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<bible translation="Test" status="Public Domain">
  <testament name="Old">
    <book number="1">${chapters.join("\n")}</book>
  </testament>
  <testament name="New">
    <book number="43">
      <chapter number="3">
        <verse number="16">Also hat Gott die Welt geliebt &quot;so&quot;<br/>zweite Zeile</verse>
        <verse number="17"><S>123</S>Denn Gott hat seinen Sohn nicht gesandt</verse>
        <verse number="18">***</verse>
      </chapter>
    </book>
  </testament>
</bible>`;
}

describe("parseBebliaXml", () => {
  it("parses books, chapters, verses and sanitizes text", () => {
    const parsed = parseBebliaXml(fixture());
    expect(parsed.verses.get("43:3:16")).toBe('Also hat Gott die Welt geliebt "so"\nzweite Zeile');
    expect(parsed.verses.get("43:3:17")).toBe("Denn Gott hat seinen Sohn nicht gesandt");
    expect(parsed.verses.get("1:1:1")).toBe("Text 0");
    expect(parsed.verses.get("1:40:30")).toBe("Text 1199");
  });

  it("builds a per-chapter verse-count index", () => {
    const parsed = parseBebliaXml(fixture());
    expect(parsed.index.get(1)?.size).toBe(40);
    expect(parsed.index.get(1)?.get(40)).toBe(30);
    expect(parsed.index.get(43)?.get(3)).toBe(17);
  });

  it("skips separator artifacts like Darby's '***' pseudo-verses", () => {
    const parsed = parseBebliaXml(fixture());
    expect(parsed.verses.has("43:3:18")).toBe(false);
    expect(parsed.index.get(43)?.get(3)).toBe(17);
  });

  it("rejects documents that do not look like a Bible", () => {
    expect(() => parseBebliaXml("<html><body>404</body></html>")).toThrow();
    expect(() => parseBebliaXml('<bible><book number="1"><chapter number="1"><verse number="1">x</verse></chapter></book></bible>')).toThrow();
  });
});
