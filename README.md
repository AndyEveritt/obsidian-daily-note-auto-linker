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
