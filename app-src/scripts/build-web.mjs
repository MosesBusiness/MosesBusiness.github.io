// Builds the standalone web app into dist-web/site/ (GitHub Pages root, e.g. https://mosesbusiness.github.io/).
// BASE=/sub/ node scripts/build-web.mjs builds for a sub-path instead.
// Everything is self-hosted (React, fonts, SheetJS) so the app works offline and under a strict CSP.
// feed.json is data written daily by the research run; the build never overwrites it unless --seed <file>.
import * as esbuild from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'dist-web/site';
const BASE = process.env.BASE || '/';
fs.rmSync('dist-web', { recursive: true, force: true });
fs.mkdirSync(OUT + '/fonts', { recursive: true });

const globals = {
  name: 'umd-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom\/client|-dom)?$/ }, a => ({ path: a.path, namespace: 'g' }));
    b.onLoad({ filter: /.*/, namespace: 'g' }, a => ({ contents: a.path === 'react' ? 'module.exports = window.React' : 'module.exports = window.ReactDOM', loader: 'js' }));
  },
};
const r = await esbuild.build({
  entryPoints: ['src/main.tsx'], bundle: true, format: 'iife', write: false, minify: true,
  target: ['es2020', 'safari15'], jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  define: { __WEB__: 'true', __BASE__: JSON.stringify(BASE) }, plugins: [globals], legalComments: 'none', charset: 'utf8',
});
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const js = r.outputFiles[0].text;
const css = fs.readFileSync('web/fonts.css', 'utf8') + '\n' + fs.readFileSync('src/styles.css', 'utf8');
const jsName = `app.${hash(js)}.js`, cssName = `app.${hash(css)}.css`;
fs.writeFileSync(path.join(OUT, jsName), js);
fs.writeFileSync(path.join(OUT, cssName), css);

const copy = (from, to) => fs.copyFileSync(from, path.join(OUT, to));
copy('node_modules/react/umd/react.production.min.js', 'react.production.min.js');
copy('node_modules/react-dom/umd/react-dom.production.min.js', 'react-dom.production.min.js');
copy('node_modules/xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js');
for (const f of fs.readdirSync('web/fonts')) copy(`web/fonts/${f}`, `fonts/${f}`);
for (const f of fs.readdirSync('web/icons')) copy(`web/icons/${f}`, f);

const manifest = {
  name: 'הון שקט', short_name: 'הון שקט', description: 'הכנסות, הוצאות, חיסכון והשקעות. מוצפן, פרטי, בעברית.',
  lang: 'he', dir: 'rtl', start_url: BASE, scope: BASE, id: BASE, display: 'standalone', orientation: 'portrait',
  background_color: '#0a1416', theme_color: '#0a1416', categories: ['finance', 'productivity'],
  icons: [
    { src: 'icon-any-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-any-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [{ name: 'תנועה חדשה', url: BASE + '#add', icons: [{ src: 'icon-any-192.png', sizes: '192x192' }] }],
};
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(manifest, null, 1));

const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.github.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<title>הון שקט</title>
<meta name="description" content="הכנסות, הוצאות, חיסכון והשקעות. מוצפן ופרטי.">
<meta name="theme-color" content="#0a1416">
<meta name="color-scheme" content="dark light">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="הון שקט">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="${BASE}manifest.webmanifest">
<link rel="icon" type="image/png" href="${BASE}favicon-64.png">
<link rel="apple-touch-icon" href="${BASE}apple-touch-icon.png">
<link rel="preload" href="${BASE}fonts/f2.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${BASE}${cssName}">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>
</head>
<body>
<div id="root"></div>
<noscript>הון שקט צריך JavaScript כדי לפעול.</noscript>
<script src="${BASE}react.production.min.js"></script>
<script src="${BASE}react-dom.production.min.js"></script>
<script src="${BASE}${jsName}"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// Service worker: the app shell is cached for offline use; HTML and feed.json are network-first.
const shell = ['', 'index.html', jsName, cssName, 'react.production.min.js', 'react-dom.production.min.js', 'manifest.webmanifest',
  'icon-any-192.png', 'icon-any-512.png', 'apple-touch-icon.png', 'favicon-64.png', ...fs.readdirSync('web/fonts').map(f => `fonts/${f}`)].map(p => BASE + p);
const version = hash(js + css + html);
const sw = `// הון שקט service worker · ${version}
const CACHE = 'hon-shaket-${version}';
const SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('hon-shaket-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('${BASE}')) return;
  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('/feed.json') || url.pathname === '${BASE}';
  if (networkFirst) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? '${BASE}' : req, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? '${BASE}' : req)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
`;
fs.writeFileSync(path.join(OUT, 'sw.js'), sw);

// Static-host extras: keep the whole site out of search engines, and let GitHub Pages serve files as-is.
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'README.md'), '# הון שקט\n\nאפליקציה אישית פרטית. הנתונים של המשתמש מוצפנים ונשמרים רק במכשיר שלו; אין כאן שום מידע אישי.\n`feed.json` מתעדכן אוטומטית כל בוקר מסחר.\n');

const seedIdx = process.argv.indexOf('--seed');
if (seedIdx > 0) fs.copyFileSync(process.argv[seedIdx + 1], path.join(OUT, 'feed.json'));

const size = fs.readdirSync(OUT, { recursive: true }).reduce((a, f) => { const p = path.join(OUT, f); return a + (fs.statSync(p).isFile() ? fs.statSync(p).size : 0); }, 0);
console.log(`${OUT}: ${jsName} ${cssName} · sw ${version} · ${(size / 1024).toFixed(0)} KB total`);
