// =============================================================
//  sw.js — Service Worker برای PWA (آفلاین + نصب‌پذیری)
//
//  ⚠️ مهم: استراتژی کش فایل‌های خودِ اپ «اول شبکه» (network-first)
//     است، نه «اول کش». با cache-first، هر اصلاحی که در کد انجام
//     می‌شد تا ابد پشت کش قدیمی پنهان می‌ماند و بازیکن همیشه
//     نسخهٔ خرابِ قبلی را می‌دید. حالا:
//       - آنلاین  → همیشه فایل تازه از سرور (اصلاحات فوراً می‌رسند)
//       - آفلاین  → از کش خوانده می‌شود (بازی آفلاین هم کار می‌کند)
//
//  - ناوبری (باز کردن صفحه): network-first با fallback به index.html
//  - فونت وب (گوگل‌فونت): stale-while-revalidate
//
//  ➕ هنگام تغییر فایل‌های اپ، VERSION را تغییر بده تا کش‌های قدیمی
//     پاک شوند (در activate همهٔ کش‌های versionهای قبل حذف می‌شوند).
// =============================================================
const VERSION = 'market-game-v9';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './vendor/three/build/three.module.js',
  './js/util.js',
  './js/config.js',
  './js/economy.js',
  './js/state.js',
  './js/anim.js',
  './js/layout.js',
  './js/nav.js',
  './js/person.js',
  './js/sound.js',
  './js/story.js',
  './js/scene3d.js',
  './js/fps.js',
  './js/fullscreen.js',
  './js/customers.js',
  './js/ui.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll با یک ۴۰۴ کل نصب را شکست می‌دهد؛ تک‌تک کش می‌کنیم
      .then((cache) => Promise.all(APP_SHELL.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('market-game-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ۱) ناوبری: اول شبکه، اگر آفلاین بود index.html کش‌شده
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // ۲) فایل‌های خود اپ: network-first (اصلاحات فوراً به بازیکن می‌رسند)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((hit) => hit || new Response('offline', { status: 503, statusText: 'Offline' }))
        )
    );
    return;
  }

  // ۳) منابع بیرونی (فونت و…): stale-while-revalidate
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
