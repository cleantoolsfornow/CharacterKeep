# CharacterKeep V1 Manual QA Results

Date: 2026-04-28

Environment:
- OS: macOS 26.3, arm64
- App build: local Tauri release build from this working tree
- Build artifact: `src-tauri/target/release/bundle/macos/CharacterKeep.app`
- QA type: partial local smoke testing plus automated browser interaction checks

Notes:
- The full packaged-app manual QA checklist has not been completed end to end.
- Browser-based checks used the same frontend code through a local static server, not the Tauri webview.
- Backup/restore merge behavior is covered by Rust unit tests, but destructive/restore scenarios still need manual packaged-app testing with real app data folders and ZIP edits.

## Summary

- Passed: first-run empty state render, create dialog open/cancel, Escape close, Enter submit from title field, editor opens after create, dynamic save status, card action labels, local browser persistence path, Rust restore merge tests, production Tauri build.
- Failed: none in this partial pass.
- Not tested: full packaged-app manual data lifecycle, real native file dialogs, real image import from disk, real backup/restore ZIP workflows, Ko-fi external link from packaged app, full keyboard tab order.

## Results By Area

### First Launch

- [pass] Browser smoke: Characters screen renders with empty state.
- [not tested] Packaged app first launch from a clean app data directory.

### Create Character

- [pass] New Character opens an in-app dialog, not `window.prompt`.
- [pass] Dialog includes title and optional subtitle fields.
- [pass] Title field is required.
- [pass] Escape closes the dialog without creating.
- [pass] Enter submits when focus is in the title field.
- [pass] Created character opens directly in the editor.

### Edit And Save Character

- [pass] Editing the system prompt changes save status to `Unsaved changes`.
- [pass] Save returns status to `Saved` in browser smoke test.
- [not tested] Save failure path in a real filesystem error.

### Close Editor With Unsaved Changes

- [not tested] Full packaged-app unsaved close flow.
- [known implemented] Existing code keeps unsaved-close protection through Escape/close.

### Quit And Reopen Persistence

- [not tested] Packaged app quit/reopen persistence.
- [pass] Browser localStorage smoke path persisted created data during the session.

### Gallery Images

- [not tested] Native image picker and real image copy into app data.
- [pass] Missing-image UI renders gracefully in browser screenshot fixture.
- [known implemented] Multi-image import now continues if an individual image fails and reports failures.

### Set Cover Image

- [not tested] Real packaged-app cover image workflow.

### Remove Gallery Image

- [not tested] Real packaged-app remove image and media cleanup workflow.

### Duplicate Character With Gallery Images

- [not tested] Real packaged-app duplicate with actual media files.

### Delete Character And Media Cleanup

- [not tested] Real packaged-app permanent delete and media folder cleanup.

### Archive And Unarchive

- [not tested] Full packaged-app archive/unarchive flow.
- [known implemented] Card action archives/restores and Archived filter reveals archived records.

### Theme Switching

- [pass] Light settings screen was visually smoke-tested in browser.
- [pass] Dark create/editor/home screens were visually smoke-tested in browser.
- [not tested] Packaged app theme persistence after quit/reopen.

### Open Data Folder

- [not tested] Native Open Data Folder command from packaged app.

### Create Full Backup

- [not tested] Native save dialog and real backup ZIP creation.

### Restore Into Empty App Data

- [not tested] Manual packaged-app restore into empty app data.

### Restore Into Populated App Data

- [not tested] Manual packaged-app restore into populated app data.

### Same ID + Same Content Restore

- [pass] Covered by Rust unit test.
- [not tested] Manual packaged-app restore.

### Same ID + Different Content Restore

- [pass] Covered by Rust unit test.
- [not tested] Manual packaged-app restore.

### Different ID + Same Content Restore

- [pass] Covered by Rust unit test.
- [not tested] Manual packaged-app restore.

### Missing Media Restore

- [pass] Covered by Rust unit test for merge summary behavior.
- [not tested] Manual damaged-ZIP restore in packaged app.

### Invalid Backup Manifest

- [pass] Covered by Rust unit test.
- [not tested] Manual invalid-ZIP restore in packaged app.

### Ko-fi External Link

- [not tested] Native external browser open from packaged app.

### Keyboard Basics

- [pass] Escape closes create dialog.
- [pass] Enter submits create dialog from title field.
- [not tested] Full Tab order and Enter-on-card packaged-app pass.

## Screenshots Captured

- `screenshots/2026-04-28-ux-polish-create-dialog.png`
- `screenshots/2026-04-28-ux-polish-editor-writing.png`
- `screenshots/2026-04-28-ux-polish-home-actions.png`
- `screenshots/2026-04-28-ux-polish-create-mobile.png`

## Issues Found

- No blocking issues found in the partial smoke test.

## Follow-Up Required

- Run `docs/v1-manual-qa-checklist.md` against `CharacterKeep.app`.
- Exercise real native image import, backup, restore, damaged backup, and data folder operations.
- Record pass/fail results from the packaged app rather than browser smoke tests.
