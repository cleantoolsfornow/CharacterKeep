# CharacterKeep

CharacterKeep is a local-first Tauri desktop app for managing roleplay characters. It stores character prompts, author's notes, private notes, starter scenes, tags, compatible model labels, settings notes, collections, and local gallery images.

## Privacy

CharacterKeep is offline-only. It does not add cloud sync, backend services, accounts, telemetry, analytics, or upload behavior. Character data and media are stored on the user's machine in the app data directory.

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
  collections.json
  settings.json
media/
  characters/
    <character-id>/
      originals/
      thumbnails/
```

Images are copied into the app data directory when imported. Character JSON references those local media files and does not store base64 image data.

## Character Card PNG Import

Use Characters -> Import Character Card to select one or more PNG files. CharacterKeep reads common character-card PNG metadata chunks (`chara` and `ccv3`) when present, creates a character from valid metadata, copies the original PNG into that character's gallery, and sets it as the cover image.

Unreadable or metadata-free PNGs are summarized as skipped or parse failures instead of creating broken character records. Raw/source metadata is preserved under `extensions.characterkeep.importSource`.

## Character Export

The character editor has an Export action with:

- CharacterKeep backup ZIP for single-character merge import later.
- Portable Markdown for readable sharing.
- Portable TXT for roleplay-ready prompt text.

Private notes are excluded by default and must be opted in. ZIP exports can include gallery media and optional Markdown/TXT copies.

## Collections, Bulk Actions, And Views

Collections organize characters without turning the app into a file manager. Deleting a collection does not delete characters; assigned characters become Unfiled.

The character grid supports multi-select bulk actions for archive, unarchive, favorite, unfavorite, add tag, move to collection, and carefully confirmed permanent delete. Card view remains the default, and List view can be selected from the toolbar; the view mode persists in settings.

## Backup And Restore

Create Full Backup exports a ZIP containing:

```text
manifest.json
settings.json
collections.json
characters/
  <character-id>.json
media/
  characters/
```

Restore From Backup now shows a preflight summary before mutation. Restore remains merge-safe by default:

- Existing local data is not wiped.
- Same ID with unchanged content is skipped.
- Same ID with different content imports as a conflict copy with a new ID.
- Different ID with the same meaningful content is skipped.
- Characters can still import if media files are missing; missing media is counted in the restore summary.
- Collections are merged by ID/name and skipped when duplicates already exist.
- Imported characters are remapped to the final local collection ID, so skipped same-name collections do not leave missing collection references.
- Existing `characters.json` and `collections.json` are copied to `.pre-restore-<timestamp>` files before restore mutation.

There is intentionally no destructive overwrite restore mode.

## Data Safety

CharacterKeep normalizes loaded characters, collections, and settings with safe defaults. Unknown fields are preserved where possible, while normalized core fields win over invalid source values. JSON writes are serialized/debounced in the frontend and written atomically by the backend. Invalid JSON writes are rejected instead of replacing existing files.

If an existing JSON file cannot be parsed, the desktop backend creates a `.broken-<timestamp>` recovery copy and the app shows a blocking startup error instead of silently loading an empty vault.

Schema reference files live under `src/assets/schemas/`.

## Help

The in-app Help page renders `src/assets/guide.md` and explains privacy, data storage, gallery behavior, backup/restore, PNG imports, character export, collections, bulk actions, shortcuts, and support.

## QA

Use [docs/v1-manual-qa-checklist.md](docs/v1-manual-qa-checklist.md) for packaged-app manual testing before release.
