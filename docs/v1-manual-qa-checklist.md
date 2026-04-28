# CharacterKeep V1 Manual QA Checklist

Use a packaged desktop build for this checklist. Start with a known test data directory when possible, and keep a backup of any real data before destructive tests.

## First Launch

- [ ] Launch CharacterKeep from the packaged app.
- [ ] Confirm the app opens to the Characters screen.
- [ ] Confirm no account, login, network setup, or cloud prompt appears.
- [ ] Confirm the empty state appears if there are no characters.
- [ ] Open Settings and confirm the local data path is shown.

## Create Character

- [ ] Click New Character.
- [ ] Create a character with only a title.
- [ ] Confirm the editor opens.
- [ ] Click Save.
- [ ] Confirm the save status changes to Saved.
- [ ] Close the editor.
- [ ] Confirm the character appears as a card.

## Edit And Save Character

- [ ] Open an existing character card.
- [ ] Edit title, subtitle, system prompt, author's note, private notes, settings notes, tags, compatible models, and scenes.
- [ ] Confirm the save status changes to Unsaved changes after edits.
- [ ] Click Save.
- [ ] Confirm the save status changes through Saving... to Saved.
- [ ] Close and reopen the editor.
- [ ] Confirm all edits are still present.

## Close Editor With Unsaved Changes

- [ ] Open a character.
- [ ] Make a visible edit.
- [ ] Press Escape.
- [ ] Confirm the unsaved changes warning appears.
- [ ] Cancel the warning and confirm the editor stays open.
- [ ] Press Escape again and confirm discard.
- [ ] Reopen the character and confirm the discarded edit was not saved.

## Quit And Reopen Persistence

- [ ] Create or edit a character and save.
- [ ] Quit CharacterKeep completely.
- [ ] Reopen CharacterKeep.
- [ ] Confirm the saved character and edits persist.

## Gallery Images

- [ ] Open a character and click Add Images.
- [ ] Select one valid PNG or JPG.
- [ ] Confirm the image appears in the gallery.
- [ ] Save, close, and reopen the character.
- [ ] Confirm the image persists.
- [ ] Add multiple images at once.
- [ ] Confirm thumbnails appear for each image.
- [ ] Confirm the app remains responsive.

## Set Cover Image

- [ ] Add at least two gallery images.
- [ ] Click Set cover on the second image.
- [ ] Save and close the editor.
- [ ] Confirm the character card uses the selected cover image.
- [ ] Reopen the app and confirm the cover is still correct.

## Remove Gallery Image

- [ ] Remove a non-cover gallery image.
- [ ] Confirm the removal warning appears.
- [ ] Confirm removal.
- [ ] Save and reopen the character.
- [ ] Confirm the image is gone.
- [ ] Remove the cover image.
- [ ] Confirm another image becomes available as cover or the card returns to the placeholder state.

## Duplicate Character With Gallery Images

- [ ] Add gallery images to a character and save.
- [ ] Duplicate the character.
- [ ] Confirm the duplicate appears with `Copy` in the title.
- [ ] Open the duplicate.
- [ ] Confirm scenes, notes, tags, compatible models, settings notes, and gallery records are copied.
- [ ] Confirm duplicate gallery images still display after app restart.
- [ ] Delete or remove an image from the duplicate.
- [ ] Confirm the original character's gallery still displays.

## Delete Character And Media Cleanup

- [ ] Create a test character with at least one gallery image.
- [ ] Note its media folder under `media/characters/<character-id>`.
- [ ] Open the character editor and click Delete.
- [ ] Confirm the permanent delete warning names the character and mentions local gallery files.
- [ ] Cancel once and confirm the character remains.
- [ ] Delete again and confirm.
- [ ] Confirm the card disappears.
- [ ] Confirm the character media folder was removed.

## Archive And Unarchive

- [ ] Click the archive action on a character card.
- [ ] Confirm the character disappears from the default grid.
- [ ] Enable the Archived filter.
- [ ] Confirm the archived character appears.
- [ ] Restore the character from the card action or open it, unarchive, and save.
- [ ] Confirm it returns to the default grid.

## Theme Switching

- [ ] Open Settings.
- [ ] Switch to Light.
- [ ] Confirm the app remains readable.
- [ ] Switch to Dark.
- [ ] Confirm the dark theme remains polished.
- [ ] Switch to System.
- [ ] Quit and reopen the app.
- [ ] Confirm the selected theme persists.

## Open Data Folder

- [ ] Open Settings.
- [ ] Click Open Data Folder.
- [ ] Confirm the OS file manager opens the app data directory.
- [ ] Confirm `data/characters.json`, `data/settings.json`, and `media/characters/` are present after creating data.

## Create Full Backup

- [ ] Open Settings.
- [ ] Click Create Full Backup.
- [ ] Save the ZIP outside the app data directory.
- [ ] Confirm a success toast appears.
- [ ] Open the ZIP and confirm it contains `manifest.json`, `settings.json`, `characters/`, and `media/` when media exists.

## Restore Into Empty App Data

- [ ] Move or rename the current app data directory.
- [ ] Launch CharacterKeep to create empty data.
- [ ] Restore a valid CharacterKeep backup.
- [ ] Confirm characters and images are restored.
- [ ] Quit and reopen the app.
- [ ] Confirm restored data persists.

## Restore Into Populated App Data

- [ ] Start with existing local characters.
- [ ] Restore a valid backup with different characters.
- [ ] Confirm existing characters remain.
- [ ] Confirm backup characters are added.
- [ ] Confirm no local data is wiped.

## Same ID + Same Content Restore

- [ ] Restore the same backup twice without editing local data.
- [ ] Confirm unchanged characters are skipped.
- [ ] Confirm duplicate cards are not created.

## Same ID + Different Content Restore

- [ ] Restore a backup.
- [ ] Edit a restored local character and save.
- [ ] Restore the original backup again.
- [ ] Confirm both versions are preserved.
- [ ] Confirm the conflict copy gets a new ID and a restored-copy title.

## Different ID + Same Content Restore

- [ ] Prepare a backup containing a character with the same meaningful content but a different ID.
- [ ] Restore it into data that already has that content.
- [ ] Confirm the duplicate exact-content character is skipped.

## Missing Media Restore

- [ ] Create a backup with gallery images.
- [ ] Copy the backup and remove one media file from the ZIP.
- [ ] Restore the damaged backup.
- [ ] Confirm the character imports.
- [ ] Confirm restore summary reports missing media.
- [ ] Confirm the gallery shows graceful missing-image UI.

## Invalid Backup Manifest

- [ ] Create a copy of a backup ZIP.
- [ ] Remove or corrupt `manifest.json`, or change the app name.
- [ ] Attempt restore.
- [ ] Confirm restore is rejected with a clear error.
- [ ] Confirm existing local data remains unchanged.

## Ko-fi External Link

- [ ] Open Settings.
- [ ] Click Support development on Ko-fi.
- [ ] Confirm the system browser opens `https://ko-fi.com/cleantoolsfornow`.

## Keyboard Basics

- [ ] Press Tab through the main navigation, toolbar, cards, and buttons.
- [ ] Confirm focus is visible and order is reasonable.
- [ ] Focus a character card and press Enter.
- [ ] Confirm the editor opens.
- [ ] Press Escape in the editor.
- [ ] Confirm it closes when there are no unsaved changes.
- [ ] Confirm Escape triggers unsaved-change protection when edits are pending.
