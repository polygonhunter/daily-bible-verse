# Daily Bible Verse

An [Obsidian](https://obsidian.md) plugin that inserts a **daily Bible verse** into your
daily note as a nicely formatted callout — with a 📖 emoji, the correctly localized verse
reference and an attribution line:

```markdown
> [!bible] 📖 Johannes 3,16
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
- **Public-domain translations** — Luther 1912, Elberfelder 1905, KJV, ASV,
  Reina-Valera Antigua (1909), Louis Segond 1910, Diodati 1885.
- **Randomness with a system** — a seeded shuffled-deck algorithm guarantees no repeats
  until the whole pool has been used once, then reshuffles: no short-interval repeats,
  no yearly rotation, and fully deterministic (the same day always gets the same verse,
  on every device).
- **Configurable pool** — curated selection (filterable by themes: encouragement,
  comfort, hope, love, wisdom, gratitude, faith, peace — with a live verse counter),
  the **whole Bible** (~31,000 verses, one-time ~5 MB download per translation), or
  book presets (Psalms, New Testament, Gospels, …).
- **Three ways to insert** — automatic on daily-note creation, a `{{bible-verse}}`
  placeholder in your daily-note template, or manual commands.
- **Re-roll** — don't like today's verse? Re-roll it; the new verse stays fixed for the
  rest of the day.

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

### Template placeholder

Put `{{bible-verse}}` anywhere in your daily-note template — the plugin replaces it
when the note is created. This also works with Templater templates (the plugin retries
for a few seconds so it wins the race against template rendering).

### Commands

| Command ID (for hotkeys & integrations) | What it does |
| --- | --- |
| `daily-bible-verse:insert-todays-verse` | Insert today's verse at the cursor |
| `daily-bible-verse:insert-verse-into-daily-note` | Open (or create) today's daily note and insert the verse |
| `daily-bible-verse:reroll-todays-verse` | Pick a different verse for today (frozen for the day) |
| `daily-bible-verse:replace-bible-verse-placeholders` | Replace `{{bible-verse}}` in the active note |
| `daily-bible-verse:download-translation` | Download the current translation for whole-Bible mode |

These IDs are a stable public contract since 1.0.0 — external tools (e.g. slash-menu
plugins) can safely call them via `app.commands.executeCommandById(...)`.

## How the daily pick works

The verse pool is shuffled once with a seed (Fisher-Yates) and then consumed day by
day like a deck of cards — every verse appears **exactly once per cycle**. When the
deck is exhausted, it is reshuffled with a new seed derived from the cycle number, so
the next pass has a completely different order. Everything is derived from the date and
a per-vault seed: no history is stored, nothing can be corrupted by sync, and all
devices agree on the verse of the day.

Re-rolls are stored per date and freeze the chosen verse for that day (old entries are
pruned after 60 days).

## Whole-Bible mode

Curated mode works out of the box. For **whole Bible** or **specific books** the plugin
downloads the selected translation once (~4–5 MB) into the plugin folder and then works
fully offline. Until the download exists, the plugin transparently falls back to the
curated pool (with a notice). Downloads can be deleted again in the settings.

## Translations & licensing

| Translation | Language | Status |
| --- | --- | --- |
| Luther 1912 | German | Public domain |
| Elberfelder 1905 | German | Public domain |
| King James Version | English | Public domain¹ |
| American Standard Version (1901) | English | Public domain |
| Reina-Valera Antigua (1909) | Spanish | Public domain |
| Louis Segond 1910 | French | Public domain |
| Diodati (riveduta 1885) | Italian | Public domain |

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
4. With Templater enabled and a template that overwrites the note → still exactly one
   callout after ~4 seconds.
5. Toggle themes in the settings → pool counter updates; verse changes on the next day.
6. Command "Re-roll today's verse" → callout in the open note is replaced; re-running
   "Insert today's verse" yields the same re-rolled verse.
7. Whole-Bible mode without download → notice + curated fallback; after "Download now"
   → verses from the whole Bible.
8. Switch language → book names, notation and verse text follow.
9. Mobile app: repeat steps 1 and 7.
10. Create yesterday's daily note via the calendar → it gets *yesterday's* verse.

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
