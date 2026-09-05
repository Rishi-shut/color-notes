# Color Notes Web

A fast, encrypted notes PWA that works online, offline, and across devices.

Live website: https://color-notes-mauve.vercel.app/

## Accounts and privacy

Accounts use a unique username and password—no email address is required. The password never leaves the device and cannot be reset. It derives the key that encrypts notes before they sync, so a forgotten password means the encrypted notes cannot be recovered.

An encrypted copy of the vault is cached in IndexedDB for offline access. After a successful sign-in, a non-extractable device key protects the remembered unlock and authentication verifier in IndexedDB—never the password itself. The app therefore stays unlocked across reloads, browser restarts, and online/offline changes, renews an expired server session automatically, and syncs pending changes after reconnection. Choosing **Sign out** removes the remembered unlock from that device. Theme and sort preferences use local storage.

## Note tools

- Text notes, ruled notebook notes, checklists, and extendable freehand drawings with pen colors, a distinct eraser, Move/Scroll mode, brush sizes, undo, and clear
- Eight complete, contrast-checked themes that recolor the app and every note with a top-left wave transition
- Multi-select actions for copy, duplicate, favorite, trash, restore, and permanent deletion
- Automatic safe web links, compact front-page previews, search, sorting, pinning, reminders, trash, import, and export

Archive is intentionally removed. Notes from older versions that were archived are returned safely to All Notes.

## Development

```bash
npm run dev
npm run build
npm run build:static
```

Open the site once while online to cache the complete application shell. After that, the service worker and encrypted local vault keep the notes experience available offline.
