import { App, debounce, Notice, PluginSettingTab, Setting, type ButtonComponent } from "obsidian";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import { CURATED } from "./core/curated";
import { newSeed } from "./core/hash";
import { normalizeCalloutType } from "./core/renderer";
import { BOOK_PRESETS } from "./core/pool";
import { ALL_THEMES, type LanguageCode } from "./core/types";
import { DEFAULT_TRANSLATION, translationById, translationsForLanguage } from "./core/translations";
import { deleteDownloadedTranslation } from "./downloader";
import type DailyBibleVersePlugin from "./main";
import themesJson from "../data/themes.json";

// NOTE: This tab deliberately uses the classic imperative display() API.
// The declarative settings API (getSettingDefinitions) exists since Obsidian
// 1.13, which is still insider-only — requiring it would hide plugin updates
// from every public-release user. Revisit once 1.13 ships publicly.

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
  fr: "Français",
  it: "Italiano",
};

const THEME_LABELS = themesJson as Record<string, Record<string, string>>;

const EMOJI_PRESETS = ["📖", "✝️", "🕊️", "🙏"];

export class DailyBibleVerseSettingTab extends PluginSettingTab {
  private poolCountEl: HTMLElement | null = null;
  /** Generation token: only the latest refreshPoolCount() may write. */
  private poolCountSeq = 0;
  /** Keeps the custom-emoji field visible while its value still matches a
   * preset (right after the user picks "Custom…"). */
  private forceCustomEmoji = false;
  /** Whether the "More options" section is expanded (survives re-renders). */
  private moreOpen = false;
  /** Text fields save debounced instead of on every keystroke (each save
   * rewrites data.json and triggers a sync). */
  private pendingSave = false;
  private readonly debouncedSave = debounce(
    () => {
      this.pendingSave = false;
      void this.plugin.savePluginData();
    },
    400,
    true,
  );

  constructor(
    app: App,
    private readonly plugin: DailyBibleVersePlugin,
  ) {
    super(app, plugin);
  }

  private queueSave(): void {
    this.pendingSave = true;
    this.debouncedSave();
  }

  hide(): void {
    this.debouncedSave.cancel();
    if (this.pendingSave) {
      this.pendingSave = false;
      void this.plugin.savePluginData();
    }
    this.poolCountEl = null;
    super.hide();
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
          this.plugin.evictUnusedDownloadedProviders();
          await this.plugin.savePluginData();
          this.display();
        });
      });

    // Only a real choice deserves a row (es/fr/it ship one translation).
    if (translationsForLanguage(s.language).length > 1) {
      new Setting(containerEl)
        .setName("Translation")
        .setDesc("All bundled translations are public domain.")
        .addDropdown((dd) => {
          for (const t of translationsForLanguage(s.language)) dd.addOption(t.id, t.displayName);
          dd.setValue(s.translationId).onChange(async (value) => {
            s.translationId = value;
            this.plugin.invalidatePoolCache();
            this.plugin.evictUnusedDownloadedProviders();
            await this.plugin.savePluginData();
            this.display();
          });
        });
    }

    new Setting(containerEl)
      .setName("Verse pool")
      .setDesc("Where your daily verse is drawn from. Each verse appears once before any repeats.")
      .addDropdown((dd) => {
        dd.addOption("curated", `Curated selection — ${CURATED.verses.length} encouraging verses`);
        dd.addOption("whole-bible", "Whole Bible — ~31,000 verses (one-time download)");
        dd.addOption("books", "Specific books — e.g. Psalms or New Testament (one-time download)");
        dd.setValue(s.poolMode).onChange(async (value) => {
          s.poolMode = value as typeof s.poolMode;
          this.plugin.invalidatePoolCache();
          this.plugin.evictUnusedDownloadedProviders();
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
    if (s.poolMode !== "curated") {
      this.renderDownloadSection(containerEl);
      new Setting(containerEl)
        .setName("Complete sentences")
        .setDesc(
          "When a verse ends mid-sentence, continue with the following verses of the same chapter (up to 4).",
        )
        .addToggle((t) =>
          t.setValue(s.completeSentences).onChange(async (value) => {
            s.completeSentences = value;
            await this.plugin.savePluginData();
          }),
        );
    }

    const poolInfo = new Setting(containerEl).setName("Your current pool");
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

    const emojiMode = this.emojiMode();
    new Setting(containerEl)
      .setName("Emoji")
      .setDesc("Symbol shown in front of the verse reference in the callout title.")
      .addDropdown((dd) => {
        for (const p of EMOJI_PRESETS) dd.addOption(p, p);
        dd.addOption("custom", "Custom…");
        dd.addOption("none", "No emoji");
        dd.setValue(emojiMode).onChange(async (value) => {
          if (value === "none") {
            s.emoji = "";
            this.forceCustomEmoji = false;
          } else if (value === "custom") {
            this.forceCustomEmoji = true;
          } else {
            s.emoji = value;
            this.forceCustomEmoji = false;
          }
          await this.plugin.savePluginData();
          this.display();
        });
      });
    if (emojiMode === "custom") {
      new Setting(containerEl)
        .setName("Custom emoji")
        .setDesc("Paste any emoji (or short text), e.g. 🌅 or ✨.")
        .addText((t) =>
          t.setValue(s.emoji).onChange((value) => {
            s.emoji = value.trim();
            this.queueSave();
          }),
        );
    }

    new Setting(containerEl)
      .setName("Header text")
      .setDesc('Optional title before the reference, e.g. "Verse of the day".')
      .addText((t) =>
        t
          .setPlaceholder("Verse of the day")
          .setValue(s.headerText)
          .onChange((value) => {
            s.headerText = value.trim();
            this.queueSave();
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

    // ---- More options (progressive disclosure) --------------------------

    const details = containerEl.createEl("details", { cls: "daily-bible-verse-more" });
    details.open = this.moreOpen;
    details.addEventListener("toggle", () => {
      this.moreOpen = details.open;
    });
    details.createEl("summary", { text: "More options" });
    this.renderMoreOptions(details);
  }

  private renderMoreOptions(containerEl: HTMLElement): void {
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("Callout type")
      .setDesc('The [!type] used in the callout (letters, digits, dashes). Empty or "bible" gets the plugin\'s book styling.')
      .addText((t) =>
        t
          .setPlaceholder("bible")
          .setValue(s.calloutType)
          .onChange((value) => {
            const type = normalizeCalloutType(value);
            t.inputEl.toggleClass("daily-bible-verse-invalid", type === null);
            if (type === null) return; // keep the last valid value
            s.calloutType = type;
            this.queueSave();
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
          .onChange((value) => {
            s.verseLinkTemplate = value.trim();
            this.queueSave();
          }),
      );

    new Setting(containerEl)
      .setName("Reference property")
      .setDesc(
        'Optional. Frontmatter property that receives the verse reference after inserting, e.g. "bible-verse" — handy for Dataview or Bases.',
      )
      .addText((t) =>
        t
          .setPlaceholder("bible-verse")
          .setValue(s.referenceProperty)
          .onChange((value) => {
            s.referenceProperty = value.trim();
            this.queueSave();
          }),
      );

    new Setting(containerEl).setName("Reset").setHeading();

    new Setting(containerEl)
      .setName("Reset shuffle seed")
      .setDesc(
        "Generates a new random order for the daily verses. The current and future verses change; past notes keep their text.",
      )
      .addButton((b) =>
        this.confirmButton(b, "Reset", async () => {
          // No pool rebuild needed: the deck cache is keyed by seed.
          this.plugin.settings.baseSeed = newSeed();
          await this.plugin.savePluginData();
          new Notice("Daily Bible Verse: shuffle seed reset.");
        }),
      );

    new Setting(containerEl)
      .setName("Clear re-roll overrides")
      .setDesc("Forgets manual re-rolls; affected days return to their deck verse.")
      .addButton((b) =>
        this.confirmButton(b, "Clear", async () => {
          this.plugin.overrides = {};
          await this.plugin.savePluginData();
          new Notice("Daily Bible Verse: overrides cleared.");
        }),
      );
  }

  /** Destructive button: first click arms it ("Click again to confirm"),
   * a second click within 3 s runs the action. */
  private confirmButton(b: ButtonComponent, label: string, action: () => Promise<void>): void {
    let armedUntil = 0;
    let timer = 0;
    b.setButtonText(label)
      .setWarning()
      .onClick(async () => {
        if (Date.now() > armedUntil) {
          armedUntil = Date.now() + 3000;
          b.setButtonText("Click again to confirm");
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            if (b.buttonEl.isConnected) b.setButtonText(label);
          }, 3000);
          return;
        }
        armedUntil = 0;
        window.clearTimeout(timer);
        b.setButtonText(label);
        await action();
      });
  }

  // ---- sections --------------------------------------------------------

  private emojiMode(): string {
    const emoji = this.plugin.settings.emoji;
    if (this.forceCustomEmoji) return "custom";
    if (emoji === "") return "none";
    return EMOJI_PRESETS.includes(emoji) ? emoji : "custom";
  }

  private renderThemeSection(containerEl: HTMLElement): void {
    const s = this.plugin.settings;
    new Setting(containerEl)
      .setName("Themes")
      .setDesc(
        `Optional filter: pick themes to draw only those verses. With nothing selected, all ${CURATED.verses.length} curated verses are used. The pool counter below updates live.`,
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
    const id = s.translationId;
    const meta = translationById(id);
    const name = meta?.displayName ?? id;
    const setting = new Setting(containerEl).setName("Offline data").setDesc(`${name}: checking…`);

    // The status comes from the FILE, not from data.json: data.json syncs
    // between devices, the downloaded file (in the plugin folder) usually
    // does not. A stale meta entry is ignored, never deleted (deleting it
    // would sync back and forth between devices).
    void this.plugin
      .getDownloadedProvider(id)
      .isAvailable()
      .catch(() => false)
      .then((available) => {
        if (!setting.settingEl.isConnected || this.plugin.settings.translationId !== id) return;
        const downloaded = this.plugin.downloadedTranslations[id];
        if (available) {
          setting.setDesc(
            downloaded
              ? `${name}: downloaded (${downloaded.verseCount.toLocaleString()} verses, ${(downloaded.sizeBytes / 1024 / 1024).toFixed(1)} MB).`
              : `${name}: downloaded.`,
          );
          setting.addButton((b) =>
            b.setButtonText("Delete").onClick(async () => {
              await deleteDownloadedTranslation(this.app, this.plugin.manifestDir(), id);
              delete this.plugin.downloadedTranslations[id];
              this.plugin.resetDownloadedProvider(id);
              await this.plugin.savePluginData();
              this.display();
            }),
          );
          return;
        }
        setting.setDesc(
          downloaded
            ? `${name}: downloaded on another device, but not on this one yet. Until then the curated pool is used here.`
            : `${name}: not downloaded yet. Whole-Bible mode needs a one-time download (~4-5 MB); until then the curated pool is used.`,
        );
        setting.addButton((b) =>
          b
            .setButtonText("Download now")
            .setCta()
            .onClick(async () => {
              if (!meta) return;
              b.setDisabled(true);
              try {
                await this.plugin.downloadAndRegister(meta, (phase) =>
                  b.setButtonText(phase === "downloading" ? "Downloading…" : "Processing…"),
                );
              } catch (e) {
                console.error("Daily Bible Verse: download failed", e);
                new Notice("Daily Bible Verse: download failed — check your internet connection.");
              }
              this.display();
            }),
        );
      });
  }

  private async refreshPoolCount(): Promise<void> {
    const el = this.poolCountEl;
    if (!el) return;
    const gen = ++this.poolCountSeq;
    let count: number;
    let usedFallback = false;
    const quick = await this.plugin.quickPoolSize();
    if (quick !== null) {
      count = quick;
    } else {
      const info = await this.plugin.getPoolInfo();
      count = info.keys.length;
      usedFallback = info.usedFallback;
    }
    // A newer refresh started, or the tab was re-rendered/closed meanwhile.
    if (gen !== this.poolCountSeq || !el.isConnected) return;

    const years = count / 365;
    const cycle =
      years >= 2
        ? `≈ ${Math.round(years)} years`
        : years >= 1
          ? `≈ ${years.toFixed(1)} years`
          : `≈ ${Math.max(1, Math.round(count / 30.4))} months`;
    let text = `${count.toLocaleString()} verses — repeat-free for ${cycle}.`;
    if (usedFallback && this.plugin.settings.poolMode !== "curated") {
      text += " (Falling back to the curated pool until the translation is downloaded.)";
    }
    if (count < 30) {
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
