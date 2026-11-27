// Tiny Titan's service worker (written by tools/build_web.py): keeps this build's
// files so the app opens without a connection. A new build comes with a new BUILD:
// it is fetched in the background and used from the next time the app is opened.
const BUILD = '20261127-070600-9a615cfe';
const CACHE = 'tiny-titan-' + BUILD;
const FILES = ["./", "index.html", "index.js", "index.wasm", "index.pck", "index.audio.worklet.js", "index.audio.position.worklet.js", "tt.js", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener('install', (e) => {
  // Every file is asked of the SITE, never of the browser's own short-lived copy: two builds
  // published minutes apart would otherwise leave the newer worker holding the older build's files.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tiny-titan-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // Only this app's own files; calls to the note's script go straight out.
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true })
    .then((hit) => hit || fetch(e.request))));
});
