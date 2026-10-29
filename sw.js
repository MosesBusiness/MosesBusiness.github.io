// הון שקט service worker · 028b02ef3b
const CACHE = 'hon-shaket-028b02ef3b';
const SHELL = ["/","/index.html","/app.af621cd92a.js","/app.6a2095571c.css","/react.production.min.js","/react-dom.production.min.js","/manifest.webmanifest","/icon-any-192.png","/icon-any-512.png","/apple-touch-icon.png","/favicon-64.png","/fonts/f0.woff2","/fonts/f1.woff2","/fonts/f2.woff2","/fonts/f3.woff2","/fonts/f4.woff2","/fonts/f5.woff2"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('hon-shaket-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/')) return;
  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('/feed.json') || url.pathname === '/';
  if (networkFirst) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? '/' : req, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? '/' : req)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
