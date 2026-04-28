# ArtifactKeep Reuse Audit

## Direct Reuse

- `src/tauriBridge.js`: small global Tauri wrapper pattern for `invoke`, dialogs, opener, and events.
- Tauri 2 project structure from `src-tauri/`: `Cargo.toml`, `build.rs`, `main.rs`, `tauri.conf.json`, and icon bundle layout.
- Backend path-safety helpers: app data directory lookup, relative path validation, absolute user path validation, and directory creation.
- Backend image helpers: copy images into app data, read image data URLs, external image previews, and thumbnail generation.
- Backend zip helpers: safe ZIP entry path validation and deflated ZIP writing.
- Frontend utility ideas: toast feedback, confirmation dialogs, chip-style inputs, copy-to-clipboard helpers, empty states, and CSS token-based theming.

## Adapted Reuse

- Local JSON storage is adapted from ArtifactKeep's file commands, but CharacterKeep stores `data/characters.json` and `data/settings.json`.
- Image storage is adapted to the planned character-native layout: `media/characters/<character-id>/originals/` and `media/characters/<character-id>/thumbnails/`.
- Whole-app backup keeps ArtifactKeep's zip approach, but CharacterKeep writes a manifest plus per-character JSON files and restores merge-safely instead of replacing the whole app data directory.
- Card grid, settings screen, modal/dialog, and theme handling are rebuilt with CharacterKeep-specific terminology and workflow.
- Copy behavior is adapted for roleplay character prompts, including system prompt and assembled character text.

## Do Not Reuse

- Prompt-manager-specific screens and wording: system prompts, image prompts, conversations, folders, model library scanning, and prompt import/export modals.
- ArtifactKeep's restore behavior that swaps the entire app data directory; CharacterKeep v1 must preserve existing data by default.
- ArtifactKeep image metadata extraction and SillyTavern card import paths for v1. The CharacterKeep schema should allow later compatibility work without exposing that complexity now.
- Bulk prompt actions that would make the first version feel like a renamed prompt manager rather than a character vault.

## Existing Patterns Found

- Storage: simple JSON files in Tauri `app_data_dir`, read/write commands, and defensive relative path validation.
- Import/export: native dialogs in the frontend and Rust commands for filesystem writes and ZIP creation.
- Settings: JSON settings file plus local data folder display.
- Image handling: images copied to app data, data URLs for webview display, and generated JPEG thumbnails.
- Cards/UI: tokenized CSS, dark-first app shell, card grids, toast feedback, modals, and quick actions.

## New CharacterKeep Modules

- Character schema and migrations for roleplay-character records.
- Character grid/search/filter/sort controller.
- Full-screen character editor with sections for prompt, scenes, gallery, compatibility, notes, and advanced copy/export.
- Gallery manager that stores files per character and keeps cover image references valid.
- Merge-safe backup/restore command and restore summary UI.
- Settings screen with theme, data location, backup, restore, privacy, and Ko-fi support.

## Risks

- Copying too much ArtifactKeep logic would leak prompt-manager concepts into the product and make character workflows feel bolted on.
- Reusing replace-all restore behavior would violate the plan's preserve-user-data requirement.
- Reusing image paths without per-character ownership would make duplicate/delete behavior risky.
- Carrying over broad features such as folders, model scans, and prompt importers would slow v1 and clutter the app.

## Recommended Implementation Order

1. Scaffold CharacterKeep as a small vanilla Tauri 2 app.
2. Add local character/settings storage and theme support.
3. Build the character grid and full-screen editor.
4. Add scene, tag, model, notes, copy, duplicate, and safe delete behavior.
5. Add local image import, thumbnails, gallery, cover selection, and lightbox.
6. Add full backup and merge-safe restore.
7. Polish toasts, empty states, dialogs, accessibility labels, and build/test checks.
