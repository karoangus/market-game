// =============================================================
//  test/fullscreen.test.mjs — ماژول تمام‌صفحه (بدون مرورگر)
//
//  اجرا:  npm run test:fullscreen
//
//  چی چک می‌شود؟
//   • بدون document (Node) → API null + toggle شکستِ نرم (بدون crash)
//   • تشخیص نسخهٔ استاندارد / webkit
//   • toggle: enter → exit و وضعیت isFullscreen
//   • خطای همگام (throw) → ok:false
//   • ⛶ «تمام‌صفحه = افقی»: قفلِ جهت (اندروید)، چرخشِ CSS (iOS)،
//     اندازهٔ منطقیِ صفحه، نگاشتِ مختصاتِ لمس، و برگشت به حالت عادی
// =============================================================
import {
  fullscreenApi,
  isFullscreen,
  toggleFullscreen,
  toggleFullscreenAsync,
  isTouchDevice,
  physicalOrientation,
  isForcedLandscape,
  setForcedLandscape,
  tryLockLandscape,
  applyLandscape,
  releaseLandscape,
  refreshForcedLandscape,
  getViewportSize,
  mapPointToLogical,
  mapDeltaToLogical,
  debugForceLandscape,
  ORIENTATION_EVENT,
} from '../js/fullscreen.js';

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

// ---------- ۱) بدون DOM (Node خالص) ----------
console.log('۱) بدون document — شکستِ نرم، بدون crash');
{
  check(fullscreenApi() === null, 'بدون document، API پیدا نمی‌شود');
  check(isFullscreen() === false, 'بدون document، تمام‌صفحه نیست');
  const r = toggleFullscreen();
  check(r.ok === false && r.reason === 'unsupported', 'toggle → ok:false با دلیل unsupported');
}

// ---------- ۲) API استاندارد ----------
console.log('۲) API استاندارد (requestFullscreen)');
{
  const doc = {
    fullscreenElement: null,
    documentElement: {},
  };
  doc.documentElement.requestFullscreen = () => {
    doc.fullscreenElement = doc.documentElement;
    return Promise.resolve();
  };
  doc.exitFullscreen = () => {
    doc.fullscreenElement = null;
    return Promise.resolve();
  };
  globalThis.document = doc;

  const api = fullscreenApi();
  check(!!api && api.name === 'standard', 'API استاندارد شناسایی شد');
  check(isFullscreen() === false, 'در ابتدا تمام‌صفحه نیست');

  let r = toggleFullscreen();
  check(r.ok === true && r.action === 'enter', 'toggle → enter');
  check(isFullscreen() === true, 'حالا (شبه‌)تمام‌صفحه شد');

  r = toggleFullscreen();
  check(r.ok === true && r.action === 'exit', 'toggle → exit');
  check(isFullscreen() === false, 'از تمام‌صفحه خارج شد');

  delete globalThis.document;
}

// ---------- ۳) API webkit (Safari/iOS) ----------
console.log('۳) API webkit (Safari)');
{
  const doc = {
    webkitFullscreenElement: null,
    documentElement: {},
  };
  doc.documentElement.webkitRequestFullscreen = () => {
    doc.webkitFullscreenElement = doc.documentElement;
    return Promise.resolve();
  };
  doc.webkitExitFullscreen = () => {
    doc.webkitFullscreenElement = null;
    return Promise.resolve();
  };
  globalThis.document = doc;

  const api = fullscreenApi();
  check(!!api && api.name === 'webkit', 'API webkit شناسایی شد');
  check(api.change === 'webkitfullscreenchange', 'رویداد تغییرِ درست ثبت شد');
  const r = toggleFullscreen();
  check(r.ok === true && r.action === 'enter', 'toggle → enter');
  check(isFullscreen() === true, 'تمام‌صفحه شد');
  delete globalThis.document;
}

// ---------- ۴) خطای همگام → ok:false ----------
console.log('۴) خطای همگامِ enter → ok:false (بدون crash)');
{
  const doc = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen() {
        throw new Error('NotAllowedError');
      },
    },
    exitFullscreen() {},
  };
  globalThis.document = doc;
  const r = toggleFullscreen();
  check(r.ok === false && !!r.reason, `خطای همگام → ok:false (reason=${r.reason})`);
  delete globalThis.document;
}


// =============================================================
//  بخشِ «تمام‌صفحه = افقی»
// =============================================================

/** یک classList دستی (بدون jsdom) */
function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle(c, on) {
      if (on === undefined) {
        if (set.has(c)) set.delete(c);
        else set.add(c);
      } else if (on) set.add(c);
      else set.delete(c);
    },
  };
}

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const UA_DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * محیطِ شبه‌مرورگری می‌سازد.
 * @param {object} o
 * @param {boolean} o.fullscreenApi  — آیا requestFullscreen وجود دارد؟
 * @param {boolean} o.orientationLock — آیا screen.orientation.lock کار می‌کند؟
 * @param {string}  o.ua
 * @param {'portrait'|'landscape'} o.type — جهتِ فعلیِ دستگاه
 * @param {number} o.w @param {number} o.h — ابعادِ فیزیکیِ ویوپورت
 */
function makeEnv({
  fullscreenApi: hasFs = true,
  orientationLock = false,
  ua = UA_IPHONE,
  type = null,
  coarse = true,
  w = 390,
  h = 844,
} = {}) {
  // جهتِ پیش‌فرض از ابعادِ فیزیکی گرفته می‌شود تا mock با خودش نجنگد
  const oType = type || (w >= h ? 'landscape-primary' : 'portrait-primary');
  const html = { classList: makeClassList() };
  const body = { classList: makeClassList() };
  const doc = {
    fullscreenElement: null,
    documentElement: html,
    body,
    addEventListener() {},
    removeEventListener() {},
  };
  if (hasFs) {
    html.requestFullscreen = () => {
      doc.fullscreenElement = html;
      return Promise.resolve();
    };
    doc.exitFullscreen = () => {
      doc.fullscreenElement = null;
      return Promise.resolve();
    };
  }

  const events = [];
  const listeners = Object.create(null);
  const orientation = { type: oType };
  if (orientationLock) {
    orientation.lock = async (mode) => {
      orientation.type = /landscape/.test(mode) ? 'landscape-primary' : 'portrait-primary';
      orientation.lastLock = mode;
    };
    orientation.unlock = () => {
      orientation.lastUnlock = true;
    };
  }
  const win = {
    innerWidth: w,
    innerHeight: h,
    navigator: { userAgent: ua, maxTouchPoints: coarse ? 5 : 0 },
    matchMedia: (q) => ({ media: q, matches: coarse && /pointer:\s*coarse/.test(q) }),
    scrollTo() {},
    screen: { orientation },
    CustomEvent: function (t, opts) {
      this.type = t;
      this.detail = opts && opts.detail;
    },
    dispatchEvent(e) {
      events.push(e);
      for (const f of listeners[e.type] || []) f(e);
      return true;
    },
    addEventListener(t, f) {
      (listeners[t] = listeners[t] || []).push(f);
    },
    removeEventListener() {},
  };

  globalThis.window = win;
  globalThis.document = doc;
  return { win, doc, html, body, orientation, events, listeners };
}

function clearEnv() {
  delete globalThis.window;
  delete globalThis.document;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------- ۵) تشخیص دستگاه لمسی و جهتِ فیزیکی ----------
console.log('۵) تشخیصِ دستگاه لمسی و جهتِ فیزیکی');
{
  const e = makeEnv({ ua: UA_IPHONE, w: 390, h: 844 });
  check(isTouchDevice() === true, 'آیفون → دستگاه لمسی');
  check(physicalOrientation() === 'portrait', 'جهتِ فیزیکی: عمودی');
  clearEnv();

  const d = makeEnv({ ua: UA_DESKTOP, coarse: false, w: 1440, h: 900 });
  check(isTouchDevice() === false, 'دسکتاپ (بدون لمس) → لمسی نیست');
  check(physicalOrientation() === 'landscape', 'دسکتاپِ عریض → افقی');
  clearEnv();

  const a = makeEnv({ ua: UA_ANDROID, w: 844, h: 390 });
  check(isTouchDevice() === true, 'اندروید → دستگاه لمسی');
  check(physicalOrientation() === 'landscape', 'screen.orientation.type → افقی');
  clearEnv();
}

// ---------- ۶) قفلِ جهت روی افقی (اندروید/کروم) ----------
console.log('۶) قفلِ جهت روی «افقی» با Screen Orientation API');
{
  const e = makeEnv({ ua: UA_ANDROID, orientationLock: true });
  const ok = await tryLockLandscape();
  check(ok === true, 'tryLockLandscape → موفق');
  check(/^landscape/.test(e.orientation.type), `جهت قفل شد: ${e.orientation.type}`);
  check(e.orientation.lastLock === 'landscape', 'اولین تلاش: lock("landscape")');
  clearEnv();

  // مرورگری که فقط landscape-primary را می‌فهمد
  const e2 = makeEnv({ ua: UA_ANDROID, orientationLock: true });
  e2.orientation.lock = async (mode) => {
    if (mode === 'landscape') throw Object.assign(new Error('nope'), { name: 'NotSupportedError' });
    e2.orientation.type = 'landscape-primary';
    e2.orientation.lastLock = mode;
  };
  const ok2 = await tryLockLandscape();
  check(ok2 === true && e2.orientation.lastLock === 'landscape-primary', 'حالتِ دوم (landscape-primary) امتحان شد');
  clearEnv();

  // مرورگری که هیچ حالتی را قبول نمی‌کند
  const e3 = makeEnv({ ua: UA_IPHONE });
  check((await tryLockLandscape()) === false, 'بدون API قفل → false (بدون crash)');
  clearEnv();
}

// ---------- ۷) چرخشِ CSS وقتی قفلِ جهت نیست (iOS Safari) ----------
console.log('۷) fallback چرخشِ CSS (force-landscape)');
{
  const e = makeEnv({ ua: UA_IPHONE, orientationLock: false, w: 390, h: 844 });
  const r = await applyLandscape();
  check(r.ok === true && r.mode === 'css', `applyLandscape → mode=${r.mode}`);
  check(isForcedLandscape() === true, 'کلاسِ force-landscape روی <html> نشست');
  check(e.html.classList.contains('force-landscape') && e.body.classList.contains('force-landscape'), 'هم <html> هم <body> کلاس گرفتند');
  check(e.events.some((ev) => ev.type === ORIENTATION_EVENT), 'رویدادِ تغییرِ جهت پخش شد (تا رندر resize شود)');

  const size = getViewportSize();
  check(size.w === 844 && size.h === 390, `اندازهٔ منطقی جابه‌جا شد: ${size.w}×${size.h}`);
  check(size.rotated === true, 'getViewportSize → rotated:true');

  const p = mapPointToLogical(0, 844);
  check(p.x === 844 && p.y === 390, 'گوشهٔ پایین-چپِ فیزیکی → پایین-راستِ منطقی');
  const p2 = mapPointToLogical(390, 0);
  check(p2.x === 0 && p2.y === 0, 'گوشهٔ بالا-راستِ فیزیکی → بالا-چپِ منطقی');
  const dd = mapDeltaToLogical(10, 0);
  check(dd.dx === 0 && dd.dy === -10, 'جابه‌جاییِ ماوس/لمس هم می‌چرخد');
  clearEnv();
}

// ---------- ۸) حالت‌هایی که چرخشِ CSS لازم نیست ----------
console.log('۸) دسکتاپ و گوشیِ از قبل افقی → چرخشِ CSS نه');
{
  const e = makeEnv({ ua: UA_DESKTOP, coarse: false, orientationLock: false, w: 1440, h: 900 });
  const r = await applyLandscape();
  check(r.mode === 'desktop', 'دسکتاپ → mode=desktop');
  check(isForcedLandscape() === false, 'روی دسکتاپ صفحه نمی‌چرخد');
  check(getViewportSize().w === 1440 && getViewportSize().h === 900, 'اندازهٔ منطقی = همان فیزیکی');
  check(mapPointToLogical(12, 34).x === 12, 'نگاشتِ مختصات بی‌اثر است');
  clearEnv();

  const e2 = makeEnv({ ua: UA_IPHONE, orientationLock: false, w: 844, h: 390 });
  const r2 = await applyLandscape();
  check(r2.mode === 'already', 'گوشیِ از قبل افقی → mode=already');
  check(isForcedLandscape() === false, 'چرخشِ CSS تکراری اعمال نمی‌شود (دو بار نمی‌چرخد)');
  clearEnv();
}

// ---------- ۹) چرخشِ واقعیِ گوشی → کلاس باید برداشته شود ----------
console.log('۹) همگام‌سازی با چرخشِ واقعیِ گوشی / خروج از تمام‌صفحه');
{
  // الف) تمام‌صفحهٔ واقعی + چرخشِ CSS، بعد گوشی واقعاً افقی می‌شود
  const e = makeEnv({ ua: UA_IPHONE, hasFs: true, orientationLock: false });
  const enter = await toggleFullscreenAsync();
  await tick();
  check(enter.ok && enter.action === 'enter', 'ورود به تمام‌صفحه');
  check(isForcedLandscape() === true, 'در تمام‌صفحه، صفحه با CSS افقی شد');

  e.orientation.type = 'landscape-primary'; // کاربر گوشی را چرخاند
  e.win.innerWidth = 844;
  e.win.innerHeight = 390;
  const changed = refreshForcedLandscape();
  check(changed === true && isForcedLandscape() === false, 'چرخشِ CSS برداشته شد (وگرنه تصویر وارونه می‌شد)');

  const exit = await toggleFullscreenAsync();
  check(exit.ok && exit.action === 'exit', 'خروج از تمام‌صفحه');
  check(isForcedLandscape() === false, 'بعد از خروج هم چرخشِ CSS باقی نمی‌ماند');
  clearEnv();

  // ب) خروج از تمام‌صفحه باید کلاس را بردارد حتی اگر گوشی عمودی مانده باشد
  const e2 = makeEnv({ ua: UA_IPHONE, hasFs: true, orientationLock: false });
  await toggleFullscreenAsync();
  await tick();
  check(isForcedLandscape() === true, 'حالتِ افقیِ اجباری فعال است');
  await releaseLandscape();
  check(isForcedLandscape() === false, 'releaseLandscape → چرخش برداشته شد');
  clearEnv();

  // پ) بیرون رفتن از تمام‌صفحه با دکمهٔ خودِ مرورگر (کلاس pseudo نمی‌خورد)
  const e3 = makeEnv({ ua: UA_IPHONE, fullscreenApi: false, orientationLock: false });
  const r3 = await toggleFullscreenAsync();
  await tick();
  check(r3.ok && r3.reason === 'pseudo', 'بدون API → شبه‌تمام‌صفحه');
  check(isForcedLandscape() === true, 'شبه‌تمام‌صفحه هم افقی شد');
  check(e3.body.classList.contains('pseudo-fullscreen'), 'کلاسِ pseudo-fullscreen نشست');
  e3.html.classList.remove('pseudo-fullscreen');
  e3.body.classList.remove('pseudo-fullscreen'); // کاربر با ژستِ مرورگر بیرون رفت
  check(refreshForcedLandscape() === true && isForcedLandscape() === false, 'بیرونِ تمام‌صفحه → چرخش هم می‌رود');
  clearEnv();
}

// ---------- ۹/۵) کلیدِ اشکال‌زدایی ?force-landscape=1 ----------
console.log('۹/۵) کلیدِ اشکال‌زدایی: چرخشِ CSS روی دسکتاپ هم قابلِ دیدن است');
{
  const e = makeEnv({ ua: UA_DESKTOP, coarse: false, w: 1440, h: 900 });
  e.win.location = { search: '?force-landscape=1' };
  check(debugForceLandscape() === true, 'کلید از آدرس خوانده شد');
  const r = await applyLandscape();
  check(r.mode === 'css' && isForcedLandscape() === true, 'روی دسکتاپ هم چرخشِ CSS اعمال شد (برای آزمایش)');
  check(refreshForcedLandscape() === false, 'در حالتِ آزمایش، چرخش برداشته نمی‌شود');
  clearEnv();

  const e2 = makeEnv({ ua: UA_DESKTOP, coarse: false });
  e2.win.location = { search: '?day=3' };
  check(debugForceLandscape() === false, 'بدونِ کلید، چیزی عوض نمی‌شود');
  clearEnv();
}

// ---------- ۱۰) setForcedLandscape دستی و محیطِ بدون DOM ----------
console.log('۱۰) گوشه‌ها: بدون DOM و تغییرِ بی‌اثر');
{
  check(isForcedLandscape() === false, 'بدون document → false');
  check(setForcedLandscape(true) === false, 'بدون document → تغییری ممکن نیست');
  check(getViewportSize().w === 0, 'بدون window → اندازه صفر (کد بالادستی fallback دارد)');
  check(mapPointToLogical(5, 7).x === 5, 'بدون document → نگاشت بی‌اثر');
  const r = await applyLandscape();
  check(r.ok === true && r.mode === 'desktop', 'بدون window → بی‌صدا رد می‌شود (crash نمی‌کند)');
}

console.log('');
console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed) process.exit(1);
