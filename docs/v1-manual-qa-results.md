# CharacterKeep V1 Manual QA Results

Date: 2026-04-28

Environment:
- OS: macOS 26.3, arm64
- App build: local Tauri release build from this working tree
- Packaged app tested: `src-tauri/target/release/bundle/macos/CharacterKeep.app`
- Bundle id tested through automation: `com.characterkeep.desktop`
- App data path shown by app: `/Users/matt/Library/Application Support/com.characterkeep.desktop`

Notes:
- This pass used the packaged macOS app, not a browser smoke test.
- Existing app data was not deleted. The test started from an effectively empty `com.characterkeep.desktop` data folder and created QA records dated 2026-04-28.
- A stale installed `/Applications/CharacterKeep.app` with bundle id `com.characterkeep.app` was also present. It was not the tested build; it was killed before continuing with `com.characterkeep.desktop`.
- Native save/open file dialog workflows could not be completed reliably through desktop automation in this run, so image import and backup/restore items are marked blocked or not tested unless directly verified.

## Summary

- Passed: clean first launch, in-app create dialog, create character, edit/save, save status, quit/reopen persistence, duplicate without gallery images, archive/unarchive, Archived filter, Open Data Folder, empty-state local-first help, card action labels, basic Tab focus movement, Enter on card/editor open.
- Blocked by automation: native image picker, backup save dialog, restore open dialog, Ko-fi external link verification.
- Not tested: gallery media lifecycle, packaged backup/restore ZIP merge scenarios, permanent delete/media cleanup.
- Failed: none confirmed. The blocked native-dialog items still require hands-on manual testing.

## Results By Area

### First Launch

- [pass] Packaged app launched from `src-tauri/target/release/bundle/macos/CharacterKeep.app`.
- [pass] Clean first launch showed Characters screen and empty state.
- [pass] Empty state included local-first helper copy: title-only requirement, local prompts/notes/scenes/tags, and images copied into app data.

### Create Character

- [pass] Empty-state Create Character opened an in-app modal.
- [pass] Modal included title and optional subtitle fields.
- [pass] Created `QA Lyra 2026-04-28` with subtitle `Packaged QA character`.
- [pass] Created character opened directly in the editor.
- [not tested] Required-title error in packaged app.
- [not tested] Escape-to-close create dialog in packaged app during this run.
- [not tested] Enter-submit from title field in packaged app during this run.

### Edit And Save Character

- [pass] Editing System Prompt changed save status from `Saved` to `Unsaved changes`.
- [pass] Clicking Save changed status back to `Saved`.
- [pass] Character data persisted to `data/characters.json`.
- [not tested] Save failed state from a real filesystem failure.

### Close Editor With Unsaved Changes

- [not tested] Unsaved-close confirmation was not exercised in this packaged-app run.

### Quit And Reopen Persistence

- [pass] Quit and relaunched the packaged app.
- [pass] `QA Lyra 2026-04-28` appeared after reopen.
- [pass] Saved system prompt persisted after reopen.

### Gallery Images

- [blocked] Add Images button was visible, but the native image picker could not be driven to completion through desktop automation.
- [not tested] Real local PNG import.
- [not tested] Thumbnail generation.
- [not tested] Thumbnail persistence after restart.
- [not tested] Lightbox.
- [not tested] Missing/broken image UI in packaged app.

### Set Cover Image

- [not tested] Requires successful packaged-app image import first.

### Remove Gallery Image

- [not tested] Requires successful packaged-app image import first.

### Duplicate Character With Gallery Images

- [not tested] Requires successful packaged-app image import first.
- [pass] Duplicate without gallery images created `QA Lyra 2026-04-28 Copy` and preserved saved text fields.

### Delete Character And Media Cleanup

- [not tested] Permanent delete and media cleanup were not run in this pass because gallery import could not be completed and the request limited fixes to blocking bugs.

### Archive And Unarchive

- [pass] Card-level Archive archived `QA Lyra 2026-04-28 Copy`.
- [pass] Archived character disappeared from the default view.
- [pass] Archived filter showed the archived character with Restore action.
- [pass] Restore returned the character to non-archived state.
- [pass] Clearing the Archived filter showed both active test characters.

### Theme Switching

- [not tested] Theme switching and persistence were not exercised in this packaged-app run.

### Open Data Folder

- [pass] Open Data Folder opened Finder at `/Users/matt/Library/Application Support/com.characterkeep.desktop`.
- [pass] Finder showed `data` and `media` entries under the app data folder.

### Create Full Backup

- [blocked] Create Full Backup button was visible, but the native save dialog could not be completed through desktop automation.
- [not tested] Real backup ZIP creation from packaged app.

### Restore Into Empty App Data

- [not tested] Requires real backup ZIP creation/selection through packaged app.

### Restore Into Populated App Data

- [not tested] Requires real backup ZIP creation/selection through packaged app.

### Same ID + Same Content Restore

- [not tested] Manual packaged-app restore not completed in this run.
- [pass] Covered by Rust unit test during validation.

### Same ID + Different Content Restore

- [not tested] Manual packaged-app restore not completed in this run.
- [pass] Covered by Rust unit test during validation.

### Different ID + Same Content Restore

- [not tested] Manual packaged-app restore not completed in this run.
- [pass] Covered by Rust unit test during validation.

### Missing Media Restore

- [not tested] Damaged backup ZIP restore was not completed in packaged app.
- [pass] Covered by Rust unit test during validation.

### Invalid Backup Manifest

- [not tested] Invalid manifest restore was not completed in packaged app.
- [pass] Covered by Rust unit test during validation.

### Ko-fi External Link

- [blocked] Ko-fi button was visible, but external-link browser opening was not verified in this pass.

### Keyboard Basics

- [pass] Tab moved focus through the packaged app controls.
- [pass] Enter on a character card opened the editor.
- [not tested] Full Tab order checklist was not completed.
- [not tested] Escape editor/create-dialog behavior was not completed in this packaged-app run.

## Screenshots Captured

- No new timestamped screenshots were committed in this QA-only pass.
- Visual evidence was inspected through Computer Use screenshots during the packaged-app run.

## Issues Found

- [blocked/manual follow-up] Native file dialog flows could not be completed through automation: image import, backup creation, restore selection, and Ko-fi external open still need hands-on packaged-app testing.
- [environment note] `/Applications/CharacterKeep.app` can be confused with the repo-built `CharacterKeep.app`; use bundle id `com.characterkeep.desktop` or launch the repo bundle directly for QA.

## Follow-Up Required

- Manually run the native file-dialog portions of `docs/v1-manual-qa-checklist.md` on the packaged app.
- Use real image files to verify gallery import, thumbnails, cover selection, lightbox, image removal, duplicate-with-media, and delete media cleanup.
- Use real backup ZIPs to verify packaged-app restore into empty and populated data, conflict copies, missing media, invalid manifest, and non-destructive merge behavior.
