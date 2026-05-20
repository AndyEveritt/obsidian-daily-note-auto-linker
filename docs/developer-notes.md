# Developer Notes

## Purpose

This plugin records when a note was worked on by appending the current daily note to a frontmatter list property on every markdown-file modification, unless the note matches a configured exclusion pattern.

## Architecture

The implementation lives in `src/main.ts` and is built into `main.js` with esbuild.

- `DailyNoteWorklogLinkerPlugin` registers a vault `modify` listener.
- A short debounce collapses rapid save events for the same file.
- Excluded-note patterns are normalized and compiled into regex matchers when settings load or save.
- `processFrontMatter()` performs atomic frontmatter updates.
- A suppression window prevents the plugin from responding to its own frontmatter write.

## Control Flow

1. Obsidian emits a vault `modify` event for a markdown file.
2. The plugin ignores suppressed writes and files whose paths match an exclusion pattern.
3. The plugin debounces the file path.
4. The plugin resolves today's daily note path from the Daily Notes core plugin settings.
5. The plugin checks cached frontmatter for the configured property.
6. If today's daily note is missing, the plugin appends a wikilink to the property.

## Program Flow Diagram

The diagram below maps the runtime path to the concrete methods in `DailyNoteWorklogLinkerPlugin` and the Obsidian APIs they depend on. The main early-return gates are `onVaultModify()`, `isSuppressed()`, `isExcludedFile()`, `isCurrentDailyNote()`, and `frontmatterAlreadyTracksDailyNote()`. The only write path goes through `app.fileManager.processFrontMatter()`.

```mermaid
flowchart TD
  subgraph Obsidian["Obsidian APIs and components"]
    A["app.vault.on('modify') event"]
    P["app.metadataCache.getFileCache(file)?.frontmatter"]
    Q["app.fileManager.processFrontMatter(file, callback)"]
    R["app.metadataCache.fileToLinktext(...)"]
  end

  subgraph Plugin["DailyNoteWorklogLinkerPlugin methods"]
    B["onVaultModify(file)"]
    C{"file instanceof TFile && file.extension === 'md'?"}
    D{"isSuppressed(file.path)?"}
    E{"isExcludedFile(file)?"}
    F["queueFrontmatterUpdate(file)"]
    G["ensureDailyNoteLink(path)"]
    H{"isExcludedFile(file)?"}
    I["getCurrentDailyNoteReference(file)"]
    J{"settings.ignoreDailyNote && isCurrentDailyNote(...)?"}
    K["frontmatterAlreadyTracksDailyNote(...)"]
    L{"Frontmatter already tracks today's link?"}
    M["suppressedPaths.set(...)"]
    N["processFrontMatter callback"]
    O["toFrontmatterList(frontmatter[propertyName])"]
    S{"isSameDailyNoteValue(...) duplicate?"}
    T["values.push('[[...]]') and assign frontmatter[propertyName]"]
  end

  subgraph DailyNotes["Daily Notes resolution helpers"]
    U["getDailyNotesPluginInstance()"]
    V["getDailyNoteFormat() / getDailyNoteFolder()"]
    W["resolveDailyNoteFile(formattedPath, configuredPath)"]
  end

  A --> B
  B --> C
  C -- No --> Z([Return])
  C -- Yes --> D
  D -- Yes --> Z
  D -- No --> E
  E -- Yes --> Z
  E -- No --> F
  F --> G
  G --> H
  H -- Yes --> Z
  H -- No --> I
  I --> U
  U --> V
  V --> W
  W --> R
  I --> J
  J -- Yes --> Z
  J -- No --> P
  P --> K
  K --> L
  L -- Yes --> Z
  L -- No --> M
  M --> Q
  Q --> N
  N --> O
  O --> S
  S -- Yes --> Z
  S -- No --> T
  T --> Y([Frontmatter updated])
```

## Data Contract

- Setting: `frontmatterProperty`
  - Default: `workedOn`
  - Meaning: the frontmatter list property that receives the daily-note link.
- Setting: `ignoreDailyNote`
  - Default: `true`
  - Meaning: skip writing a self-link when today's daily note is the file being edited.
- Setting: `excludedNotePatterns`
  - Default: `[]`
  - Meaning: skip processing notes whose vault-relative paths match any configured wildcard pattern.
- Stored value format:
  - Array items are wikilink strings such as `[[2026-05-20]]` or `[[Daily/2026-05-20]]`.

## Exclusion Matching

- Patterns are matched against the full vault-relative note path, including the `.md` extension.
- `*` is the only wildcard and it spans any part of the path, including subfolders.
- The matcher tests both the plain vault-relative path and a slash-prefixed version so patterns such as `*/Example.md` also match a root-level `Example.md`.
- Blank lines in the settings textarea are ignored when settings are saved.

## Daily Notes Resolution

The plugin uses the Daily Notes core plugin through `app.internalPlugins.getPluginById('daily-notes')`.

- `options.format` controls the date-based file name.
- `options.folder` is used when the daily notes live outside the vault root.
- If Daily Notes is unavailable, the plugin falls back to `YYYY-MM-DD` with no folder prefix.

## Error Handling

- Frontmatter write failures are logged to the developer console.
- Failed writes remove the suppression lock so the next real edit can retry.
- Duplicate detection accepts both raw path strings and wikilink strings so existing values are not duplicated.

## Constraints

- The plugin only responds to markdown files.
- It depends on Obsidian 1.4.4+ for `processFrontMatter()`.
- It does not backfill historical notes; it only acts on future modifications.
- Exclusion patterns only support the `*` wildcard.

## Release Automation

Release publishing is handled separately by the GitHub Actions workflow in `.github/workflows/release.yml`.

- The workflow requires the pushed tag to be a GitHub-verified annotated tag.
- The tag must match `manifest.json` exactly, which keeps Obsidian release metadata consistent.
- Release notes are derived from commit subjects rather than hand-authored notes.

Detailed release workflow documentation is in [docs/release-workflow.md](release-workflow.md).

## Verification

Use these commands from the plugin root:

```bash
npm install
npm run build
```

Manual verification:

1. Enable the Daily Notes core plugin and set a date format and optional folder.
2. Enable this plugin.
3. Add an exclusion pattern such as `Templates/*` or `*/Example.md` in the plugin settings.
4. Edit a markdown note that matches the exclusion pattern and confirm its frontmatter is unchanged.
5. Edit any markdown note that does not match an exclusion pattern and is not today's daily note.
6. Confirm the configured frontmatter list contains exactly one link to today's daily note.
7. Edit the same note again and confirm no duplicate entry is added.

For release verification, follow the release workflow guidance in [docs/release-workflow.md](release-workflow.md).

