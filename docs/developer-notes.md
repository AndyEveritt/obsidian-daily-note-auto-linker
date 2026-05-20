# Developer Notes

## Purpose

This plugin records when a note was worked on by appending the current daily note to a frontmatter list property on every markdown-file modification.

## Architecture

The implementation lives in `src/main.ts` and is built into `main.js` with esbuild.

- `DailyNoteWorklogLinkerPlugin` registers a vault `modify` listener.
- A short debounce collapses rapid save events for the same file.
- `processFrontMatter()` performs atomic frontmatter updates.
- A suppression window prevents the plugin from responding to its own frontmatter write.

## Control Flow

1. Obsidian emits a vault `modify` event for a markdown file.
2. The plugin debounces the file path.
3. The plugin resolves today's daily note path from the Daily Notes core plugin settings.
4. The plugin checks cached frontmatter for the configured property.
5. If today's daily note is missing, the plugin appends a wikilink to the property.

## Data Contract

- Setting: `frontmatterProperty`
  - Default: `workedOn`
  - Meaning: the frontmatter list property that receives the daily-note link.
- Setting: `ignoreDailyNote`
  - Default: `true`
  - Meaning: skip writing a self-link when today's daily note is the file being edited.
- Stored value format:
  - Array items are wikilink strings such as `[[2026-05-20]]` or `[[Daily/2026-05-20]]`.

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
3. Edit any markdown note that is not today's daily note.
4. Confirm the configured frontmatter list contains exactly one link to today's daily note.
5. Edit the same note again and confirm no duplicate entry is added.

For release verification, follow the release workflow guidance in [docs/release-workflow.md](release-workflow.md).

