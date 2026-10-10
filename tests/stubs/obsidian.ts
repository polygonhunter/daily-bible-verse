/** Minimal runtime stand-in for the "obsidian" package (which ships types
 * only), for tests of modules that import runtime values from it. */
export class TAbstractFile {
  path = "";
}

export class TFile extends TAbstractFile {
  extension = "md";
  stat = { ctime: Date.now(), mtime: Date.now(), size: 0 };
  constructor(path: string) {
    super();
    this.path = path;
  }
  get basename(): string {
    return this.path.replace(/^.*\//, "").replace(/\.md$/, "");
  }
}

export class Notice {
  constructor(public message?: string) {}
}

export class MarkdownView {}

export function moment(d?: Date) {
  const date = d ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    format: () => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    toDate: () => date,
  };
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}
