/* md 낭독기 service worker: offline cache + Android share target */
const VERSION = 'mdr-v3';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon.png', './icons/ainl-mark.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'mdr-share').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function handleShare(req) {
  const fd = await req.formData();
  const f = fd.get('file');
  let text = '', name = '공유된 텍스트';
  if (f && typeof f !== 'string' && f.size) { text = await f.text(); name = f.name || '공유된 파일'; }
  else { text = [fd.get('title'), fd.get('text')].filter(Boolean).join('\n\n'); }
  const c = await caches.open('mdr-share');
  await c.put('./__shared', new Response(text, { headers: { 'x-name': encodeURIComponent(name) } }));
  return Response.redirect('./?shared=1', 303);
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share')) { e.respondWith(handleShare(req)); return; }
  if (req.method !== 'GET') return;
  const same = url.origin === self.location.origin;
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!same && !font) return;
  // pages: network first so updates arrive; everything else: cache first, refreshed in background
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
