/* Offline app shell only. No diary data, API responses, secrets or remote backgrounds are cached. */
const RELEASE = '2026.10.26.11';
const ROOT = new URL('./', self.location.href);
const PREFIX = 'timeline-diary-shell:' + ROOT.href + ':';
const CACHE = PREFIX + RELEASE;
const FILES = ['index.html','storage.js','network.js','boot.js','app.js','authors.js','media.js','cards.js','sync.js','archive.js','backup.js','updates.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    async function checkRelease() {
      const response = await fetch(new URL('version.json', ROOT), { cache: 'no-store' });
      if (!response.ok || (await response.json()).version !== RELEASE) throw new Error('Deployment is not ready');
    }
    await checkRelease();
    const loaded = await Promise.all(FILES.map(async file => {
      const url = new URL(file, ROOT);
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok || response.type === 'opaque') throw new Error('Missing app asset');
      if (file === 'index.html' && !(await response.clone().text()).includes('name="diary-version" content="' + RELEASE + '"')) throw new Error('Mismatched HTML');
      if (file.endsWith('.js') && !(await response.clone().text()).startsWith('// diary-release: ' + RELEASE + '\n')) throw new Error('Mismatched JavaScript');
      if (file === 'manifest.webmanifest' && (await response.clone().json()).version !== RELEASE) throw new Error('Mismatched manifest');
      return [url.href, response];
    }));
    await checkRelease();
    const cache = await caches.open(CACHE);
    await Promise.all(loaded.map(([url, response]) => cache.put(url, response)));
    // Updates deliberately wait for user consent. First installation activates normally.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin) return;
  let file = url.pathname === ROOT.pathname ? 'index.html' : FILES.find(file => new URL(file, ROOT).pathname === url.pathname);
  if (!file) return; // version.json, sw.js and every API request stay outside the shell cache.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const stored = await cache.match(new URL(file, ROOT).href);
    if (stored) return stored;
    // Never mix a newer HTML/JS file into this release. Recover via the update mechanism.
    return new Response('离线文件不可用，请联网后重新打开并检查更新。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
