// =============================================================
//  test/boot.test.mjs — تست راه‌اندازی و حلقهٔ کامل بازی در DOM
//
//  اجرا:  npm test        (یا: node test/boot.test.mjs)
//  نیاز:   npm i --save-dev jsdom
//
//  چرا این تست وجود دارد؟ باگ اصلی بازی این بود که دکمهٔ «شروع
//  بازی» هیچ کاری نمی‌کرد: init() اول موتور سه‌بعدی را می‌ساخت و
//  اگر هر خطایی می‌داد، هیچ listener‌ای به دکمه‌ها وصل نمی‌شد و
//  صفحه بی‌سروصدا مرده می‌ماند. این تست همان مسیر را در یک DOM
//  واقعی اجرا می‌کند — هم با WebGL و هم بدون آن.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch {
  console.log('SKIP  test/boot.test.mjs — jsdom نصب نیست (npm i --save-dev jsdom)');
  process.exit(0);
}

const rafQueue = [];
let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

// ---------- شبه‌WebGL و canvas (بدون GPU، فقط تا three.js بالا بیاید) ----------
function make2d(canvas) {
  const grad = { addColorStop() {} };
  return new Proxy(
    {
      canvas,
      createLinearGradient: () => grad,
      createRadialGradient: () => grad,
      measureText: () => ({ width: 10 }),
    },
    {
      get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : () => {}),
      set: () => true,
    }
  );
}

function makeGL(canvas) {
  const consts = {};
  const rev = {};
  let n = 0x1000;
  const konst = (name) => {
    if (!(name in consts)) {
      consts[name] = n;
      rev[n] = name;
      n++;
    }
    return consts[name];
  };
  return new Proxy(
    {},
    {
      get(t, k) {
        if (k === 'canvas') return canvas;
        if (typeof k === 'symbol') return undefined;
        if (/^[A-Z0-9_]{2,}$/.test(k)) return konst(k);
        if (k === 'drawingBufferWidth' || k === 'drawingBufferHeight') return 800;
        if (k === 'getParameter')
          return (p) => {
            const name = rev[p] || '';
            if (name === 'VERSION') return 'WebGL 1.0';
            if (name === 'SHADING_LANGUAGE_VERSION') return 'WebGL GLSL ES 1.0';
            if (name === 'SCISSOR_BOX' || name === 'VIEWPORT') return [0, 0, 800, 600];
            if (name.startsWith('MAX_')) return 32;
            return 0;
          };
        if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
        if (k === 'getShaderInfoLog' || k === 'getProgramInfoLog' || k === 'getShaderSource') return () => '';
        if (k === 'getAttribLocation') return () => 0;
        if (k === 'getUniformLocation') return () => ({});
        if (k === 'getActiveAttrib' || k === 'getActiveUniform') return () => ({ name: 'a', size: 1, type: 0x8b50 });
        if (k === 'getShaderPrecisionFormat') return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
        if (k === 'getExtension')
          return (name) =>
            name === 'EXT_texture_filter_anisotropic'
              ? { MAX_TEXTURE_MAX_ANISOTROPY_EXT: konst('MAX_TEXTURE_MAX_ANISOTROPY_EXT') }
              : null;
        if (k === 'getSupportedExtensions') return () => [];
        if (k === 'isContextLost') return () => false;
        if (k === 'getContextAttributes')
          return () => ({ alpha: true, antialias: true, depth: true, stencil: true });
        if (k.startsWith('create')) return () => ({});
        return () => {};
      },
      set: () => true,
    }
  );
}

/**
 * یک محیط مرورگر کامل می‌سازد و ماژول‌های واقعی بازی را در آن اجرا می‌کند.
 * @param {{webgl?: boolean, canvas2d?: boolean, pump?: boolean}} opts
 */
/** PRNG با بذر ثابت — تا تست تصادفی/شانسی نشود */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let previousWindow = null;
async function bootGame(opts = {}) {
  const { webgl = true, canvas2d = true, pump = false } = opts;
  if (previousWindow) {
    try { previousWindow.close(); } catch { /* ignore */ }
  }
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.message || e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<link[^>]*fonts\.[^>]*>/g, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  html = html.replace(/<script type="module"[\s\S]*?<\/script>/g, '');

  const dom = new JSDOM(html, { url: 'http://localhost:8000/', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;

  window.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') return canvas2d ? make2d(this) : null;
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return webgl ? makeGL(this) : null;
    return null;
  };

  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
  globalThis.localStorage = window.localStorage;
  globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
  globalThis.Image = window.Image;
  globalThis.self = window;

  // ساعت و rAF دستی: حلقهٔ بازی را می‌توان بدون انتظار واقعی جلو برد
  let vt = 0;
  rafQueue.length = 0;
  previousWindow = window;
  if (pump) {
    globalThis.requestAnimationFrame = (cb) => rafQueue.push(cb) || rafQueue.length;
    globalThis.cancelAnimationFrame = () => {};
    Object.defineProperty(globalThis, 'performance', {
      value: { now: () => vt, timeOrigin: 0 },
      configurable: true,
      writable: true,
    });
  } else {
    globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  }

  // تصادفی‌های بازی را با بذر ثابت جایگزین کن (نتیجهٔ تست تکرارپذیر شود)
  const realRandom = Math.random;
  Math.random = mulberry32(20260916);

  // ماژول‌های واقعی بازی — بدون cache تا هر boot مستقل باشد
  const stamp = `${Date.now()}-${Math.random()}`;
  const quiet = console.warn; // هشدارهای سه‌بعدی عمدی‌اند؛ خروجی تست شلوغ نشود
  console.warn = () => {};
  let bootError = null;
  try {
    await import(`file://${path.join(ROOT, 'js/main.js')}?t=${stamp}`);
  } catch (e) {
    bootError = e;
  } finally {
    console.warn = quiet;
    Math.random = realRandom;
  }

  const $ = (id) => window.document.getElementById(id);
  const click = (id) => $(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const clickEl = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const tick = async (ms = 10) => new Promise((r) => setTimeout(r, ms));

  async function frames(n, stepMs = 50) {
    for (let i = 0; i < n; i++) {
      vt += stepMs;
      const q = rafQueue.splice(0, rafQueue.length);
      for (const cb of q) cb(vt);
      // واگذارکردن به صف تایمرها تا تایمرهای واقعی (مثل گزارش ۵۰۰ms) اجرا شوند
      if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }

  return { window, $, click, clickEl, tick, frames, errors, bootError };
}

// =============================================================
console.log('۱) دکمهٔ «شروع بازی» با WebGL سالم وارد بازی می‌شود');
{
  const g = await bootGame({ webgl: true });
  check(!g.bootError, `ماژول بازی بدون خطا بارگذاری شد (${g.bootError && g.bootError.message})`);
  check(g.$('start-screen').className === '', 'صفحهٔ شروع در ابتدا دیده می‌شود');
  check(g.$('hud').classList.contains('hidden'), 'HUD در ابتدا پنهان است');
  g.click('btn-new-game');
  await g.tick(60);
  check(g.$('start-screen').classList.contains('hidden'), 'صفحهٔ شروع کنار رفت');
  check(!g.$('hud').classList.contains('hidden'), 'HUD نمایش داده شد');
  check(g.$('money-val').textContent === '۱۰۰ $', `سرمایه ۱۰۰ دلار است (${g.$('money-val').textContent})`);
  check(g.$('hud-day').textContent === '📅 روز ۱', 'روز ۱ نمایش داده می‌شود');
  check(g.errors.length === 0, `بدون خطای کنسول (${g.errors.join(' | ') || '—'})`);
}

console.log('۲) بدون WebGL هم بازی شروع می‌شود (نه دکمهٔ مرده)');
{
  const g = await bootGame({ webgl: false });
  check(!g.bootError, `ماژول بازی بدون خطا بارگذاری شد (${g.bootError && g.bootError.message})`);
  g.click('btn-new-game');
  await g.tick(60);
  check(g.$('start-screen').classList.contains('hidden'), 'صفحهٔ شروع کنار رفت (قبلاً اینجا گیر می‌کرد)');
  check(!g.$('hud').classList.contains('hidden'), 'HUD نمایش داده شد');
  check(g.$('money-val').textContent === '۱۰۰ $', 'سرمایه ۱۰۰ دلار است');
  check(!!g.window.document.getElementById('engine-error'), 'هشدار «گرافیک سه‌بعدی در دسترس نیست» نمایش داده شد');
}

console.log('۳) بدون canvas هم بازی شروع می‌شود');
{
  const g = await bootGame({ webgl: true, canvas2d: false });
  check(!g.bootError, `ماژول بازی بدون خطا بارگذاری شد (${g.bootError && g.bootError.message})`);
  g.click('btn-new-game');
  await g.tick(60);
  check(g.$('start-screen').classList.contains('hidden'), 'صفحهٔ شروع کنار رفت');
  check(!g.$('hud').classList.contains('hidden'), 'HUD نمایش داده شد');
}

console.log('۴) حلقهٔ کامل یک روز: خرید → قیمت‌گذاری → روز → گزارش → روز بعد');
{
  const g = await bootGame({ webgl: false, pump: true }); // حالت بدون‌گرافیک سریع‌تر است
  check(!g.bootError, `ماژول بازی بدون خطا بارگذاری شد (${g.bootError && g.bootError.message})`);
  g.click('btn-new-game');
  await g.tick(30);

  // خرید ۸ نان از تأمین‌کننده (از مسیر واقعی کلیک روی DOM)
  g.click('btn-supplier');
  await g.tick(20);
  check(g.$('sheet-supplier').classList.contains('open'), 'پنل تأمین‌کننده باز شد');
  const breadBuy = g.window.document.querySelector('[data-sup="buy"][data-id="bread"]');
  check(!!breadBuy, 'دکمهٔ خرید نان در پنل هست');
  for (let i = 0; i < 8; i++) {
    // پنل بعد از هر خرید دوباره رندر می‌شود، پس دکمه را دوباره پیدا کن
    g.clickEl(g.window.document.querySelector('[data-sup="buy"][data-id="bread"]'));
  }
  await g.tick(30);
  check(g.$('money-val').textContent === '۶۸ $', `۸ نان × ۴$ = ۳۲$ خرج شد، مانده ۶۸ (${g.$('money-val').textContent})`);
  check(JSON.parse(g.window.localStorage.getItem('market-game-save-v1')).inventory.bread === 8, 'موجودی نان در ذخیره = ۸');

  // قیمت‌گذاری: دو پله پایین‌تر = دقیقاً قیمت بازار (۴) → تقاضای «عالی»
  g.click('btn-pricing');
  await g.tick(20);
  const minus = g.window.document.querySelector('[data-price="step"][data-id="bread"][data-d="-1"]');
  check(!!minus, 'دکمهٔ کاهش قیمت هست');
  g.clickEl(g.window.document.querySelector('[data-price="step"][data-id="bread"][data-d="-1"]'));
  g.clickEl(g.window.document.querySelector('[data-price="step"][data-id="bread"][data-d="-1"]'));
  await g.tick(20);
  const priceState = JSON.parse(g.window.localStorage.getItem('market-game-save-v1'));
  check(priceState.salePrice.bread === priceState.market.bread, 'قیمت فروش نان = قیمت بازار (۴)');

  // شروع روز
  g.click('btn-start-day');
  await g.tick(20);
  check(!g.$('day-progress').classList.contains('hidden'), 'نوار پیشرفت روز نمایش داده شد');

  // جلو بردن زمان تا پایان روز
  let opened = false;
  for (let i = 0; i < 200 && !opened; i++) {
    await g.frames(60);
    opened = g.$('sheet-report').classList.contains('open');
  }
  check(opened, 'گزارش پایان روز باز شد');
  const report = g.$('report-body').textContent;
  check(/مشتری‌ها/.test(report), 'گزارش شامل تعداد مشتری‌هاست');
  check(/سود خالص/.test(report), 'گزارش شامل سود خالص است');
  const saved = JSON.parse(g.window.localStorage.getItem('market-game-save-v1'));
  check(saved.dayStats.customers > 0, `${saved.dayStats.customers} مشتری وارد شد`);
  check(saved.inventory.bread < 8, `از موجودی نان کم شد (${saved.inventory.bread} مانده)`);
  check(saved.dayStats.revenue === (8 - saved.inventory.bread) * 4, 'درآمد = تعداد فروش × قیمت ۴');
  check(saved.money === 68 + saved.dayStats.revenue, `سرمایه به‌روز شد (${saved.money})`);

  // روز بعد
  g.click('btn-next-day');
  await g.tick(30);
  check(g.$('hud-day').textContent === '📅 روز ۲', `روز ۲ شد (${g.$('hud-day').textContent})`);
  check(!g.$('sheet-report').classList.contains('open'), 'گزارش بسته شد');
  check(JSON.parse(g.window.localStorage.getItem('market-game-save-v1')).day === 2, 'روز ۲ ذخیره شد');
}

console.log('۵) Service Worker فایل‌های اپ را از شبکه می‌گیرد (نه کش قدیمی)');
{
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  let fetchHandler = null;
  const cacheStore = new Map();
  const fakeCache = {
    match: async (r) => cacheStore.get(typeof r === 'string' ? r : r.url) || undefined,
    put: async (r, res) => cacheStore.set(typeof r === 'string' ? r : r.url, res),
    add: async () => {},
  };
  let networkCalls = 0;
  const listeners = {};
  const swSelf = {
    location: new URL('http://localhost:8000/sw.js'),
    addEventListener: (t, f) => (listeners[t] = f),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  globalThis.self = swSelf;
  globalThis.caches = {
    open: async () => fakeCache,
    keys: async () => [],
    match: async () => undefined,
  };
  globalThis.fetch = async (req) => {
    networkCalls++;
    return { ok: true, status: 200, clone: () => ({ ok: true, status: 200 }) };
  };
  await import(`file://${path.join(ROOT, 'sw.js')}?t=${Date.now()}`);
  check(typeof listeners.fetch === 'function', 'sw.js هندلر fetch ثبت می‌کند');

  // یک درخواست برای فایل اپ که از قبل در کش قدیمی است
  const url = 'http://localhost:8000/js/main.js';
  cacheStore.set(url, { ok: true, status: 200, stale: true });
  let responded = null;
  await new Promise((resolve) => {
    listeners.fetch({
      request: { method: 'GET', url, mode: 'cors' },
      respondWith: (p) => {
        responded = p;
        resolve();
      },
    });
  });
  const res = await responded;
  check(networkCalls === 1, 'برای فایل اپ به شبکه رفت (network-first)');
  check(!res.stale, 'پاسخ نسخهٔ تازه است، نه کش قدیمی');
  check(/VERSION = 'market-game-v\d+'/.test(swSrc), 'VERSION در sw.js تعریف شده');
}

console.log('۶) watchdog در index.html — صفحهٔ مرده هیچ‌وقت بی‌سروصدا نمی‌ماند');
{
  // ۶-۱) بازکردن با file:// → پیام روشن (ماژول‌های ES آنجا کار نمی‌کنند)
  const fileHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const vc1 = new VirtualConsole();
  const d1 = new JSDOM(fileHtml, {
    url: 'file:///tmp/index.html',
    runScripts: 'dangerously',
    virtualConsole: vc1,
  });
  const boot1 = d1.window.document.getElementById('boot-error');
  check(!boot1.classList.contains('hidden'), 'در file:// پیام خطا نمایش داده می‌شود');
  check(/file:\/\//.test(boot1.textContent), 'پیام، علت file:// را توضیح می‌دهد');
  check(!!d1.window.document.getElementById('boot-reload'), 'دکمهٔ «تلاش دوباره» وجود دارد');

  // ۶-۲) وقتی بازی آماده شده باشد، watchdog پیام الکی نمی‌دهد
  const vc2 = new VirtualConsole();
  const d2 = new JSDOM(fileHtml, {
    url: 'http://localhost:8000/',
    runScripts: 'dangerously',
    virtualConsole: vc2,
  });
  d2.window.__MG_READY__ = true; // یعنی main.js بالا آمده
  const boot2 = d2.window.document.getElementById('boot-error');
  check(boot2.classList.contains('hidden'), 'در حالت سالم، پیام خطا پنهان است');
  await new Promise((r) => setTimeout(r, 6300));
  check(boot2.classList.contains('hidden'), 'watchdog بعد از ۶ ثانیه هم پیام الکی نشان نمی‌دهد');

  // ۶-۳) اگر بازی بالا نیاید، watchdog بعد از ۶ ثانیه خبر می‌دهد
  const vc3 = new VirtualConsole();
  const d3 = new JSDOM(fileHtml, {
    url: 'http://localhost:8000/',
    runScripts: 'dangerously',
    virtualConsole: vc3,
  });
  const boot3 = d3.window.document.getElementById('boot-error');
  check(boot3.classList.contains('hidden'), 'در ابتدا پیام خطا پنهان است');
  await new Promise((r) => setTimeout(r, 6300));
  check(!boot3.classList.contains('hidden'), 'اگر بازی بالا نیاید، بعد از ۶ ثانیه پیام خطا می‌آید');
  check(/بارگذاری نشدند/.test(boot3.textContent), 'پیام علت و راه‌حل را می‌گوید');
}

console.log('');
console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed) process.exit(1);
