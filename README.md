# CharacterKeep

CharacterKeep is a local-first Tauri desktop app for managing roleplay characters. It stores character prompts, author's notes, private notes, starter scenes, tags, compatible model labels, settings notes, and local gallery images.

## Privacy

CharacterKeep is offline-only. It does not add cloud sync, backend services, accounts, telemetry, or upload behavior. Character data and media are stored on the user's machine in the app data directory.

## Development

Install dependencies:

```bash
npm install
```

Run the Tauri app in development:

```bash
npm run tauri -- dev
```

Build the packaged app:

```bash
npm run tauri -- build
```

Useful validation commands:

```bash
node --check src/main.js
node --check src/tauriBridge.js
cd src-tauri && cargo check
cd src-tauri && cargo test
npm run tauri -- build
```

## Local Data

The app uses Tauri's app data directory. In the app, open Settings and click Open Data Folder to inspect the active location.

Current layout:

```text
data/
  characters.json
  settings.json
media/
  characters/
    <character-id>/
      originals/
      thumbnails/
```

Images are copied into the app data directory when imported. Character JSON references those local media files and does not store base64 image data.

## Backup And Restore

Create Full Backup exports a ZIP containing:

```text
manifest.json
settings.json
characters/
  <character-id>.json
media/
  characters/
```

Restore From Backup is merge-safe by default:

- Existing local data is not wiped.
- Same ID with unchanged content is skipped.
- Same ID with different content imports as a conflict copy with a new ID.
- Different ID with the same meaningful content is skipped.
- Characters can still import if media files are missing; missing media is counted in the restore summary.

There is intentionally no destructive overwrite restore mode in v1.

## QA

Use [docs/v1-manual-qa-checklist.md](docs/v1-manual-qa-checklist.md) for packaged-app manual testing before a v1 release.
