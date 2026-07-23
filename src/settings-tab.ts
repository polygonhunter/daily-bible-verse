import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import { BOOK_PRESETS } from "./core/pool";
import { ALL_THEMES, type LanguageCode } from "./core/types";
import { DEFAULT_TRANSLATION, translationById, translationsForLanguage } from "./core/translations";
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

const THEME_LABELS = themesJson as Record<string, Record<string, string>>;

export class DailyBibleVerseSettingTab extends PluginSettingTab {
  private poolCountEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly plugin: DailyBibleVersePlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    if (s.autoInsertOnDailyNote && !this.dailyNotesAvailable()) {
      const warning = containerEl.createDiv({ cls: "daily-bible-verse-warning" });
      warning.setText(
        "⚠ The Daily Notes (or Periodic Notes) plugin is not enabled — automatic insertion is inactive. Manual commands still work.",
      );
    }

    // ---- Content -------------------------------------------------------

    new Setting(containerEl).setName("Content").setHeading();

    new Setting(containerEl)
      .setName("Language")
      .setDesc("Language of the verse text and the reference.")
      .addDropdown((dd) => {
        for (const [code, label] of Object.entries(LANGUAGE_NAMES)) dd.addOption(code, label);
        dd.setValue(s.language).onChange(async (value) => {
          s.language = value as LanguageCode;
          s.translationId = DEFAULT_TRANSLATION[s.language];
          this.plugin.invalidatePoolCache();
          await this.plugin.savePluginData();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("Translation")
      .setDesc("All bundled translations are public domain.")
      .addDropdown((dd) => {
        for (const t of translationsForLanguage(s.language)) dd.addOption(t.id, t.displayName);
        dd.setValue(s.translationId).onChange(async (value) => {
          s.translationId = value;
          this.plugin.invalidatePoolCache();
          await this.plugin.savePluginData();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("Verse pool")
      .setDesc("Where the daily verse is drawn from.")
      .addDropdown((dd) => {
        dd.addOption("curated", "Curated selection (encouraging verses)");
        dd.addOption("whole-bible", "Whole Bible (requires download)");
        dd.addOption("books", "Specific books (requires download)");
        dd.setValue(s.poolMode).onChange(async (value) => {
          s.poolMode = value as typeof s.poolMode;
          this.plugin.invalidatePoolCache();
          await this.plugin.savePluginData();
          this.display();
        });
      });

    if (s.poolMode === "curated") this.renderThemeSection(containerEl);
    if (s.poolMode === "books") {
      new Setting(containerEl)
        .setName("Books")
        .setDesc("Draw verses only from this part of the Bible.")
        .addDropdown((dd) => {
          for (const [key, preset] of Object.entries(BOOK_PRESETS)) dd.addOption(key, preset.label);
          dd.setValue(s.bookPreset).onChange(async (value) => {
            s.bookPreset = value;
            this.plugin.invalidatePoolCache();
            await this.plugin.savePluginData();
            void this.refreshPoolCount();
          });
        });
    }
    if (s.poolMode !== "curated") this.renderDownloadSection(containerEl);

    const poolInfo = new Setting(containerEl).setName("Verses in pool");
    this.poolCountEl = poolInfo.descEl;
    void this.refreshPoolCount();

    // ---- Insertion -----------------------------------------------------

    new Setting(containerEl).setName("Insertion").setHeading();

    new Setting(containerEl)
      .setName("Insert automatically into new daily notes")
      .setDesc(
        "When a daily note is created, the verse callout is added automatically. Alternatively place {{bible-verse}} in your daily note template to control the position.",
      )
      .addToggle((t) =>
        t.setValue(s.autoInsertOnDailyNote).onChange(async (value) => {
          s.autoInsertOnDailyNote = value;
          await this.plugin.savePluginData();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName("Position")
      .setDesc("Where the callout is inserted when no {{bible-verse}} placeholder exists.")
      .addDropdown((dd) => {
        dd.addOption("after-frontmatter", "Top (after frontmatter)");
        dd.addOption("top", "Very top");
        dd.addOption("bottom", "Bottom");
        dd.setValue(s.insertPosition).onChange(async (value) => {
          s.insertPosition = value as typeof s.insertPosition;
          await this.plugin.savePluginData();
        });
      });

    // ---- Appearance ----------------------------------------------------

    new Setting(containerEl).setName("Appearance").setHeading();

    new Setting(containerEl)
      .setName("Emoji")
      .setDesc("Shown in the callout title. Leave empty for none.")
      .addDropdown((dd) => {
        const presets = ["📖", "✝️", "🕊️", "🙏", ""];
        for (const p of presets) dd.addOption(p, p === "" ? "(none)" : p);
        if (!presets.includes(s.emoji)) dd.addOption(s.emoji, s.emoji);
        dd.setValue(s.emoji).onChange(async (value) => {
          s.emoji = value;
          await this.plugin.savePluginData();
        });
      })
      .addText((t) =>
        t
          .setPlaceholder("Custom…")
          .setValue("")
          .onChange(async (value) => {
            if (value.trim()) {
              s.emoji = value.trim();
              await this.plugin.savePluginData();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Header text")
      .setDesc('Optional title before the reference, e.g. "Verse of the day".')
      .addText((t) =>
        t
          .setPlaceholder("Verse of the day")
          .setValue(s.headerText)
          .onChange(async (value) => {
            s.headerText = value.trim();
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName("Callout type")
      .setDesc('The [!type] used in the callout. "bible" gets the plugin\'s book styling.')
      .addText((t) =>
        t.setValue(s.calloutType).onChange(async (value) => {
          s.calloutType = value.trim() || "bible";
          await this.plugin.savePluginData();
        }),
      );

    new Setting(containerEl)
      .setName("Show translation name")
      .setDesc("Adds an attribution line like “— Luther 1912” to the callout.")
      .addToggle((t) =>
        t.setValue(s.showTranslationName).onChange(async (value) => {
          s.showTranslationName = value;
          await this.plugin.savePluginData();
        }),
      );

    new Setting(containerEl)
      .setName("Verse link template")
      .setDesc(
        "Optional. Makes the reference a link. Placeholders: {bookEn} {bookLocal} {chapter} {verse} {ref}. Example: https://www.bibleserver.com/LUT/{bookEn}{chapter}",
      )
      .addText((t) =>
        t
          .setPlaceholder("https://…")
          .setValue(s.verseLinkTemplate)
          .onChange(async (value) => {
            s.verseLinkTemplate = value.trim();
            await this.plugin.savePluginData();
          }),
      );

    // ---- Advanced ------------------------------------------------------

    new Setting(containerEl).setName("Advanced").setHeading();

    new Setting(containerEl)
      .setName("Reset shuffle seed")
      .setDesc(
        "Generates a new random order for the daily verses. The current and future verses change; past notes keep their text.",
      )
      .addButton((b) =>
        b.setButtonText("Reset").onClick(async () => {
          this.plugin.settings.baseSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
          this.plugin.invalidatePoolCache();
          await this.plugin.savePluginData();
          new Notice("Daily Bible Verse: shuffle seed reset.");
        }),
      );

    new Setting(containerEl)
      .setName("Clear re-roll overrides")
      .setDesc("Forgets manual re-rolls; affected days return to their deck verse.")
      .addButton((b) =>
        b.setButtonText("Clear").onClick(async () => {
          this.plugin.overrides = {};
          await this.plugin.savePluginData();
          new Notice("Daily Bible Verse: overrides cleared.");
        }),
      );
  }

  // ---- sections --------------------------------------------------------

  private renderThemeSection(containerEl: HTMLElement): void {
    const s = this.plugin.settings;
    new Setting(containerEl)
      .setName("Themes")
      .setDesc(
        "Draw only from selected themes. With nothing selected, all curated verses are used. The pool counter below updates live.",
      );
    for (const theme of ALL_THEMES) {
      const label = THEME_LABELS[theme]?.[s.language] ?? THEME_LABELS[theme]?.en ?? theme;
      new Setting(containerEl)
        .setName(label)
        .setClass("daily-bible-verse-theme-toggle")
        .addToggle((t) =>
          t.setValue(s.selectedThemes.includes(theme)).onChange(async (value) => {
            s.selectedThemes = value
              ? [...s.selectedThemes, theme]
              : s.selectedThemes.filter((x) => x !== theme);
            this.plugin.invalidatePoolCache();
            await this.plugin.savePluginData();
            void this.refreshPoolCount();
          }),
        );
    }
  }

  private renderDownloadSection(containerEl: HTMLElement): void {
    const s = this.plugin.settings;
    const meta = translationById(s.translationId);
    const downloaded = this.plugin.downloadedTranslations[s.translationId];
    const setting = new Setting(containerEl)
      .setName("Offline data")
      .setDesc(
        downloaded
          ? `${meta?.displayName ?? s.translationId}: downloaded (${downloaded.verseCount.toLocaleString()} verses, ${(downloaded.sizeBytes / 1024 / 1024).toFixed(1)} MB).`
          : `${meta?.displayName ?? s.translationId}: not downloaded yet. Whole-Bible mode needs a one-time download (~4-5 MB); until then the curated pool is used.`,
      );
    if (downloaded) {
      setting.addButton((b) =>
        b.setButtonText("Delete").onClick(async () => {
          await deleteDownloadedTranslation(this.app, this.plugin.manifestDir(), s.translationId);
          delete this.plugin.downloadedTranslations[s.translationId];
          this.plugin.resetDownloadedProvider(s.translationId);
          await this.plugin.savePluginData();
          this.display();
        }),
      );
    } else {
      setting.addButton((b) =>
        b
          .setButtonText("Download now")
          .setCta()
          .onClick(async () => {
            if (!meta) return;
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
            this.display();
          }),
      );
    }
  }

  private async refreshPoolCount(): Promise<void> {
    if (!this.poolCountEl) return;
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
    this.poolCountEl.setText(text);
  }

  private dailyNotesAvailable(): boolean {
    try {
      return appHasDailyNotesPluginLoaded();
    } catch {
      return false;
    }
  }
}
