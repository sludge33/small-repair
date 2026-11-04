// Offline support.
// Pages are fetched network-first, so a new deploy is picked up at once; the cached copy is only
// for when you're offline. Hashed build files under assets/ never change, so they're cache-first.
const CACHE = 'small-repairs-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const stale = (await caches.keys()).filter((k) => k !== CACHE);
      await Promise.all(stale.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // Revalidate with the server rather than trusting the browser's HTTP cache, which can hold an old page for minutes.
    const res = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || (await cache.match('./index.html')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(url.pathname.includes('/assets/') ? cacheFirst(e.request) : networkFirst(e.request));
});
