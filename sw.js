/* Məktəb Giriş Jurnalı — tətbiq kimi açılış və internetsiz başlanğıc.
   Səhifə həmişə əvvəlcə internetdən alınır (yeniləmələr dərhal gəlsin), internet yoxdursa yaddaşdakı nüsxə açılır.
   Cədvələ gedən sorğulara (POST) toxunulmur. */
'use strict';
const CACHE = 'mgj-1';
const CORE = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
];
const PAGE_WAIT = 5000; // zəif internetdə 5 saniyədən sonra yaddaşdakı səhifə göstərilir

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.add(new Request('./', { cache: 'reload' }));
    // nişanlar və kitabxanalar: alınmasa da quraşdırma dayanmır, ilk istifadədə yaddaşa düşəcək
    await Promise.all(CORE.slice(1).map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null))
      .concat(LIBS.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => null))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('mgj-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const scopeUrl = () => new URL('./', self.registration.scope).href;
// yönləndirilmiş cavab səhifə açılışında xəta verir: təmiz nüsxə düzəldilir
const plain = res => (res.redirected ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res);

async function page(req) {
  const c = await caches.open(CACHE);
  const net = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(async res => {
    if (res && res.ok) await c.put(scopeUrl(), plain(res.clone()));
    return res;
  });
  const slow = new Promise(r => setTimeout(r, PAGE_WAIT, null));
  try {
    const first = await Promise.race([net.catch(() => null), slow]);
    if (first && first.ok) return plain(first);
    const old = await c.match(scopeUrl());
    if (old) { net.catch(() => null); return old; }
    return plain(await net);
  } catch (err) {
    const old = await c.match(scopeUrl());
    if (old) return old;
    throw err;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreVary: true });
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; });
  if (hit) { net.catch(() => null); return hit; }
  return net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { e.respondWith(page(req)); return; }
  const same = url.origin === self.location.origin && url.href.startsWith(self.registration.scope);
  const lib = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if ((same && !url.pathname.endsWith('/sw.js')) || lib) e.respondWith(cacheFirst(req));
});
