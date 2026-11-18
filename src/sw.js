/**
 * MINHO11 service worker: network first, always. Online it changes nothing (fresh pages, fresh data);
 * offline (a pitch without signal) it shows the last pages and data this phone saw. Never touches /admin or /api.
 */
const CACHE = 'minho11-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
      return response;
    } catch (error) {
      const cached = await caches.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
      // The live data says it is a saved copy, so the page can tell the visitor there is no signal.
      if (cached && url.pathname === '/data/competition.json') { const headers = new Headers(cached.headers); headers.set('X-MINHO11-Source', 'offline'); return new Response(cached.body, { status: 200, headers }); }
      if (cached) return cached;
      if (event.request.mode === 'navigate') return (await caches.match('/')) ?? Response.error();
      throw error;
    }
  })());
});
