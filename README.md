# Daily Note Worklog Linker

Daily Note Worklog Linker is an Obsidian plugin that appends the current daily note to a frontmatter list whenever a markdown note is modified.

## What it does

- Watches markdown file modifications in the vault.
- Resolves today's daily note using the Daily Notes core plugin configuration when available.
- Appends the daily note link to a configurable frontmatter list property.
- Skips writing duplicates when the property already contains the current daily note.
- Avoids adding a self-link when you edit the daily note itself by default.

## Default behavior

With the default settings, editing a note on 2026-05-20 produces frontmatter like this:

```yaml
---
workedOn:
  - "[[2026-05-20]]"
---
```

If your Daily Notes core plugin stores notes in a folder, the plugin writes the correct path-based link instead.

## Development

This repository is a standard Obsidian plugin project.

```bash
npm install
npm run build
```

For watch mode while developing:

```bash
npm run dev
```

## Releasing

The repository includes an automated release workflow in `.github/workflows/release.yml`.

- The workflow runs when a tag is pushed.
- It only proceeds when the tag is an annotated tag that GitHub marks as verified.
- The tag name must exactly match the version in `manifest.json`.
- It builds the plugin, generates release notes from non-merge commit subjects since the previous tag, and publishes the standard Obsidian release assets.
- The published assets are `main.js`, `manifest.json`, and `styles.css` when that file exists.

Example release commands:

```bash
git tag -s 1.0.1 -m "1.0.1"
git push origin 1.0.1
```

If Actions in the repository are still limited to read-only tokens, enable read and write workflow permissions in the repository settings before tagging.

## Installing into a vault

1. Place this folder inside `.obsidian/plugins/daily-note-worklog-linker`.
2. Run `npm install` and `npm run build` if `main.js` is not already present.
3. Enable the plugin from Obsidian's Community plugins settings.
4. Optionally change the target frontmatter property in the plugin settings.

## Notes

- The plugin requires Obsidian 1.4.4 or newer because it uses `processFrontMatter()`.
- If the Daily Notes core plugin is disabled, the plugin falls back to a `YYYY-MM-DD` daily note name at the vault root.
- The plugin only updates markdown files.

## Developer documentation

Implementation details and maintenance notes are in [docs/developer-notes.md](docs/developer-notes.md).
Release automation details are in [docs/release-workflow.md](docs/release-workflow.md).

