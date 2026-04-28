# CharacterKeep Guide

CharacterKeep is a private, local-first vault for roleplay characters. It stores prompts, author's notes, private notes, starter scenes, tags, compatible model labels, settings notes, collections, and gallery images on your computer.

## Privacy and Local Data

CharacterKeep is offline-only. It does not create accounts, upload characters, send analytics, or call network services. Use Settings -> Open Data Folder to inspect the active app data directory.

## Gallery Images

Imported images are copied into the app data directory under `media/characters/<character-id>/`. Character records keep local file references instead of base64 blobs. Deleting a character permanently removes that character's app-managed media folder.

## Backup and Restore

Full backups are ZIP files with a manifest, settings, collections, character JSON, and media. Restore is merge-safe: existing characters are not deleted, exact duplicates are skipped, and same-ID conflicts import as restored copies. CharacterKeep shows a preflight summary before restore mutates data.

## Character Card PNG Import

Import Character Card reads common PNG text chunks such as `chara` and `ccv3`. When valid metadata is found, CharacterKeep creates a character, maps common fields conservatively, copies the PNG into the new character gallery, and sets it as cover art. PNGs without readable character metadata are reported as skipped instead of creating broken records.

## Single Character Export

The editor Export button can save a CharacterKeep backup ZIP, Markdown, or TXT. Markdown and TXT exclude private notes by default. Enable the private-notes option only when you intentionally want to include them.

## Collections

Collections are lightweight groups for characters. Deleting a collection does not delete characters; assigned characters move back to Unfiled. Use the sidebar to view All Characters, Unfiled, or a specific collection.

## Bulk Actions

Use Select to choose multiple characters. Bulk actions can archive, unarchive, favorite, unfavorite, add a tag, move to a collection, or permanently delete with a confirmation.

## Keyboard Shortcuts

- `Esc`: close dialogs or the editor.
- `Enter` on a focused character card: open the editor.

## Support

Use Settings -> Support development on Ko-fi if you want to support CharacterKeep development.
