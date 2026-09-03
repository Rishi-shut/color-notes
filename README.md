# Color Notes Web

A fast, local-first notes PWA that works online and offline.

## What is stored

Notes, checklists, colors, reminders, archive state, and trash are stored in IndexedDB on the current device. Product data is not sent to a server. Theme and sort preferences use local storage.

## Development

```bash
npm run dev
npm run build
npm run build:static
```

Open the site once while online to cache the application shell. After that, the service worker and IndexedDB keep the full notes experience available offline.
