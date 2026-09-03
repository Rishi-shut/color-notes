const CACHE = 'color-notes-v7';
const ROOT = new URL('./', self.location.href).pathname;
const asset = (name) => new URL(name, self.registration.scope).pathname;
const SHELL = [ROOT, asset('manifest.webmanifest'), asset('icon-192.svg'), asset('icon-512.svg')];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = await fetch(ROOT, { cache: 'reload' });
    if (!page.ok) throw new Error('Could not cache the app shell.');
    await cache.put(ROOT, page.clone());
    const html = await page.text();
    const discovered = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], self.registration.scope))
      .filter((url) => url.origin === self.location.origin)
      .map((url) => url.pathname);
    await cache.addAll([...new Set([...SHELL.slice(1), ...discovered])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then((cache) => cache.put(ROOT, copy))); return response; }).catch(() => caches.match(ROOT)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy))); } return response; })));
});
