/* Mode hors ligne : toute l'application est gardée en cache sur la tablette */
const VERSION = 'pv-gauer-1.3.0';
const FILES = [
  './', 'index.html', 'app.js', 'schema.js', 'pdf.js', 'excel.js', 'vendor/xlsx.mini.min.js', 'manifest.webmanifest',
  'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js',
  'fonts/source-sans-3-latin-400-normal.woff2', 'fonts/source-sans-3-latin-400-italic.woff2',
  'fonts/source-sans-3-latin-600-normal.woff2', 'fonts/source-sans-3-latin-700-normal.woff2',
  'fonts/barlow-semi-condensed-latin-500-normal.woff2', 'fonts/barlow-semi-condensed-latin-600-normal.woff2',
  'fonts/barlow-semi-condensed-latin-700-normal.woff2',
  'icons/logo-gauer.jpg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
