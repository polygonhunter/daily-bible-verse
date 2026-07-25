import {
  App,
  Notice,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
} from "obsidian";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import { CURATED } from "./core/curated";
import { BOOK_PRESETS } from "./core/pool";
import { ALL_THEMES, type LanguageCode } from "./core/types";
import {
  DEFAULT_TRANSLATION,
  translationById,
  translationsForLanguage,
  TRANSLATIONS,
} from "./core/translations";
import { deleteDownloadedTranslation, downloadTranslation } from "./downloader";
import type DailyBibleVersePlugin from "./main";
import themesJson from "../data/themes.json";

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
  fr: "Français",
  it: "Italiano",
};

const LANGUAGE_CODES = Object.keys(LANGUAGE_NAMES) as LanguageCode[];

const THEME_LABELS = themesJson as Record<string, Record<string, string>>;

const EMOJI_PRESETS = ["📖", "✝️", "🕊️", "🙏"];

/** Keys whose change affects the visibility or content of other rows. */
const RERENDER_KEYS = new Set([
  "language",
  "translationId",
  "poolMode",
  "bookPreset",
  "emojiMode",
  "autoInsertOnDailyNote",
]);

/** Fully declarative settings tab (Obsidian 1.13+): definitions drive both
 * rendering and the app-wide settings search. */
export class DailyBibleVerseSettingTab extends PluginSettingTab {
  /** Keeps the custom-emoji field visible while its value still matches a
   * preset (right after the user picks "Custom…"). */
  private forceCustomEmoji = false;

  constructor(
    app: App,
    private readonly plugin: DailyBibleVersePlugin,
  ) {
    super(app, plugin);
    this.icon = "book-open";
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const s = this.plugin.settings;
    const curatedCount = CURATED.verses.length;

    return [
      {
        name: "Daily Notes status",
        searchable: false,
        visible: () => s.autoInsertOnDailyNote && !this.dailyNotesAvailable(),
        render: (setting) => {
          setting.settingEl.addClass("daily-bible-verse-warning");
          setting.setDesc(
            "⚠ The Daily Notes (or Periodic Notes) plugin is not enabled — automatic insertion is inactive. Manual commands still work.",
          );
        },
      },
      {
        type: "group",
        heading: "Content",
        items: [
          {
            name: "Language",
            desc: "Language of the verse text and the reference.",
            control: { type: "dropdown", key: "language", options: LANGUAGE_NAMES },
          },
          ...LANGUAGE_CODES.map((lang) => ({
            name: "Translation",
            desc: "All bundled translations are public domain.",
            aliases: ["bible version"],
            visible: () => this.plugin.settings.language === lang,
            control: {
              type: "dropdown" as const,
              key: "translationId",
              options: Object.fromEntries(
                translationsForLanguage(lang).map((t) => [t.id, t.displayName]),
              ),
            },
          })),
          {
            name: "Verse pool",
            desc: "Where your daily verse is drawn from. Each verse appears once before any repeats.",
            aliases: ["random", "themes", "whole bible"],
            control: {
              type: "dropdown",
              key: "poolMode",
              options: {
                curated: `Curated selection — ${curatedCount} encouraging verses`,
                "whole-bible": "Whole Bible — ~31,000 verses (one-time download)",
                books: "Specific books — e.g. Psalms or New Testament (one-time download)",
              },
            },
          },
          {
            name: "Themes",
            desc: `Optional filter: pick themes to draw only those verses. With nothing selected, all ${curatedCount} curated verses are used.`,
            visible: () => this.plugin.settings.poolMode === "curated",
          },
          ...ALL_THEMES.map((theme) => ({
            name: THEME_LABELS[theme]?.en ?? theme,
            aliases: Object.values(THEME_LABELS[theme] ?? {}),
            visible: () => this.plugin.settings.poolMode === "curated",
            control: { type: "toggle" as const, key: `theme:${theme}` },
          })),
          {
            name: "Books",
            desc: "Draw verses only from this part of the Bible.",
            visible: () => this.plugin.settings.poolMode === "books",
            control: {
              type: "dropdown",
              key: "bookPreset",
              options: Object.fromEntries(
                Object.entries(BOOK_PRESETS).map(([key, preset]) => [key, preset.label]),
              ),
            },
          },
          {
            name: "Offline data",
            desc: "One-time translation download for whole-Bible mode.",
            aliases: ["download"],
            visible: () => this.plugin.settings.poolMode !== "curated",
            render: (setting) => this.renderOfflineRow(setting),
          },
          {
            name: "Your current pool",
            searchable: false,
            render: (setting) => {
              void this.refreshPoolCountInto(setting.descEl);
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Insertion",
        items: [
          {
            name: "Insert automatically into new daily notes",
            desc: "When a daily note is created, the verse callout is added automatically. Alternatively place {{bible-verse}} in your daily note template to control the position.",
            aliases: ["auto insert", "placeholder"],
            control: { type: "toggle", key: "autoInsertOnDailyNote" },
          },
          {
            name: "Position",
            desc: "Where the callout is inserted when no {{bible-verse}} placeholder exists.",
            control: {
              type: "dropdown",
              key: "insertPosition",
              options: {
                "after-frontmatter": "Top (after frontmatter)",
                top: "Very top",
                bottom: "Bottom",
              },
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Appearance",
        items: [
          {
            name: "Emoji",
            desc: "Symbol shown in front of the verse reference in the callout title.",
            aliases: ["icon"],
            control: {
              type: "dropdown",
              key: "emojiMode",
              options: {
                ...Object.fromEntries(EMOJI_PRESETS.map((p) => [p, p])),
                custom: "Custom…",
                none: "No emoji",
              },
            },
          },
          {
            name: "Custom emoji",
            desc: "Paste any emoji (or short text), e.g. 🌅 or ✨.",
            visible: () => this.emojiMode() === "custom",
            control: { type: "text", key: "emoji", placeholder: "e.g. 🌅" },
          },
          {
            name: "Header text",
            desc: 'Optional title before the reference, e.g. "Verse of the day".',
            control: { type: "text", key: "headerText", placeholder: "Verse of the day" },
          },
          {
            name: "Callout type",
            desc: 'The [!type] used in the callout. "bible" gets the plugin\'s book styling.',
            control: { type: "text", key: "calloutType" },
          },
          {
            name: "Show translation name",
            desc: "Adds an attribution line like “— Luther 1912” to the callout.",
            control: { type: "toggle", key: "showTranslationName" },
          },
          {
            name: "Verse link template",
            desc: "Optional. Makes the reference a link. Placeholders: {bookEn} {bookLocal} {chapter} {verse} {ref}. Example: https://www.bibleserver.com/LUT/{bookEn}{chapter}",
            aliases: ["bibleserver", "url"],
            control: { type: "text", key: "verseLinkTemplate", placeholder: "https://…" },
          },
        ],
      },
      {
        type: "group",
        heading: "Advanced",
        items: [
          {
            name: "Reset shuffle seed",
            desc: "Generates a new random order for the daily verses. The current and future verses change; past notes keep their text.",
            action: () => {
              this.plugin.settings.baseSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
              this.plugin.invalidatePoolCache();
              void this.plugin.savePluginData();
              new Notice("Daily Bible Verse: shuffle seed reset.");
              this.update();
            },
          },
          {
            name: "Clear re-roll overrides",
            desc: "Forgets manual re-rolls; affected days return to their deck verse.",
            action: () => {
              this.plugin.overrides = {};
              void this.plugin.savePluginData();
              new Notice("Daily Bible Verse: overrides cleared.");
            },
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    const s = this.plugin.settings;
    if (key.startsWith("theme:")) return s.selectedThemes.includes(key.slice(6));
    if (key === "emojiMode") return this.emojiMode();
    return (s as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.plugin.settings;
    if (key.startsWith("theme:")) {
      const theme = key.slice(6);
      s.selectedThemes = value
        ? [...new Set([...s.selectedThemes, theme])]
        : s.selectedThemes.filter((t) => t !== theme);
      this.plugin.invalidatePoolCache();
    } else if (key === "emojiMode") {
      const mode = String(value);
      if (mode === "none") {
        s.emoji = "";
        this.forceCustomEmoji = false;
      } else if (mode === "custom") {
        this.forceCustomEmoji = true;
      } else {
        s.emoji = mode;
        this.forceCustomEmoji = false;
      }
    } else if (key === "language") {
      s.language = value as LanguageCode;
      s.translationId = DEFAULT_TRANSLATION[s.language];
      this.plugin.invalidatePoolCache();
      this.plugin.evictUnusedDownloadedProviders();
    } else if (key === "translationId") {
      s.translationId = String(value);
      this.plugin.invalidatePoolCache();
      this.plugin.evictUnusedDownloadedProviders();
    } else if (key === "calloutType") {
      s.calloutType = String(value).trim() || "bible";
    } else if (key === "emoji" || key === "headerText" || key === "verseLinkTemplate") {
      s[key] = String(value).trim();
    } else if (key === "poolMode" || key === "bookPreset") {
      (s as unknown as Record<string, unknown>)[key] = value;
      this.plugin.invalidatePoolCache();
    } else {
      (s as unknown as Record<string, unknown>)[key] = value;
    }
    await this.plugin.savePluginData();
    if (RERENDER_KEYS.has(key) || key.startsWith("theme:")) this.update();
  }

  // ---- dynamic rows ------------------------------------------------------

  private emojiMode(): string {
    const emoji = this.plugin.settings.emoji;
    if (this.forceCustomEmoji) return "custom";
    if (emoji === "") return "none";
    return EMOJI_PRESETS.includes(emoji) ? emoji : "custom";
  }

  private renderOfflineRow(setting: Setting): void {
    const s = this.plugin.settings;
    const meta = translationById(s.translationId) ?? TRANSLATIONS[0];
    const downloaded = this.plugin.downloadedTranslations[s.translationId];
    setting.setDesc(
      downloaded
        ? `${meta.displayName}: downloaded (${downloaded.verseCount.toLocaleString()} verses, ${(downloaded.sizeBytes / 1024 / 1024).toFixed(1)} MB).`
        : `${meta.displayName}: not downloaded yet. Whole-Bible mode needs a one-time download (~4-5 MB); until then the curated pool is used.`,
    );
    if (downloaded) {
      setting.addButton((b) =>
        b.setButtonText("Delete").onClick(async () => {
          await deleteDownloadedTranslation(this.app, this.plugin.manifestDir(), s.translationId);
          delete this.plugin.downloadedTranslations[s.translationId];
          this.plugin.resetDownloadedProvider(s.translationId);
          await this.plugin.savePluginData();
          this.update();
        }),
      );
    } else {
      setting.addButton((b) =>
        b
          .setButtonText("Download now")
          .setCta()
          .onClick(async () => {
            b.setButtonText("Downloading…").setDisabled(true);
            try {
              const result = await downloadTranslation(this.app, this.plugin.manifestDir(), meta);
              this.plugin.downloadedTranslations[meta.id] = {
                downloadedAt: new Date().toISOString(),
                verseCount: result.verseCount,
                sizeBytes: result.sizeBytes,
              };
              this.plugin.resetDownloadedProvider(meta.id);
              await this.plugin.savePluginData();
            } catch (e) {
              console.error("Daily Bible Verse: download failed", e);
              new Notice("Daily Bible Verse: download failed — check your internet connection.");
            }
            this.update();
          }),
      );
    }
  }

  private async refreshPoolCountInto(el: HTMLElement): Promise<void> {
    const info = await this.plugin.getPoolInfo();
    const years = info.keys.length / 365;
    const cycle =
      years >= 2
        ? `≈ ${Math.round(years)} years`
        : years >= 1
          ? `≈ ${years.toFixed(1)} years`
          : `≈ ${Math.max(1, Math.round(info.keys.length / 30.4))} months`;
    let text = `${info.keys.length.toLocaleString()} verses — repeat-free for ${cycle}.`;
    if (info.usedFallback && this.plugin.settings.poolMode !== "curated") {
      text += " (Falling back to the curated pool until the translation is downloaded.)";
    }
    if (info.keys.length < 30) {
      text += " ⚠ Very small pool — consider selecting more themes.";
    }
    el.setText(text);
  }

  private dailyNotesAvailable(): boolean {
    try {
      return appHasDailyNotesPluginLoaded();
    } catch {
      return false;
    }
  }
}
