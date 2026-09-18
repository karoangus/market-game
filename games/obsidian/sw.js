// =============================================================
//  sw.js — آفلاین‌سازی بازی «ابسیدین» (بدون وابستگی بیرونی)
// =============================================================
const VERSION = 'obsidian-v2';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/engine.js',
  './js/ui.js',
  './js/voice.js',
  './js/sfx.js',
  './js/combat.js',
  './js/state.js',
  './data/story.js',
  './data/story_npc.js',
  './data/characters.js',
  './data/world.js',
  './data/enemies.js',
  './data/items.js',
  './audio/manifest.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && new URL(req.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
