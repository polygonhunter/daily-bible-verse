<p align="center">
  <img src="assets/icon.svg" width="120" alt="Daily Bible Verse icon">
</p>

# Daily Bible Verse

Start each day with Scripture. This [Obsidian](https://obsidian.md) plugin adds a
**daily Bible verse** to your daily note as an elegant callout — with the correctly
localized verse reference, an attribution line, and an optional emoji (📖 ✝️ 🕊️ …):

```markdown
> [!bible] Johannes 3,16
> Also hat Gott die Welt geliebt, daß er seinen eingeborenen Sohn gab, auf daß alle,
> die an ihn glauben, nicht verloren werden, sondern das ewige Leben haben.
>
> — Luther 1912
```

The callout is written as **plain markdown** into your note: it stays readable on every
device, in exports, and even if you uninstall the plugin.

## Features

- **Offline-first** — a curated selection of 526 encouraging verses ships with the plugin
  in all supported translations. No API keys, no external services, works on mobile.
- **5 languages** — German, English, Spanish, French, Italian, each with correctly
  localized book names and reference notation ("Johannes 3,16" vs. "John 3:16").
- **Public-domain translations** — Luther 1912, Elberfelder 1905, KJV, Darby 1890,
  Reina-Valera Antigua (1909), Louis Segond 1910, Diodati 1649.
- **Randomness with a system** — a seeded shuffled-deck algorithm guarantees no repeats
  until the whole pool has been used once, then reshuffles: no short-interval repeats,
  no yearly rotation, and fully deterministic (the same day always gets the same verse,
  on every device).
- **Configurable pool** — curated selection (filterable by themes: encouragement,
  comfort, hope, love, wisdom, gratitude, faith, peace — with a live verse counter),
  the **whole Bible** (~31,000 verses, one-time ~5 MB download per translation), or
  book presets (Psalms, New Testament, Gospels, Prophets, Letters of Paul, …).
- **Complete sentences** — in whole-Bible mode a verse that ends mid-sentence is
  continued with the following verses of the same chapter (up to 4).
- **Three ways to insert** — automatic on daily-note creation, a `{{bible-verse}}`
  placeholder in your daily-note template, or manual commands.
- **Re-roll** — don't like today's verse? Re-roll it; the new verse stays fixed for the
  rest of the day. In an open daily note, re-roll works on *that* note's date.
- **Verse at a glance** — the ribbon icon (📖) or the command *Show today's verse* opens
  the verse in a small window with *Re-roll*, *Copy* and *Insert into daily note*.

## Installation

Until the plugin is listed in the community directory:

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Create the folder `<vault>/.obsidian/plugins/daily-bible-verse/` and place the three
   files inside.
3. Reload Obsidian and enable **Daily Bible Verse** under *Community plugins*.

Or install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) with the repository
`polygonhunter/daily-bible-verse`.

## Usage

### Automatic (default)

With the core **Daily Notes** (or **Periodic Notes**) plugin enabled, every newly
created daily note automatically receives the verse callout. The insert position is
configurable (top / after frontmatter / bottom).

Automatic insertion only touches a note when

- it was created moments ago,
- it lies in your daily-notes folder (with the vault root as folder: not nested deeper
  than the date format), and
- its date is within ±7 days of today.

So a file like `Meetings/2026-10-06.md` and old daily notes that sync onto a new device
are left alone. Use the commands for anything else.

### Template placeholder

Put `{{bible-verse}}` anywhere in your daily-note template — the plugin replaces it
when the note is created. This also works with Templater templates: for one minute after
creation the plugin watches the new note and re-inserts the verse if a template run
replaced the content — even when a Templater prompt stays open for a while.

### Commands

| Command ID (for hotkeys & integrations) | What it does |
| --- | --- |
| `daily-bible-verse:show-todays-verse` | Show today's verse in a window (Re-roll, Copy, Insert) |
| `daily-bible-verse:insert-todays-verse` | Insert today's verse at the cursor (in a daily note: the note's verse) |
| `daily-bible-verse:insert-verse-into-daily-note` | Open (or create) today's daily note and insert the verse |
| `daily-bible-verse:reroll-todays-verse` | Pick a different verse (frozen for the day) — for the active daily note's date, otherwise for today's daily note |
| `daily-bible-verse:replace-bible-verse-placeholders` | Replace `{{bible-verse}}` in the active note |
| `daily-bible-verse:download-translation` | Download the current translation for whole-Bible mode |

These IDs are a stable public contract since 1.0.0 — external tools (e.g. slash-menu
plugins) can safely call them via `app.commands.executeCommandById(...)`. Commands only
show up where they apply (e.g. the placeholder command only in notes with a placeholder).

### API (Templater, other plugins)

```js
const api = app.plugins.plugins["daily-bible-verse"]?.api;
const v = await api.getVerse();            // today; or api.getVerse(new Date(2026, 9, 6))
// v = { reference, text, translation, markdown, refKey }
```

Templater example: `<% (await app.plugins.plugins["daily-bible-verse"].api.getVerse()).markdown %>`

### Reference property

Under *More options* you can name a frontmatter property (e.g. `bible-verse`). After the
plugin inserts a verse it writes the reference there — handy for Dataview or Bases.

## How the daily pick works

The verse pool is shuffled once with a seed (Fisher-Yates) and then consumed day by
day like a deck of cards — every verse appears **exactly once per cycle**. When the
deck is exhausted, it is reshuffled with a new seed derived from the cycle number, so
the next pass has a completely different order. Everything is derived from the date and
a per-vault seed: no history is stored, nothing can be corrupted by sync, and all
devices agree on the verse of the day.

Re-rolls are stored per date and freeze the chosen verse for that day (old entries are
pruned after 60 days). A re-roll picks the verse of a *past* day, never one scheduled for
the next 30 days, so it does not show up again shortly afterwards.

## Whole-Bible mode

Curated mode works out of the box. For **whole Bible** or **specific books** the plugin
downloads the selected translation once (~4–5 MB) into the plugin folder and then works
fully offline. Until the download exists, the plugin transparently falls back to the
curated pool (with a notice). Downloads can be deleted again in the settings.

The download lives in the plugin folder and is usually not synced. The settings show the
status *of this device*; on a second device simply download it there as well.

## Translations & licensing

| Translation | Language | Status |
| --- | --- | --- |
| Luther 1912 | German | Public domain |
| Elberfelder 1905 | German | Public domain |
| King James Version | English | Public domain¹ |
| Darby Translation (1890) | English | Public domain |
| Reina-Valera Antigua (1909) | Spanish | Public domain |
| Louis Segond 1910 | French | Public domain |
| Diodati 1649 | Italian | Public domain |

¹ Crown patent restrictions apply within the United Kingdom.

Verse data is sourced from the
[Beblia Holy-Bible-XML-Format](https://github.com/Beblia/Holy-Bible-XML-Format)
repository at build time (`npm run fetch-data`). Modern copyrighted translations
(Luther 2017, Schlachter 1951/2000, Hoffnung für alle, NIV, ESV, …) are deliberately
**not** included — they must not be redistributed without a license.

The plugin code is MIT-licensed.

## Compatibility notes

- **Daily Notes / Periodic Notes**: automatic insertion uses the folder and date format
  from your Daily Notes settings (via `obsidian-daily-notes-interface`).
- **Templater**: supported — see the placeholder section above.
- **Mobile**: fully supported (`isDesktopOnly: false`, no Node APIs).
- Without the Daily Notes plugin, automatic insertion stays dormant (a warning appears
  in the settings); all manual commands keep working.

## Manual test checklist

For testing in a real vault (this repo's CI covers unit tests and the build):

1. Fresh vault → enable plugin → create today's daily note → callout appears once.
2. Re-open / re-create the note → still exactly one callout (idempotency).
3. Add `{{bible-verse}}` to the daily-note template → placeholder is replaced at the
   configured spot.
4. With Templater enabled and a template that overwrites the note (also with a prompt
   that stays open > 5 s) → still exactly one callout.
5. Toggle themes in the settings → pool counter updates; verse changes on the next day.
6. Command "Re-roll today's verse" → callout in the open note is replaced; re-running
   "Insert today's verse" yields the same re-rolled verse.
7. Whole-Bible mode without download → notice + curated fallback; after "Download now"
   → verses from the whole Bible.
8. Switch language → book names, notation and verse text follow.
9. Mobile app: repeat steps 1 and 7.
10. Create yesterday's daily note via the calendar → it gets *yesterday's* verse.
11. Create `Other/2026-10-06.md` outside the daily-notes folder → no callout.
12. Open yesterday's daily note → "Re-roll" changes *yesterday's* verse only; Ctrl/Cmd+Z
    undoes it.
13. Ribbon icon → window shows today's verse; Copy, Re-roll and Insert work.

## Development

```bash
npm install
npm test           # vitest unit tests
npm run build      # type-check + production bundle (main.js)
npm run dev        # esbuild watch mode
npm run fetch-data # regenerate data/generated/ from the source Bibles (needs curl)
npm run validate-refs  # structural checks + pool statistics for the curated list
```

Architecture: everything under `src/core/` is pure TypeScript (no Obsidian imports,
enforced by a test) and unit-tested; the files in `src/` are thin Obsidian glue.
Curated verse *references* live in `data/curated-refs.json`; the verse *texts* are
generated into `data/generated/` at build time and committed.
