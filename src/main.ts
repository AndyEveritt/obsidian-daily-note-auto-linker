import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  moment,
  normalizePath,
} from "obsidian";
import type { Moment } from "moment";

const DAILY_NOTES_PLUGIN_ID = "daily-notes";
const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";
const DEFAULT_FRONTMATTER_PROPERTY = "workedOn";
const EXCLUDED_NOTES_PLACEHOLDER = "Templates/*\n*/Example.md";
const MODIFY_DEBOUNCE_MS = 1200;
const SUPPRESSION_WINDOW_MS = 2000;

interface DailyNoteWorklogLinkerSettings {
  frontmatterProperty: string;
  autoCreateDailyNote: boolean;
  ignoreDailyNote: boolean;
  excludedNotePatterns: string[];
}

interface DailyNotesPluginInstance {
  options?: {
    format?: string;
    folder?: string;
  };
}

interface DailyNoteReference {
  formattedPath: string;
  configuredPath: string;
  linkText: string;
  file: TFile | null;
}

type MomentFactory = () => Moment;

const DEFAULT_SETTINGS: DailyNoteWorklogLinkerSettings = {
  frontmatterProperty: DEFAULT_FRONTMATTER_PROPERTY,
  autoCreateDailyNote: true,
  ignoreDailyNote: true,
  excludedNotePatterns: [],
};

export default class DailyNoteWorklogLinkerPlugin extends Plugin {
  settings: DailyNoteWorklogLinkerSettings = DEFAULT_SETTINGS;

  private readonly pendingUpdateTimers = new Map<string, number>();
  private readonly suppressedPaths = new Map<string, number>();
  private excludedNoteMatchers: RegExp[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new DailyNoteWorklogLinkerSettingTab(this.app, this));
    this.register(() => this.clearPendingUpdates());

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        void this.onVaultModify(file);
      }),
    );
  }

  async loadSettings(): Promise<void> {
    const loadedData = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loadedData,
    };
    this.normalizeSettings();
  }

  async saveSettings(): Promise<void> {
    this.normalizeSettings();
    await this.saveData(this.settings);
  }

  async updateExcludedNotePatterns(rawValue: string): Promise<void> {
    this.settings.excludedNotePatterns = this.normalizeExcludedNotePatterns(rawValue);
    await this.saveSettings();
  }

  private async onVaultModify(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }

    if (this.isSuppressed(file.path)) {
      return;
    }

    if (this.isExcludedFile(file)) {
      return;
    }

    this.queueFrontmatterUpdate(file);
  }

  private queueFrontmatterUpdate(file: TFile): void {
    const existingTimer = this.pendingUpdateTimers.get(file.path);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    const timerId = window.setTimeout(() => {
      this.pendingUpdateTimers.delete(file.path);
      void this.ensureDailyNoteLink(file.path);
    }, MODIFY_DEBOUNCE_MS);

    this.pendingUpdateTimers.set(file.path, timerId);
  }

  private clearPendingUpdates(): void {
    for (const timerId of this.pendingUpdateTimers.values()) {
      window.clearTimeout(timerId);
    }

    this.pendingUpdateTimers.clear();
  }

  private isSuppressed(path: string): boolean {
    const suppressedUntil = this.suppressedPaths.get(path);
    if (suppressedUntil === undefined) {
      return false;
    }

    if (suppressedUntil <= Date.now()) {
      this.suppressedPaths.delete(path);
      return false;
    }

    return true;
  }

  private async ensureDailyNoteLink(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }

    if (this.isExcludedFile(file)) {
      return;
    }

    const dailyNoteReference = await this.getCurrentDailyNoteReference(file);
    if (!dailyNoteReference.file) {
      return;
    }

    if (this.settings.ignoreDailyNote && this.isCurrentDailyNote(file, dailyNoteReference)) {
      return;
    }

    const propertyName = this.getFrontmatterPropertyName();
    if (this.frontmatterAlreadyTracksDailyNote(file, propertyName, dailyNoteReference)) {
      return;
    }

    this.suppressedPaths.set(file.path, Date.now() + SUPPRESSION_WINDOW_MS);

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const values = this.toFrontmatterList(frontmatter[propertyName]);
        if (values.some((value) => this.isSameDailyNoteValue(value, dailyNoteReference))) {
          return;
        }

        values.push(`[[${dailyNoteReference.linkText}]]`);
        frontmatter[propertyName] = values;
      });
    } catch (error) {
      this.suppressedPaths.delete(file.path);
      console.error("Daily Note Worklog Linker could not update frontmatter", error);
    }
  }

  private frontmatterAlreadyTracksDailyNote(
    file: TFile,
    propertyName: string,
    dailyNoteReference: DailyNoteReference,
  ): boolean {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) {
      return false;
    }

    return this.toFrontmatterList(frontmatter[propertyName]).some((value) =>
      this.isSameDailyNoteValue(value, dailyNoteReference),
    );
  }

  private toFrontmatterList(value: unknown): unknown[] {
    if (value === undefined || value === null) {
      return [];
    }

    return Array.isArray(value) ? [...value] : [value];
  }

  private isSameDailyNoteValue(value: unknown, dailyNoteReference: DailyNoteReference): boolean {
    const normalizedValue = String(value ?? "").trim();
    if (!normalizedValue) {
      return false;
    }

    const equivalentTargets = this.getEquivalentTargets(dailyNoteReference);
    if (equivalentTargets.has(normalizedValue)) {
      return true;
    }

    const wikiLinkMatch = normalizedValue.match(/^\[\[([^|\]]+)(?:\|[^\]]+)?\]\]$/);
    if (!wikiLinkMatch) {
      return false;
    }

    const wikiLinkTarget = wikiLinkMatch[1];
    if (!wikiLinkTarget) {
      return false;
    }

    return equivalentTargets.has(wikiLinkTarget.trim());
  }

  private getEquivalentTargets(dailyNoteReference: DailyNoteReference): Set<string> {
    const targets = new Set<string>();

    targets.add(dailyNoteReference.formattedPath);
    targets.add(dailyNoteReference.configuredPath);
    targets.add(dailyNoteReference.linkText);

    if (dailyNoteReference.file) {
      targets.add(this.stripMarkdownExtension(dailyNoteReference.file.path));
      targets.add(dailyNoteReference.file.basename);
    }

    for (const target of Array.from(targets)) {
      targets.add(`[[${target}]]`);
    }

    return targets;
  }

  private isCurrentDailyNote(file: TFile, dailyNoteReference: DailyNoteReference): boolean {
    if (dailyNoteReference.file) {
      return dailyNoteReference.file.path === file.path;
    }

    return this.stripMarkdownExtension(file.path) === dailyNoteReference.configuredPath;
  }

  private async getCurrentDailyNoteReference(sourceFile: TFile): Promise<DailyNoteReference> {
    const formattedPath = (moment as unknown as MomentFactory)().format(this.getDailyNoteFormat());
    const configuredFolder = this.getDailyNoteFolder();
    const configuredPath = normalizePath(
      configuredFolder ? `${configuredFolder}/${formattedPath}` : formattedPath,
    );
    const dailyNoteFile = this.settings.autoCreateDailyNote
      ? await this.ensureDailyNoteFile(formattedPath, configuredPath)
      : this.resolveDailyNoteFile(formattedPath, configuredPath);

    return {
      formattedPath,
      configuredPath,
      linkText: dailyNoteFile
        ? this.app.metadataCache.fileToLinktext(dailyNoteFile, sourceFile.path, true)
        : configuredPath,
      file: dailyNoteFile,
    };
  }

  private async ensureDailyNoteFile(
    formattedPath: string,
    configuredPath: string,
  ): Promise<TFile | null> {
    const existingFile = this.resolveDailyNoteFile(formattedPath, configuredPath);
    if (existingFile) {
      return existingFile;
    }

    const dailyNotePath = normalizePath(`${configuredPath}.md`);

    try {
      await this.ensureParentFolders(dailyNotePath);
      return await this.app.vault.create(dailyNotePath, "");
    } catch (error) {
      const createdFile = this.resolveDailyNoteFile(formattedPath, configuredPath);
      if (createdFile) {
        return createdFile;
      }

      console.error("Daily Note Worklog Linker could not create the daily note", error);
      return null;
    }
  }

  private resolveDailyNoteFile(formattedPath: string, configuredPath: string): TFile | null {
    const candidatePaths = new Set<string>([
      normalizePath(`${configuredPath}.md`),
      normalizePath(`${formattedPath}.md`),
    ]);

    for (const candidatePath of candidatePaths) {
      const candidateFile = this.app.vault.getAbstractFileByPath(candidatePath);
      if (candidateFile instanceof TFile) {
        return candidateFile;
      }
    }

    if (!formattedPath.includes("/")) {
      const matches = this.app.vault
        .getMarkdownFiles()
        .filter((candidateFile) => candidateFile.basename === formattedPath);

      if (matches.length === 1) {
        return matches[0] ?? null;
      }
    }

    return null;
  }

  private async ensureParentFolders(path: string): Promise<void> {
    const folderPath = this.getParentFolderPath(path);
    if (!folderPath) {
      return;
    }

    const missingFolderPaths: string[] = [];
    let currentFolderPath = folderPath;

    while (currentFolderPath) {
      const existingEntry = this.app.vault.getAbstractFileByPath(currentFolderPath);
      if (existingEntry instanceof TFolder) {
        break;
      }

      if (existingEntry) {
        throw new Error(
          `Cannot create daily note folder because ${currentFolderPath} already exists as a file.`,
        );
      }

      missingFolderPaths.push(currentFolderPath);
      currentFolderPath = this.getParentFolderPath(currentFolderPath);
    }

    for (const missingFolderPath of missingFolderPaths.reverse()) {
      try {
        await this.app.vault.createFolder(missingFolderPath);
      } catch (error) {
        const existingEntry = this.app.vault.getAbstractFileByPath(missingFolderPath);
        if (!(existingEntry instanceof TFolder)) {
          throw error;
        }
      }
    }
  }

  private getParentFolderPath(path: string): string {
    const lastSeparatorIndex = path.lastIndexOf("/");
    if (lastSeparatorIndex <= 0) {
      return "";
    }

    return path.slice(0, lastSeparatorIndex);
  }

  private getDailyNoteFormat(): string {
    const configuredFormat = this.getDailyNotesPluginInstance()?.options?.format;
    if (typeof configuredFormat === "string" && configuredFormat.trim()) {
      return configuredFormat;
    }

    return DEFAULT_DAILY_NOTE_FORMAT;
  }

  private getDailyNoteFolder(): string {
    const configuredFolder = this.getDailyNotesPluginInstance()?.options?.folder;
    if (typeof configuredFolder !== "string") {
      return "";
    }

    return configuredFolder.trim().replace(/\/+$/, "");
  }

  private getDailyNotesPluginInstance(): DailyNotesPluginInstance | null {
    const internalPlugins = (
      this.app as App & {
        internalPlugins?: {
          getPluginById?: (id: string) => { instance?: DailyNotesPluginInstance } | null;
        };
      }
    ).internalPlugins;

    return internalPlugins?.getPluginById?.(DAILY_NOTES_PLUGIN_ID)?.instance ?? null;
  }

  private normalizeSettings(): void {
    this.settings.frontmatterProperty = this.getFrontmatterPropertyName();
    this.settings.autoCreateDailyNote = this.settings.autoCreateDailyNote !== false;
    this.settings.ignoreDailyNote = this.settings.ignoreDailyNote !== false;
    this.settings.excludedNotePatterns = this.normalizeExcludedNotePatterns(
      this.settings.excludedNotePatterns,
    );
    this.rebuildExcludedNoteMatchers();
  }

  private normalizeExcludedNotePatterns(value: unknown): string[] {
    if (typeof value === "string") {
      return value
        .split(/\r?\n/u)
        .map((pattern) => this.normalizeExcludedNotePattern(pattern))
        .filter((pattern): pattern is string => pattern !== null);
    }

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((pattern) => this.normalizeExcludedNotePattern(pattern))
      .filter((pattern): pattern is string => pattern !== null);
  }

  private normalizeExcludedNotePattern(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return null;
    }

    return normalizePath(trimmedValue).replace(/^\/+/, "");
  }

  private rebuildExcludedNoteMatchers(): void {
    this.excludedNoteMatchers = this.settings.excludedNotePatterns.map((pattern) =>
      this.createWildcardPatternMatcher(pattern),
    );
  }

  private createWildcardPatternMatcher(pattern: string): RegExp {
    let patternSource = "^";

    for (const character of pattern) {
      patternSource += character === "*" ? ".*" : this.escapePatternCharacter(character);
    }

    patternSource += "$";
    return new RegExp(patternSource, "u");
  }

  private escapePatternCharacter(character: string): string {
    switch (character) {
      case "\\":
      case "^":
      case "$":
      case "+":
      case "?":
      case ".":
      case "(":
      case ")":
      case "|":
      case "[":
      case "]":
      case "{":
      case "}":
        return `\\${character}`;
      default:
        return character;
    }
  }

  private isExcludedFile(file: TFile): boolean {
    if (!this.excludedNoteMatchers.length) {
      return false;
    }

    const normalizedPath = normalizePath(file.path).replace(/^\/+/, "");
    const candidatePaths = [normalizedPath, `/${normalizedPath}`];

    return this.excludedNoteMatchers.some((matcher) =>
      candidatePaths.some((candidatePath) => matcher.test(candidatePath)),
    );
  }

  private getFrontmatterPropertyName(): string {
    return this.settings.frontmatterProperty.trim() || DEFAULT_FRONTMATTER_PROPERTY;
  }

  private stripMarkdownExtension(path: string): string {
    return path.endsWith(".md") ? path.slice(0, -3) : path;
  }
}

class DailyNoteWorklogLinkerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: DailyNoteWorklogLinkerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl("h2", { text: "Daily Note Worklog Linker" });

    new Setting(containerEl)
      .setName("Frontmatter property")
      .setDesc("List property that receives the current daily note link.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_FRONTMATTER_PROPERTY)
          .setValue(this.plugin.settings.frontmatterProperty)
          .onChange(async (value) => {
            this.plugin.settings.frontmatterProperty = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Create daily note automatically")
      .setDesc(
        "Create today's daily note in the background before linking to it when the note does not exist.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoCreateDailyNote).onChange(async (value) => {
          this.plugin.settings.autoCreateDailyNote = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Skip the daily note itself")
      .setDesc("Avoid adding a self-link when you edit today's daily note.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.ignoreDailyNote).onChange(async (value) => {
          this.plugin.settings.ignoreDailyNote = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Excluded notes")
      .setDesc(
        "One pattern per line. Paths are vault-relative and * matches any part of the path, including subfolders. Examples: Templates/* and */Example.md.",
      )
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder(EXCLUDED_NOTES_PLACEHOLDER)
          .setValue(this.plugin.settings.excludedNotePatterns.join("\n"))
          .onChange(async (value) => {
            await this.plugin.updateExcludedNotePatterns(value);
          });

        textArea.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName("Daily Notes integration")
      .setDesc(
        "The plugin reads the Daily Notes core plugin format and folder when available. If Daily Notes is disabled, it falls back to YYYY-MM-DD in the vault root. Automatic creation can be disabled if you only want to link existing daily notes.",
      );
  }
}
