// =============================================================
//  test/borj_ui.test.mjs — تست رابط بازی «دویدن تا برج»
//  اجرا: node test/borj_ui.test.mjs
//
//  پرونده‌های رابط (index.html، styles.css، manifest، sw.js) و بعد در
//  یک DOM واقعی (jsdom) خودِ بازی راه می‌اندازد: انتخاب مرحله، پرش با
//  دکمه‌های لمسی، توقف، برد و ذخیرهٔ پیشرفت.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'games/borj');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch {
  console.log('SKIP  test/borj_ui.test.mjs — jsdom نصب نیست (npm i --save-dev jsdom)');
  process.exit(0);
}

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.log('❌ ' + msg);
  }
}
const section = (t) => console.log('\n— ' + t + ' —');

// ---------------------------------------------------------------
section('پرونده‌های رابط');
// ---------------------------------------------------------------
const need = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'js/main.js',
  'js/render.js',
  'js/audio.js',
  'js/progress.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
for (const f of need) check(fs.existsSync(path.join(GAME, f)), `پروندهٔ ${f} هست`);

const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
check(/<canvas id="game"/.test(html), 'بوم بازی در صفحه هست');
check(/manifest\.webmanifest/.test(html) && /styles\.css/.test(html), 'manifest و css به صفحه وصل‌اند');
check(/js\/main\.js/.test(html), 'ماژول main.js به صفحه وصل است');
check(/dir="rtl"/.test(html) && /lang="fa"/.test(html), 'صفحه فارسی و راست‌به‌چپ است');
for (const id of ['level-grid', 'btn-pause', 'btn-left', 'btn-right', 'btn-jump', 'ov-clear', 'ov-over', 'ov-pause', 'btn-sound'])
  check(html.includes(`id="${id}"`), `عنصر ${id} در صفحه هست`);

const man = JSON.parse(fs.readFileSync(path.join(GAME, 'manifest.webmanifest'), 'utf8'));
check(man.lang === 'fa' && man.dir === 'rtl', 'manifest فارسی و راست‌به‌چپ است');
check(man.display === 'fullscreen' || man.display === 'standalone', 'حالت نمایش اپ در manifest درست است');
check(Array.isArray(man.icons) && man.icons.length >= 2, 'manifest چند آیکن دارد');
check(man.icons.every((i) => fs.existsSync(path.join(GAME, i.src))), 'فایل همهٔ آیکن‌های manifest موجود است');

const sw = fs.readFileSync(path.join(GAME, 'sw.js'), 'utf8');
const shell = [...sw.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]).filter((s) => s !== './');
check(shell.length > 5, 'فهرست آفلاین sw.js پر است');
check(shell.every((p) => fs.existsSync(path.join(GAME, p))), 'همهٔ پرونده‌های فهرست آفلاین sw.js وجود دارند');
const boot = fs.readFileSync(path.join(GAME, 'js/main.js'), 'utf8');
const swSw = sw.replace(/[^A-Za-z0-9]/g, '');
check(/borj-v\d/.test(sw), 'نسخهٔ کش در sw.js نوشته شده');

// ---------------------------------------------------------------
section('راه‌اندازی در DOM');
// ---------------------------------------------------------------
const NUM = { 1: 'globalAlpha', 2: 'lineWidth' };
function make2d(canvas) {
  const grad = { addColorStop() {} };
  const base = {
    canvas,
    globalAlpha: 1,
    lineWidth: 1,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(base, {
    get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : () => {}),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
}

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.message || e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html.replace(/<script type="module"[\s\S]*?<\/script>/g, ''), {
  url: 'http://localhost:8000/games/borj/index.html',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function (type) {
  return type === '2d' ? make2d(this) : null;
};

globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
globalThis.localStorage = window.localStorage;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.self = window;

const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => rafQueue.push(cb) || rafQueue.length;
globalThis.cancelAnimationFrame = () => {};

let bootError = null;
try {
  await import(`file://${path.join(GAME, 'js/main.js')}?t=${Date.now()}`);
} catch (e) {
  bootError = e;
}
check(!bootError, 'ماژول main.js بدون خطا اجرا شد' + (bootError ? ` — ${bootError.message}` : ''));
check(!errors.length, 'هیچ خطای DOM رخ نداد' + (errors.length ? ` — ${errors[0]}` : ''));
check(window.__BORJ_READY__ === true, 'پرچم آمادگی بازی ست شده است');
check(!!window.BORJ && !!window.BORJ.levels, 'درگاه BORJ برای تست در دسترس است');

const $ = (id) => window.document.getElementById(id);
const click = (id) => $(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const pointer = (id, type) => {
  const el = $(id);
  const ev = new window.Event(type, { bubbles: true });
  ev.pointerId = 1;
  ev.preventDefault = () => {};
  el.dispatchEvent(ev);
};
const hidden = (id) => $(id).classList.contains('hidden');

check(!hidden('screen-title'), 'صفحهٔ آغاز باز است');
check(hidden('screen-game'), 'صفحهٔ بازی در آغاز پنهان است');
check($('level-grid').querySelectorAll('.lvl-card').length === window.BORJ.levels.length, 'به تعداد مرحله‌ها کارت ساخت شده');
check($('level-grid').querySelectorAll('.lvl-card:disabled').length === window.BORJ.levels.length - 1, 'در آغاز فقط مرحلهٔ اول باز است');
check($('btn-sound').textContent.includes('صدا'), 'دکمهٔ صدا برچسب دارد');

// بازکردن راهنما و برگشتن
click('btn-howto');
check(!hidden('screen-howto'), 'صفحهٔ راهنما باز می‌شود');
click('btn-back-title');
check(!hidden('screen-title'), 'از راهنما به فهرست برمی‌گردیم');

// روشن/خاموش کردن صدا (در نود WebAudio نیست؛ نباید خطا بدهد)
const soundBefore = $('btn-sound').textContent;
click('btn-sound');
check($('btn-sound').textContent !== soundBefore, 'دکمهٔ صدا وضعیت را عوض می‌کند');
click('btn-sound');

// ---------------------------------------------------------------
section('بازی‌کردن با رابط');
// ---------------------------------------------------------------
$('level-grid').querySelectorAll('.lvl-card')[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check(!hidden('screen-game'), 'با انتخاب مرحله، صفحهٔ بازی باز می‌شود');
const B = window.BORJ;
check(!!B.game, 'نمونهٔ بازی ساخته شد');
check(B.index === 0, 'مرحلهٔ اول انتخاب شد');
check($('hud-level').textContent.includes('دهکده'), 'نام مرحله در نوار اطلاعات هست');
check($('hud-hearts').textContent.includes('❤️'), 'جان‌ها در نوار اطلاعات هست');
check($('hud-coins').textContent.includes('🪙'), 'شمار سکه‌ها در نوار اطلاعات هست');

// چند گام بی‌حرکت تا بازیکن روی زمین بنشیند
for (let i = 0; i < 60; i++) B.tick(1 / 60);
check(B.game.player.onGround, 'بازیکن در آغاز روی زمین می‌ایستد');

// پرش با دکمهٔ لمسی
const y0 = B.game.player.y;
pointer('btn-jump', 'pointerdown');
check(B.keys.jump === true, 'فشردن دکمهٔ لمسی کلید پرش را روشن می‌کند');
for (let i = 0; i < 8; i++) B.tick(1 / 60);
check(B.game.player.y < y0 - 4, 'دکمهٔ لمسی پرش بازیکن را بالا می‌برد');
pointer('btn-jump', 'pointerup');
check(B.keys.jump === false, 'رهاکردن دکمه پرش را قطع می‌کند');
for (let i = 0; i < 150; i++) B.tick(1 / 60);
check(B.game.player.onGround, 'بازیکن به زمین برمی‌گردد');

// دویدن به راست با کلید
const x0 = B.game.player.x;
B.keys.right = true;
for (let i = 0; i < 30; i++) B.tick(1 / 60);
check(B.game.player.x > x0 + 5, 'کلید راست بازیکن را جلو می‌برد');
B.keys.right = false;
for (let i = 0; i < 60; i++) B.tick(1 / 60);

// توقف و ادامه
click('btn-pause');
check(!hidden('ov-pause'), 'روپوش توقف باز می‌شود');
const xp = B.game.player.x;
B.keys.right = true;
for (let i = 0; i < 60; i++) B.tick(1 / 60);
check(B.game.player.x === xp, 'در حالت توقف بازی جلو نمی‌رود');
click('btn-resume');
check(hidden('ov-pause'), 'با ادامه، روپوش توقف بسته می‌شود');
for (let i = 0; i < 60; i++) B.tick(1 / 60);
check(B.game.player.x > xp, 'بعد از ادامه دوباره حرکت می‌کند');
B.keys.right = false;
// برگرداندن بازیکن و مرحله به حالِ تازه، تا بخش بعدی از بخت و تصادف اثر نگیرد
click('btn-restart');
check(B.game.player.x < 28 * 4, 'شروع دوبارهٔ مرحله بازیکن را به آغاز برمی‌گرداند');

// ---------------------------------------------------------------
section('برد، ستاره و پیشرفت');
// ---------------------------------------------------------------
const TILE = 28;
/** همان بازیکن خودکار test/borj.test.mjs */
function botWants(g) {
  const p = g.player;
  if (!p.onGround) return false;
  const ahead1 = Math.floor((p.x + p.w + 4) / TILE);
  const ahead2 = Math.floor((p.x + p.w + TILE + 6) / TILE);
  const bodyTy = Math.floor((p.y + p.h - 4) / TILE);
  const feetTy = Math.floor((p.y + p.h + 2) / TILE);
  const footRow = Math.floor((p.y + p.h) / TILE);
  const groundUnder = (tx) => {
    for (let ty = footRow; ty < g.h; ty++) if (g.solidAt(tx, ty)) return ty;
    return -1;
  };
  if (g.solidAt(ahead1, bodyTy) || g.solidAt(ahead1, bodyTy - 1)) return true;
  let pitW = 0;
  for (let d = 0; d < 4; d++) {
    if (groundUnder(ahead1 + d) < 0) pitW = d + 1;
    else break;
  }
  if (groundUnder(ahead1) < 0) return true;
  else if (groundUnder(ahead1 + 1) < 0 && pitW >= 2) return true;
  for (const tx of [ahead1, ahead2])
    for (let ty = bodyTy - 1; ty <= feetTy + 1; ty++) if (g.hurtAt(tx, ty)) return true;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const dx = e.x - (p.x + p.w);
    if (dx > -6 && dx < 34 && Math.abs(e.y - p.y) < 40) return true;
  }
  return p.onGround && Math.abs(p.vx) < 6;
}

B.keys.right = true;
let hold = 0;
let cleared = false;
let deaths = 0;
for (let i = 0; i < 60 * 120 && !cleared; i++) {
  if (hold === 0 && botWants(B.game)) hold = 30;
  B.keys.jump = hold > 0;
  hold = Math.max(0, hold - 1);
  B.tick(1 / 120);
  if (B.game.state === 'won') cleared = true;
  else if (B.game.state === 'dead') {
    deaths++;
    if (!hidden('ov-over')) click('btn-retry'); // همان راهِ بازیکن واقعی در رابط
    else break;
  }
}
B.keys.right = false;
B.keys.jump = false;
check(cleared, `مرحلهٔ اول را می‌توان از راه رابط تمام کرد${cleared ? '' : ` (تا کاشی ${Math.round(B.game.player.x / TILE)} از ${B.game.cols})`}`);
if (cleared) {
  check(!hidden('ov-clear'), 'روپوش پایان مرحله باز می‌شود');
  check((B.save.stars[0] || 0) >= 1, 'ستارهٔ مرحله در پیشرفت ثبت شد');
  check(/[۰-۹0-9]/.test($('clear-stats').textContent), 'آمار پایان مرحله نوشته شده');
  check($('btn-next').classList.contains('hidden') === false || B.index === B.levels.length - 1, 'دکمهٔ مرحلهٔ بعد آماده است');

  // پیشرفت در حافظهٔ مرورگر ذخیره شده باشد
  const raw = window.localStorage.getItem('borj-save-v1');
  check(!!raw && JSON.parse(raw).cleared.includes(0), 'پیشرفت در localStorage ذخیره شد');

  click('btn-levels2');
  check(!hidden('screen-title'), 'از روپوش پایان به فهرست برمی‌گردیم');
  check($('level-grid').querySelectorAll('.lvl-card:disabled').length === B.levels.length - 2, 'مرحلهٔ دوم باز شد');
  check($('stat-stars').textContent.length > 0, 'شمار ستاره‌ها نشان داده می‌شود');

  // شروع مرحلهٔ بعد
  $('level-grid').querySelectorAll('.lvl-card')[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(!hidden('screen-game') && B.index === 1, 'مرحلهٔ بعد شروع می‌شود');
  check(B.game.player.x < TILE * 4, 'بازیکن از نقطهٔ آغاز مرحلهٔ جدید شروع می‌کند');
}

// ---------------------------------------------------------------
section('باخت و تلاش دوباره');
// ---------------------------------------------------------------
B.game.hearts = 1;
B.game.hurt(-1);
B.tick(1 / 60);
check(B.game.state === 'dead', 'با تمام‌شدن جان‌ها بازی به باخت می‌رسد');
check(!hidden('ov-over'), 'روپوش باخت باز می‌شود');
click('btn-retry');
check(hidden('ov-over'), 'با تلاش دوباره روپوش بسته می‌شود');
check(B.game.state === 'play' && B.game.hearts === 3, 'مرحله از نو با سه جان شروع می‌شود');

// ---------------------------------------------------------------
section('حلقهٔ rAF هم کار می‌کند');
// ---------------------------------------------------------------
const before = B.game.player.x;
check(rafQueue.length > 0, 'حلقهٔ بازی خودش را در rAF ثبت کرده است');
B.keys.right = true;
let vt = 0;
for (let f = 0; f < 60; f++) {
  vt += 16.7;
  const cbs = rafQueue.splice(0, rafQueue.length);
  for (const cb of cbs) cb(vt);
}
check(B.game.player.x > before, 'در حلقهٔ rAF بازیکن جلو می‌رود');
check(rafQueue.length > 0, 'حلقهٔ rAF ادامه دارد (خودش را دوباره ثبت می‌کند)');
B.keys.right = false;

dom.window.close();

// ---------------------------------------------------------------
console.log('');
console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed) process.exit(1);
