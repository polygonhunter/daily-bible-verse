import { Component, MarkdownRenderer, Modal, Notice, Setting, type App } from "obsidian";
import { insertIntoTodaysDailyNote, rerollAndUpdate } from "./actions";
import type DailyBibleVersePlugin from "./main";

/** "Show today's verse": the rendered callout plus the three things one
 * typically wants to do with it. */
export class VerseModal extends Modal {
  /** Owns the rendered markdown's child components; unloaded on close and
   * before each re-render. */
  private component: Component | null = null;
  private renderSeq = 0;

  constructor(
    app: App,
    private readonly plugin: DailyBibleVersePlugin,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Today's verse");
    void this.renderVerse();
  }

  onClose(): void {
    this.renderSeq++;
    this.component?.unload();
    this.component = null;
    this.contentEl.empty();
  }

  private async renderVerse(): Promise<void> {
    const seq = ++this.renderSeq;
    let rendered;
    try {
      rendered = await this.plugin.renderForDate(new Date());
    } catch (e) {
      console.error("Daily Bible Verse: could not render today's verse", e);
      if (seq === this.renderSeq) this.contentEl.setText("Could not load today's verse.");
      return;
    }
    if (seq !== this.renderSeq) return; // closed or re-rendered meanwhile

    this.component?.unload();
    const component = new Component();
    component.load();
    this.component = component;
    const { contentEl } = this;
    contentEl.empty();
    const body = contentEl.createDiv({ cls: "daily-bible-verse-modal-body" });
    await MarkdownRenderer.render(this.app, rendered.markdown, body, "", component);

    const plainText = `${rendered.text}\n— ${rendered.reference} (${rendered.translation})`;
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Re-roll").onClick(async () => {
          b.setDisabled(true);
          await rerollAndUpdate(this.plugin, { file: this.plugin.todaysDailyNote(), date: new Date() });
          await this.renderVerse();
        }),
      )
      .addButton((b) =>
        b.setButtonText("Copy").onClick(async () => {
          try {
            await navigator.clipboard.writeText(plainText);
            new Notice("Daily Bible Verse: copied.");
          } catch {
            new Notice("Daily Bible Verse: could not access the clipboard.");
          }
        }),
      )
      .addButton((b) =>
        b
          .setButtonText("Insert into daily note")
          .setCta()
          .onClick(async () => {
            this.close();
            await insertIntoTodaysDailyNote(this.plugin);
          }),
      );
  }
}
