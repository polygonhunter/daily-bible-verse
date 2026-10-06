# Changelog

## Unreleased

### Fixed
- Re-roll no longer pulls in the verse of one of the coming days (it used to be exactly
  tomorrow's verse, which then appeared twice). The fallback walk for unresolvable verses
  now goes backwards as well.
- Re-roll, "Insert at cursor" and the placeholder command use the date of the active
  daily note; re-roll no longer overwrites the verse of an older note with today's
  re-roll. In the open editor the replacement can be undone.
- Automatic insertion only applies to notes in the daily-notes folder whose date is
  within ±7 days of today (no more verses in `Meetings/2026-10-06.md` or in old notes
  synced onto a new device).
- The auto-insert watcher cleans up its timers and listeners, logs errors instead of
  leaving unhandled rejections, and also handles a daily note created during startup.
- The download status in the settings reflects the file on *this* device (data.json is
  synced, the downloaded file usually is not). Downloads are written atomically.
- Invalid callout types (spaces, brackets) are rejected instead of breaking the callout.

### Performance
- data.json is only written when something changed; external changes (sync) are picked
  up via `onExternalSettingsChange`.
- Text fields in the settings save debounced instead of on every keystroke.
- Downloaded translations: one shared load for parallel lookups, no Map copy, released
  from memory after 2 minutes of inactivity; no re-read after a download.
- Pool counter in the settings no longer loads the whole translation.
- Download parse about 5× faster (sanitizer fast path).
- Bundled translations are embedded as JSON strings and parsed lazily — only the
  translation in use.

### Changed
- Settings: translation row only when there is a choice; callout type, link template,
  reference property and resets moved into a collapsed *More options* section; resets
  need a confirming second click.
- Commands only appear where they apply. Command IDs are unchanged.
- Callout colour per light/dark theme for WCAG AA contrast.

### Added
- *Show today's verse*: command `show-todays-verse` and a ribbon icon open the verse in a
  window with Re-roll, Copy and Insert into daily note.
- *Complete sentences* (whole-Bible / books mode, on by default): a verse that ends
  mid-sentence is continued with the following verses of the same chapter (max. 4).
  Display only — the daily order is unchanged.
- Public API `app.plugins.plugins["daily-bible-verse"].api.getVerse(date?)`.
- Optional *Reference property*: writes the verse reference into the note's frontmatter.
- Book presets: Wisdom books, Prophets, Letters of Paul.
