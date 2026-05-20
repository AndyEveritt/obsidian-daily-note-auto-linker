# Release Workflow

## Purpose

This workflow automates GitHub releases for the plugin and publishes the files Obsidian expects users to download from a release.

## Architecture Overview

The release automation is implemented in `.github/workflows/release.yml` and runs entirely in GitHub Actions.

- `actions/checkout` fetches the full tag history so the workflow can compare the current tag against the previous release tag.
- `actions/setup-node` prepares the Node environment used to install dependencies and build the plugin.
- The workflow uses the GitHub CLI and GitHub REST API to inspect the pushed tag and confirm that GitHub considers it verified.
- The workflow creates or updates a GitHub Release and uploads the built plugin assets.

## Control Flow

1. A tag is pushed to GitHub.
2. The workflow checks that the tag name exactly matches the version in `manifest.json`.
3. The workflow resolves the tag ref through the GitHub API.
4. If the pushed ref is a lightweight tag, the workflow stops.
5. The workflow fetches the annotated tag object and checks `verification.verified`.
6. If GitHub does not consider the tag verified, the workflow stops.
7. The workflow installs dependencies with `npm ci` and builds the plugin with `npm run build`.
8. The workflow stages `main.js`, `manifest.json`, and `styles.css` when present.
9. The workflow generates `RELEASE_NOTES.md` from non-merge commit subjects since the previous tag.
10. The workflow creates a release if one does not exist, or updates the existing release on reruns.

## Interfaces And Contracts

- Input ref:
  - `github.ref_name` must be the plugin version, for example `1.0.1`.
- Required repository files:
  - `manifest.json`
  - `package-lock.json`
  - build output `main.js` after `npm run build`
- Optional release asset:
  - `styles.css`
- GitHub token permissions:
  - `contents: write`

## Configuration

- Workflow file: `.github/workflows/release.yml`
- Trigger: `push` on tags
- Node version: `20`
- Tag format expectation:
  - Use a signed annotated tag whose name exactly matches `manifest.json`.

Example commands:

```bash
npm ci
npm run build
git tag -s 1.0.1 -m "1.0.1"
git push origin 1.0.1
```

## Operational Behavior

- Release notes are generated from commit subjects in Git history.
- Merge commits are skipped to keep the changelog focused.
- The release title is the tag itself.
- Rerunning the workflow updates the release notes and re-uploads assets with overwrite enabled.

## Error Handling

- Version mismatch between the tag and `manifest.json` fails the workflow immediately.
- Lightweight tags fail because GitHub does not expose tag verification for them.
- Unverified, unsigned, or invalid signed tags fail with the GitHub verification reason in the logs.
- Build failures stop the release before any assets are uploaded.

## Constraints

- GitHub verification checks are only available for annotated tags.
- The changelog quality depends on commit subject quality.
- The workflow assumes the repository allows GitHub Actions to write releases using `GITHUB_TOKEN`.

## Verification Guidance

1. Confirm the version in `manifest.json` is the version you intend to release.
2. Run `npm ci` and `npm run build` locally.
3. Create a signed annotated tag with the exact version number.
4. Push the tag to GitHub.
5. Check the workflow run in the Actions tab.
6. Confirm the GitHub Release contains the built assets and generated changelog.
