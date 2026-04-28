

# Build a Local-First Tauri 2 Roleplay Character Vault App
You are helping me build a new local-first Tauri 2 desktop app for managing roleplay characters.
The app should be a polished, delightful, premium-feeling, offline-only character vault. It should let users create, edit, organize, duplicate, search, back up, restore, and copy roleplay character data. All data must live locally on the user’s machine inside the app data directory. There should be no cloud sync, no backend, no telemetry, and no required account.
I have an existing related project called `artifactkeep-app`, I have cloned it to a sister directory to this directory. Feel free to clone it into this directory as a reference if needed and it makes it easier. Use that project as a primary reference implementation. It already contains a lot of useful architecture, UI patterns, storage behavior, import/export ideas, cards, settings, prompt handling, image handling, and local-first concepts. Reuse/adapt anything from ArtifactKeep that makes sense, but do not blindly clone it. This new app should feel character-native, not like a prompt manager with renamed labels.
The goal is not to reinvent the wheel. First inspect `artifactkeep-app`, then build this new app by borrowing the parts that are useful.
---
# Product Name
Use a working name for now:
**CharacterKeep**
If the app already has a different name in this repo, preserve the existing name. Otherwise use CharacterKeep in UI labels, title, and app metadata.
---
# High-Level Product Vision
CharacterKeep is a private local desktop vault for roleplay characters.
Users should be able to:
- Create roleplay characters
- Store a main system prompt
- Store author’s notes
- Store private notes
- Add one or more starter scenes / scene ideas
- Add tags
- Track compatible models
- Store settings notes like temperature, top-p, sampler settings, etc.
- Add a preview image
- Add a gallery of images per character
- Search and filter their characters
- Copy useful prompt text quickly
- Duplicate a full character to create variants
- Safely delete characters with confirmation
- Export a full app backup as a zip
- Restore from a backup zip in a merge-safe way
- Switch between light and dark mode
- Donate via my Ko-fi link
The app should feel simple, modern, premium, and easy to use. It should be beautiful without being cluttered.
---
# Important Existing Reference Project
Inspect `artifactkeep-app` before implementing.
I want you to specifically look for reusable patterns related to:
- Tauri 2 structure
- local app data storage
- JSON/database file storage
- import/export
- backup/restore
- card grids
- list views
- empty states
- search
- filtering
- sorting
- folders/collections, if useful
- bulk action toolbar, if useful
- modal/dialog patterns
- detail/edit views
- copy-to-clipboard behavior
- duplicate behavior
- delete confirmation behavior
- settings screen
- theme handling
- image/gallery handling
- lightbox/preview behavior
- CSS variables/tokens
- app shell/sidebar/header patterns
- app branding patterns
- native file picker usage
- zip creation/extraction, if already present
- any Rust commands that can be adapted
Do not copy ArtifactKeep wording unless it fits. This app should use character-specific language.
---
# First Task: ArtifactKeep Reuse Audit
Before coding, inspect the ArtifactKeep project and produce a short implementation note in the repo, preferably:
`docs/artifactkeep-reuse-audit.md`
The audit should identify:
1. Files/components/modules that can be reused directly
2. Files/components/modules that can be adapted
3. Files/components/modules that should not be reused
4. Existing patterns for storage, import/export, settings, image handling, and cards
5. New files/modules needed for CharacterKeep
6. Risks from copying too much ArtifactKeep-specific logic
7. Recommended implementation order
Do this before implementation so we avoid building from scratch unnecessarily.
---
# Core Data Model
Implement a local character model. Title is the only required user-entered field.
A character should have at least:
```json
{
  "id": "uuid",
  "schemaVersion": 1,
  "type": "roleplay_character",
  "title": "",
  "subtitle": "",
  "previewImageId": null,
  "systemPrompt": "",
  "authorsNote": "",
  "notes": "",
  "scenes": [],
  "tags": [],
  "compatibleModels": [],
  "settingsNotes": "",
  "gallery": [],
  "favorite": false,
  "archived": false,
  "createdAt": "",
  "updatedAt": ""
}

Scene object:

{
  "id": "uuid",
  "title": "",
  "body": "",
  "tags": [],
  "createdAt": "",
  "updatedAt": ""
}

Gallery image object:

{
  "id": "uuid",
  "filename": "",
  "originalPath": "",
  "thumbnailPath": "",
  "caption": "",
  "notes": "",
  "isCover": false,
  "createdAt": "",
  "updatedAt": ""
}

Compatible model object can be simple in v1:

{
  "id": "uuid",
  "name": "",
  "notes": ""
}

Tag object can be simple:

{
  "id": "uuid",
  "name": ""
}

If ArtifactKeep already has a good schema pattern, adapt it. But make sure this new app has character-native data.

⸻

Storage Requirements

All data must be stored locally in the app data directory.

No cloud.
No account.
No backend.
No telemetry.

Use Tauri 2 app data APIs / Rust backend patterns from ArtifactKeep if available.

Preferred storage layout:

app-data/
  characterkeep/
    data/
      characters.json
      settings.json
    media/
      characters/
        <character-id>/
          originals/
          thumbnails/
    backups/
      optional-local-backup-files-if-needed

If ArtifactKeep has a better proven local storage structure, use that instead, but document it.

Images should not be base64 encoded inside the main JSON unless ArtifactKeep already uses that and there is a strong reason. Prefer storing image files in app data and referencing them from character JSON.

When importing images, copy them into the app data media directory. Do not depend on the original source file path continuing to exist.

Generate thumbnails if ArtifactKeep already has thumbnail logic. If not, implement a simple version or use full images for v1 with a clear TODO.

⸻

Main Screens

1. Character Grid / Home Screen

This is the primary screen.

It should be beautiful and polished.

The main screen should show characters as cards.

Each card should show:

* Preview image or tasteful placeholder
* Character title
* Subtitle/short description if present
* Tags as small chips
* Compatible model chips if present
* Last edited date
* Scene count
* Gallery image count
* Favorite indicator if favorited
* Quick action row

Card quick actions:

1. Copy
    * Default behavior: copy main system prompt
    * Ideally include a small dropdown or secondary option later for:
        * Copy system prompt
        * Copy full character prompt
        * Copy assembled prompt
2. Duplicate
    * Duplicate the entire character, including scenes, notes, model compatibility, settings notes, tags, and gallery references/images
    * New character title should be Original Title Copy
    * Assign new IDs to the duplicated character and nested items
    * Do not mutate the original
3. Delete
    * Requires extra confirmation
    * Prefer moving delete into a menu or requiring a strong confirm
    * Do not make accidental deletion easy

Clicking the main card area should open the full character detail/editor view.

The home screen should include:

* Search input
* New Character button
* Import button if single-character import exists
* Settings button or sidebar nav
* View toggle if ArtifactKeep already has this pattern
* Sort controls
* Filter controls

Search should match:

* title
* subtitle
* system prompt
* author’s note
* notes
* scene titles
* scene bodies
* tags
* compatible model names
* settings notes

Filters for v1:

* Favorites
* Archived / not archived
* Tags
* Compatible model
* Has gallery images
* Has scenes

Sort options:

* Recently edited
* Recently created
* A–Z
* Z–A
* Favorites first

Empty state:

If there are no characters, show a warm empty state:

Title: No characters yet
Body: Create your first roleplay character and keep everything private on your device.
Button: Create Character

No results state:

Title: No matching characters
Body: Try changing your search or clearing filters.

⸻

2. Character Detail / Editor

When a character card is selected, show a large, nearly full-screen detail/editor experience.

Prefer a full-screen editor route/page inside the app shell rather than a cramped modal. If ArtifactKeep has a strong modal pattern, a near-full-screen modal is acceptable, but it should feel spacious and premium.

The editor should have:

Header:

* Preview image / avatar
* Title field
* Subtitle field
* Favorite toggle
* Save status
* Copy button
* Duplicate button
* Delete button with extra confirmation
* Close / dismiss button

Main sections or tabs:

1. Overview
2. Prompt
3. Scenes
4. Gallery
5. Compatibility
6. Notes
7. Export / Advanced, optional

It does not need to literally be tabs if a beautiful single-scroll layout is easier, but keep the content organized.

Fields:

* Title
    * Required
    * Only required field
* Subtitle
* Preview image
* System Prompt
    * Large textarea
    * This is the most important field
* Author’s Note
    * Large textarea
* Notes
    * Freeform textarea for private notes
* Scenes
    * User can add one or more scenes
    * Each scene has title and body
    * Scene body is freeform text
    * User can copy individual scene
    * User can duplicate scene
    * User can delete scene with confirmation or undo
    * User can reorder scenes if easy
* Tags
    * User-supplied
    * Used for search/filter
    * Chip input style
* Best compatible with
    * User can type in model names like Gemma 4, GLM, Qwen, NovelAI, etc.
    * Freeform chip input
    * Optional notes per model if easy
* Settings Notes
    * Freeform text field
    * User can store temperature, top-p, sampler, jailbreak notes, model-specific settings, etc.
* Gallery
    * User can add one or more images
    * Show thumbnails
    * Clicking thumbnail opens full-screen lightbox
    * User can set one image as preview/cover
    * User can remove images
    * User can add captions/notes if easy

Bottom or header actions:

* Save
* Dismiss / close
* Delete character with extra confirmation

Autosave:

If practical, implement autosave. If autosave is too much for v1, implement clear unsaved-change handling.

Ideal behavior:

* Show Saved
* Show Unsaved changes
* Show Saving...
* Prevent accidental close with unsaved changes, or auto-save on close

⸻

Copy Behavior

Copy is a core action.

Implement:

Copy system prompt

Copies only:

<System Prompt>

Copy full character text / assembled prompt

Copies a nicely assembled version:

# Character: {title}
## System Prompt
{systemPrompt}
## Author's Note
{authorsNote}
## Scene / Starter
{selectedScene or all scenes}
## Settings Notes
{settingsNotes}

For v1, the card quick-copy can copy only system prompt. In the detail view, include richer copy options if reasonable.

Show a toast after copy:

Copied system prompt
Copied full character prompt

Use ArtifactKeep toast/copy patterns if available.

⸻

Duplicate Behavior

Duplicate should create a full independent copy.

Rules:

* New character ID
* New nested scene IDs
* New gallery image IDs
* New timestamps
* Title becomes Original Title Copy
* Preserve all user-created content
* Copy image files into the new character media directory if using per-character media folders
* Do not merely reference the original media files if that could cause deletion conflicts later
* Show toast: Character duplicated

⸻

Delete Behavior

Deletion must be safe.

Minimum:

* User clicks Delete
* Confirmation modal appears
* Modal clearly names the character
* User must confirm
* Delete removes character from data
* Ideally delete media files too, unless there is a safer soft-delete approach

Preferred:

* Archive first, delete second
* Or at least provide strong confirmation

Confirmation copy:

Title: Delete "{character title}"?
Body: This will permanently remove this character and its local gallery files. This cannot be undone.
Buttons:

* Cancel
* Delete Character

If implementing archive:

* Archive removes from default view
* Archived characters can be restored
* Permanent delete can exist inside archived/detail view

⸻

Settings Screen

Create a settings screen.

Settings should include:

Appearance

* Theme:
    * System
    * Light
    * Dark

Use ArtifactKeep theme infrastructure if available.

Data

* Show local data location if possible
* Button: Open Data Folder
* Button: Create Full Backup
* Button: Restore From Backup

Support

* Ko-fi donate button:
    * URL: https://ko-fi.com/cleantoolsfornow
    * Opens externally in browser
    * Label: Support development on Ko-fi

Privacy

Show a short privacy note:

CharacterKeep stores your data locally on your device. It does not upload your characters, prompts, images, or notes anywhere.

⸻

Full App Backup Export

Implement a full backup export.

User clicks:

Create Full Backup

Behavior:

* Opens native save dialog
* Exports zip file
* Zip includes all characters, settings, and media
* File name suggestion:
    * characterkeep-backup-YYYY-MM-DD.zip

Preferred backup structure:

manifest.json
settings.json
characters/
  <character-id>.json
media/
  characters/
    <character-id>/
      originals/
      thumbnails/

Manifest example:

{
  "app": "CharacterKeep",
  "backupSchemaVersion": 1,
  "createdAt": "",
  "characterCount": 0,
  "mediaCount": 0
}

Show success toast:

Backup created

If backup fails, show a clear error.

Reuse ArtifactKeep backup/export zip logic if it exists.

⸻

Full App Restore

Implement full app restore from backup zip.

User clicks:

Restore From Backup

Behavior:

* Opens native file picker
* User selects a backup zip created by the app
* App validates manifest
* App imports data merge-safely
* App never wipes existing user data by default

Restore conflict rules:

1. Same ID + same content hash:
    * Skip
2. Same ID + different content hash:
    * Import as duplicate/conflict copy with new ID
    * Preserve both versions
3. Different ID + same content hash:
    * Skip or import depending on implementation, but prefer skip duplicate exact content
4. Missing media file:
    * Import character anyway
    * Show warning in restore summary
5. Unknown fields:
    * Preserve when possible
    * Do not crash

Restore summary should show:

* Imported X characters
* Skipped Y unchanged
* Created Z conflict copies
* Restored N media files
* Missing M media files, if any

Important principle:

When in doubt, preserve user data and bring both versions in. Never overwrite or delete existing user data during restore unless the user explicitly chose a destructive option, which we do not need in v1.

⸻

Single Character Import / Export

This is optional for v1, but design the app so it can be added later.

If easy, implement:

* Export selected character as JSON
* Import selected character JSON
* Export selected character as Markdown
* Copy selected character as Markdown

Do not let this delay full-app backup/restore.

⸻

Character Card Compatibility / Future-Proofing

Do not need to implement SillyTavern / Character Card V2 compatibility in v1.

However, design the internal schema so future import/export is possible.

Avoid rigid assumptions that would prevent adding:

* creator name
* character version
* alternate greetings
* first message
* example dialogue
* scenario
* personality
* mes_example
* extensions
* external source metadata

Consider adding an extensions object to preserve future/custom data:

{
  "extensions": {
    "characterkeep": {}
  }
}

Do not overcomplicate the UI for v1.

⸻

UI / Visual Direction

The app should look premium, modern, and polished.

Visual keywords:

* dark mode first, but light mode supported
* clean
* spacious
* soft shadows
* subtle gradients
* premium desktop app
* Apple/Figma-ish polish
* not noisy
* not gamer clutter
* creator-tool aesthetic
* beautiful cards
* smooth hover states
* clear typography
* tasteful empty states
* strong spacing system
* high-quality modal/dialog design

Reuse ArtifactKeep styling where it already looks good, but polish/adjust for the new product.

Important:

* Avoid ugly default browser UI
* Avoid cramped forms
* Avoid tiny text
* Avoid messy buttons everywhere
* Avoid overusing bright colors
* Make destructive buttons visually distinct but not constantly screaming

⸻

App Shell

Use a simple app shell.

Possible nav:

* Characters
* Gallery, optional later
* Settings
* Help/About, optional

For v1, the app can be very focused:

* Characters
* Settings

If ArtifactKeep’s sidebar is reusable, adapt it.

⸻

UX Details

Toasts

Use toasts for:

* Character saved
* Character duplicated
* Character deleted
* Prompt copied
* Backup created
* Restore completed
* Image added
* Image removed

Confirmations

Use confirmation dialogs for:

* Delete character
* Delete scene
* Remove gallery image, if deletion is permanent
* Restore backup, before starting merge

Unsaved changes

If not autosaving, protect against accidental close/dismiss.

Accessibility

* Buttons need labels
* Inputs need labels
* Dialogs should be keyboard dismissible with Escape where safe
* Destructive actions should not trigger accidentally
* Reasonable color contrast
* Cards should be keyboard navigable if practical

⸻

Rust / Tauri Requirements

Use Tauri 2.

Implement native commands as needed for:

* Reading app data
* Writing app data
* Importing images into app media directory
* Creating thumbnails if implemented in backend
* Exporting backup zip
* Restoring backup zip
* Opening data folder
* Opening external Ko-fi link
* Native file dialogs if not handled in frontend

Prefer using existing ArtifactKeep Rust commands where sensible.

Do not introduce unnecessary backend complexity.

⸻

Frontend Requirements

Use the same frontend approach as ArtifactKeep unless there is a strong reason not to.

If ArtifactKeep is vanilla HTML/CSS/JS, keep this new app vanilla unless the current repo already uses something else.

Organize code cleanly.

Suggested modules:

src/
  index.html
  main.js
  data.js
  styles/
    main.css
  modules/
    characters.js
    character-editor.js
    character-cards.js
    character-storage.js
    backup-restore.js
    gallery.js
    settings.js
    theme.js
    toast.js
    dialogs.js

Adapt to the actual repo structure.

⸻

Validation

Character validation:

* Title is required
* Trim empty strings where appropriate
* Tags should not duplicate case-insensitively
* Compatible model names should not duplicate case-insensitively
* Scene title can be empty, but scene body should be allowed to be empty while drafting
* Gallery image references should not break the app if missing

Backup validation:

* Must include manifest
* Must be correct app or compatible backup type
* Must be correct schema version or handled gracefully
* Must not crash on unknown fields
* Must not wipe current data

⸻

Error Handling

Use friendly errors.

Examples:

* Could not save character. Your existing data was not changed.
* Could not create backup. Please choose another location and try again.
* This backup could not be restored because the manifest is missing or invalid.
* Some images were missing from the backup, but the characters were restored.

Log useful details to console/dev logs, but keep user-facing messages simple.

⸻

Performance

The app should handle at least:

* 1,000 characters
* 10,000 scenes total
* Many tags
* Hundreds of gallery images

For v1, simple JSON storage is acceptable if ArtifactKeep already uses it and performance is fine.

Avoid re-rendering the entire app unnecessarily if easy.

Use thumbnails in card grids, not full-size images.

⸻

Acceptance Criteria

The app is done for v1 when:

1. User can create a character with only a title
2. User can add/edit:
    * preview image
    * system prompt
    * author’s note
    * notes
    * scenes
    * tags
    * compatible models
    * settings notes
    * gallery images
3. User can view characters as beautiful cards
4. User can search characters
5. User can filter/sort characters
6. User can click a card and open the character detail/editor
7. User can copy the main system prompt from a card
8. User can copy richer assembled text from the detail view if implemented
9. User can duplicate a character fully
10. User can delete a character with confirmation
11. User can switch light/dark/system theme
12. User can create a full backup zip
13. User can restore from a backup zip merge-safely
14. Restore never wipes or overwrites local user data by default
15. User can open Ko-fi link from settings/about
16. Data persists after app restart
17. Images persist after app restart
18. App uses local app data, not cloud/backend storage
19. UI feels polished and not like a generic browser form
20. Existing ArtifactKeep patterns are reused/adapted where sensible

⸻

Implementation Order

Please work in this order:

Phase 1: Audit and Plan

* Inspect ArtifactKeep
* Write docs/artifactkeep-reuse-audit.md
* Identify reusable files/patterns
* Identify new data model and storage approach
* Confirm implementation plan in a concise markdown file

Phase 2: App Skeleton

* Create/adapt Tauri 2 app shell
* Branding as CharacterKeep
* Characters screen
* Settings screen
* Theme support

Phase 3: Character Data

* Implement character schema
* Implement load/save
* Implement create/edit/delete/duplicate
* Persist data locally

Phase 4: Character UI

* Character card grid
* Empty state
* Search/filter/sort
* Card actions
* Detail/editor view

Phase 5: Scenes, Tags, Models, Settings Notes

* Add scene manager
* Add tags chip input
* Add compatible models chip input
* Add settings notes
* Make search include these fields

Phase 6: Gallery

* Add preview image
* Add gallery images
* Store images locally
* Show thumbnails
* Implement lightbox
* Allow setting cover/preview image

Phase 7: Backup / Restore

* Full app backup zip
* Full app restore
* Merge-safe conflict behavior
* Restore summary

Phase 8: Polish

* Toasts
* Confirm dialogs
* Better empty states
* Better loading/error states
* Visual polish
* Accessibility pass

Phase 9: Testing

Manually test:

* Create character
* Edit character
* Restart app and verify persistence
* Duplicate character
* Delete character
* Add scenes
* Add tags
* Add compatible models
* Add preview image
* Add gallery images
* Backup app
* Restore backup into existing app data
* Restore backup where same IDs exist but content changed
* Restore backup with missing media
* Theme switching
* Ko-fi external link

⸻

Important Guidance

Do not over-engineer v1.

Do not build an account system.
Do not build cloud sync.
Do not build AI generation.
Do not build prompt moderation.
Do not build a marketplace.
Do not build payments.
Do not build plugin support.

This is a local-first character vault.

Make the foundation excellent.

⸻

Tone of Implementation

Be careful, methodical, and reuse proven working code from ArtifactKeep where it makes sense.

Before writing large amounts of new code, check if ArtifactKeep already solved that problem.

Prefer simple, durable code over clever abstractions.

Keep the UX delightful and safe.

The user should feel like:

“This is my private local vault for my characters, and I trust it not to lose my work.”