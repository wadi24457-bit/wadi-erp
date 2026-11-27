const CACHE = 'wadi-erp-v6';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'icon.svg', 'manifest.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.hostname.includes('supabase')) return;
  if (e.request.method !== 'GET') return;
  // network-first: always pick up new deployments; fall back to cache offline
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
