// =============================================================
//  fullscreen.js — نمایش تمام‌صفحه با پشتیبانی کامل موبایل
//
//  مشکلات قبلی:
//   • روی iOS و بعضی اندرویدها دکمه هیچ کاری نمی‌کرد چون فقط
//     documentElement.requestFullscreen چک می‌شد و Promise rejection
//     ساکت خورده می‌شد.
//   • بازی عمودی نمی‌شد: هیچ تلاشی برای قفل جهت صفحه (portrait)
//     انجام نمی‌شد.
//   • resize بعد از fullscreenchange فراخوانی نمی‌شد.
//   • ⛶ دکمهٔ تمام‌صفحه فقط «تمام‌صفحه» می‌کرد و گوشی عمودی
//     می‌ماند — یعنی همان تجربهٔ تنگِ عمودی، فقط بدونِ آدرس‌بار.
//
//  این نسخه:
//   • همهٔ پیشوندها (standard, webkit, moz, ms) را می‌شناسد.
//   • enter/exit را با Promise مدیریت می‌کند و خطا را برمی‌گرداند.
//   • ✅ تمام‌صفحه = افقی (landscape): روی موبایل همراه با ورود به
//     تمام‌صفحه، جهتِ صفحه افقی می‌شود (applyLandscape).
//       - اندروید/کروم و PWA نصب‌شده → قفلِ واقعیِ جهت
//         (screen.orientation.lock('landscape'))
//       - iOS Safari و مرورگرهای بدون API → چرخشِ ۹۰ درجهٔ کلِ
//         صفحه با CSS (کلاس force-landscape روی <html>)
//   • fallback شبه‌تمام‌صفحه برای iOS قدیم (pseudo-fullscreen).
//   • تابع onFullscreenChange برای گوش دادن به همهٔ رویدادها.
//   • toggleFullscreen قدیمی (sync) برای سازگاری با تست‌ها حفظ شد.
//
//  ⚠️ وقتی جهت با CSS می‌چرخد، window.innerWidth/innerHeight تغییر
//     نمی‌کنند (فیزیکی می‌مانند). پس هر جایی که اندازهٔ «منطقیِ»
//     صفحه لازم است باید از getViewportSize() استفاده کند و
//     مختصاتِ لمس/ماوس با mapPointToLogical() جابه‌جا شود — وگرنه
//     رندرر کج می‌شود و جوی‌استیک برعکس کار می‌کند.
// =============================================================

/** @returns {Document|undefined} */
function getDoc() {
  return typeof document !== 'undefined' ? document : undefined;
}

/** @returns {(Window & typeof globalThis)|undefined} */
function getWin() {
  return typeof window !== 'undefined' ? window : undefined;
}

/** عنصر فعلی تمام‌صفحه (با همهٔ پیشوندها) */
export function getFullscreenElement() {
  const d = getDoc();
  if (!d) return null;
  return (
    d.fullscreenElement ||
    d.webkitFullscreenElement ||
    d.webkitCurrentFullScreenElement ||
    d.mozFullScreenElement ||
    d.msFullscreenElement ||
    null
  );
}

/** آیا الان تمام‌صفحه‌ایم؟ (شامل pseudo-fullscreen برای iOS) */
export function isFullscreen() {
  const d = getDoc();
  if (!d) return false;
  if (getFullscreenElement()) return true;
  // pseudo-fullscreen fallback
  if (d.body && d.body.classList && d.body.classList.contains('pseudo-fullscreen')) return true;
  if (d.documentElement && d.documentElement.classList && d.documentElement.classList.contains('pseudo-fullscreen')) return true;
  return false;
}

/** آیا API تمام‌صفحه پشتیبانی می‌شود؟ */
export function isSupported() {
  const d = getDoc();
  if (!d) return false;
  const el = d.documentElement;
  if (!el) return false;
  return !!(
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.webkitRequestFullScreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen
  );
}

/**
 * API تمام‌صفحهٔ در دسترس را برمی‌گرداند یا null.
 * برای سازگاری با تست‌های قدیمی حفظ شده.
 * @returns {{name:string, enter:Function, exit:Function, isFull:Function, change:string} | null}
 */
export function fullscreenApi() {
  const d = getDoc();
  if (!d) return null;
  const el = d.documentElement;
  if (!el) return null;

  // standard
  if (typeof el.requestFullscreen === 'function') {
    return {
      name: 'standard',
      enter: () => el.requestFullscreen({ navigationUI: 'hide' }).catch(() => el.requestFullscreen()),
      exit: () => d.exitFullscreen(),
      isFull: () => !!d.fullscreenElement,
      change: 'fullscreenchange',
      element: el,
    };
  }
  // webkit (Safari, iOS 16.4+)
  if (typeof el.webkitRequestFullscreen === 'function') {
    return {
      name: 'webkit',
      enter: () => {
        try {
          // بعضی Safariها ALLOW_KEYBOARD_INPUT می‌خواهند
          const anyEl = el;
          if (typeof anyEl.webkitRequestFullscreen === 'function') {
            // @ts-ignore
            if (window.Element && window.Element.ALLOW_KEYBOARD_INPUT) {
              // @ts-ignore
              return anyEl.webkitRequestFullscreen(window.Element.ALLOW_KEYBOARD_INPUT);
            }
            return anyEl.webkitRequestFullscreen();
          }
        } catch (_) {}
        return el.webkitRequestFullscreen();
      },
      exit: () => (d.webkitExitFullscreen ? d.webkitExitFullscreen() : d.webkitCancelFullScreen && d.webkitCancelFullScreen()),
      isFull: () => !!d.webkitFullscreenElement,
      change: 'webkitfullscreenchange',
      element: el,
    };
  }
  // webkit old capitalization
  if (typeof el.webkitRequestFullScreen === 'function') {
    return {
      name: 'webkit-old',
      enter: () => el.webkitRequestFullScreen(),
      exit: () => d.webkitCancelFullScreen && d.webkitCancelFullScreen(),
      isFull: () => !!d.webkitCurrentFullScreenElement,
      change: 'webkitfullscreenchange',
      element: el,
    };
  }
  if (typeof el.msRequestFullscreen === 'function') {
    return {
      name: 'ms',
      enter: () => el.msRequestFullscreen(),
      exit: () => d.msExitFullscreen(),
      isFull: () => !!d.msFullscreenElement,
      change: 'MSFullscreenChange',
      element: el,
    };
  }
  if (typeof el.mozRequestFullScreen === 'function') {
    return {
      name: 'moz',
      enter: () => el.mozRequestFullScreen(),
      exit: () => d.mozCancelFullScreen(),
      isFull: () => !!d.mozFullScreenElement,
      change: 'mozfullscreenchange',
      element: el,
    };
  }
  return null;
}

// ---------- درخواست تمام‌صفحه (async, robust) ----------

function getRequestFn(target) {
  if (!target) return null;
  if (typeof target.requestFullscreen === 'function') return (opts) => target.requestFullscreen(opts);
  if (typeof target.webkitRequestFullscreen === 'function') {
    return () => {
      try {
        // @ts-ignore
        if (window.Element && window.Element.ALLOW_KEYBOARD_INPUT) {
          // @ts-ignore
          return target.webkitRequestFullscreen(window.Element.ALLOW_KEYBOARD_INPUT);
        }
      } catch (_) {}
      return target.webkitRequestFullscreen();
    };
  }
  if (typeof target.webkitRequestFullScreen === 'function') return () => target.webkitRequestFullScreen();
  if (typeof target.mozRequestFullScreen === 'function') return () => target.mozRequestFullScreen();
  if (typeof target.msRequestFullscreen === 'function') return () => target.msRequestFullscreen();
  return null;
}

function getExitFn() {
  const d = getDoc();
  if (!d) return null;
  if (typeof d.exitFullscreen === 'function') return () => d.exitFullscreen();
  if (typeof d.webkitExitFullscreen === 'function') return () => d.webkitExitFullscreen();
  if (typeof d.webkitCancelFullScreen === 'function') return () => d.webkitCancelFullScreen();
  if (typeof d.mozCancelFullScreen === 'function') return () => d.mozCancelFullScreen();
  if (typeof d.msExitFullscreen === 'function') return () => d.msExitFullscreen();
  return null;
}

/**
 * سعی می‌کند جهت صفحه را portrait قفل کند.
 * روی دسکتاپ یا مرورگرهای بدون API بی‌صدا شکست می‌خورد.
 *
 * ⚠️ دیگر هنگام تمام‌صفحه صدا زده نمی‌شود (جایش را به applyLandscape
 *    داده) — فقط برای سازگاری با کد/تستِ قدیمی نگه داشته شده.
 * @returns {Promise<boolean>}
 */
export async function tryLockPortrait() {
  try {
    const scr = typeof screen !== 'undefined' ? screen : null;
    const orient = scr && (scr.orientation || scr.mozOrientation || scr.msOrientation);
    if (orient && typeof orient.lock === 'function') {
      // portrait-primary بهتر است ولی بعضی مرورگرها فقط portrait می‌فهمند
      try {
        await orient.lock('portrait-primary');
        return true;
      } catch (_) {
        try {
          await orient.lock('portrait');
          return true;
        } catch (_) {
          // بعضی مرورگرها فقط در fullscreen اجازه قفل می‌دهند،
          // اگر شکست خورد دوباره تلاش نکن
        }
      }
    }
    // API قدیمی
    // @ts-ignore
    if (scr && typeof scr.lockOrientation === 'function') {
      // @ts-ignore
      const ok = scr.lockOrientation('portrait-primary') || scr.lockOrientation('portrait');
      return !!ok;
    }
  } catch (_) {}
  return false;
}

/**
 * قفل جهت را باز می‌کند.
 * @returns {Promise<boolean>}
 */
export async function tryUnlockOrientation() {
  try {
    const scr = typeof screen !== 'undefined' ? screen : null;
    const orient = scr && (scr.orientation || scr.mozOrientation || scr.msOrientation);
    if (orient && typeof orient.unlock === 'function') {
      try {
        orient.unlock();
        return true;
      } catch (_) {}
    }
    // @ts-ignore
    if (scr && typeof scr.unlockOrientation === 'function') {
      try {
        // @ts-ignore
        scr.unlockOrientation();
        return true;
      } catch (_) {}
    }
  } catch (_) {}
  return false;
}

// =============================================================
//  جهتِ صفحه: «تمام‌صفحه = افقی» (مخصوص موبایل)
//
//  سه لایه دارد، به ترتیبِ کیفیت:
//   ۱) lock   — قفلِ واقعیِ جهت با Screen Orientation API
//               (اندروید/کروم، فایرفاکس، و PWA نصب‌شده).
//   ۲) css    — چرخشِ ۹۰ درجهٔ کلِ صفحه با کلاس force-landscape
//               (iOS Safari که نه Fullscreen API دارد نه قفلِ جهت).
//   ۳) none   — دسکتاپ یا دستگاهی که از قبل افقی است (کاری لازم نیست).
// =============================================================

/** ترتیب تلاش برای قفلِ جهت — بعضی مرورگرها فقط یکی را می‌فهمند */
const LANDSCAPE_LOCKS = ['landscape', 'landscape-primary', 'landscape-secondary'];

/** نامِ رویدادی که بعد از تغییرِ جهت روی window پخش می‌شود */
export const ORIENTATION_EVENT = 'mg:orientation';

/** خبر دادن به بقیهٔ ماژول‌ها (main.js) که «سایزت عوض شد» */
function notifyOrientation(mode) {
  const w = getWin();
  if (!w || typeof w.dispatchEvent !== 'function') return;
  try {
    const Ctor = w.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
    if (!Ctor) return;
    w.dispatchEvent(new Ctor(ORIENTATION_EVENT, { detail: { mode } }));
  } catch (_) {}
}

/**
 * آیا دستگاه لمسی/موبایل است؟ روی دسکتاپ جهتِ صفحه را دست نمی‌زنیم
 * (کسی که پنجرهٔ مرورگر را عمودی کرده، خودش می‌داند چرا).
 * @returns {boolean}
 */
export function isTouchDevice() {
  const w = getWin();
  if (!w) return false;
  try {
    if (typeof w.matchMedia === 'function' && w.matchMedia('(pointer: coarse)').matches) return true;
  } catch (_) {}
  try {
    const nav = w.navigator || {};
    const ua = nav.userAgent || '';
    if (/android|iphone|ipod|ipad|iemobile|windows phone|mobile|silk|kindle|blackberry/i.test(ua)) return true;
    // آیپدِ جدید با UA دسکتاپی («Macintosh») ولی لمسِ چندانگشتی
    if ((nav.maxTouchPoints | 0) > 1 && /macintosh|windows nt/i.test(ua)) return true;
  } catch (_) {}
  return false;
}

/**
 * جهتِ «فیزیکیِ» صفحه — یعنی بدونِ حساب کردنِ چرخشِ CSS.
 * @returns {'portrait'|'landscape'|null}
 */
export function physicalOrientation() {
  const w = getWin();
  if (!w) return null;
  try {
    const scr = w.screen;
    const o = scr && (scr.orientation || scr.mozOrientation || scr.msOrientation);
    if (o && typeof o.type === 'string') return /portrait/i.test(o.type) ? 'portrait' : 'landscape';
  } catch (_) {}
  try {
    if (typeof w.orientation === 'number') return Math.abs(w.orientation % 180) === 0 ? 'portrait' : 'landscape';
  } catch (_) {}
  try {
    const vw = w.innerWidth || 0;
    const vh = w.innerHeight || 0;
    if (vw > 0 && vh > 0) return vw >= vh ? 'landscape' : 'portrait';
  } catch (_) {}
  return null;
}

/** آیا الان صفحه با CSS افقی (چرخانده) شده؟ */
export function isForcedLandscape() {
  const d = getDoc();
  if (!d || !d.documentElement || !d.documentElement.classList) return false;
  return d.documentElement.classList.contains('force-landscape');
}

/**
 * روشن/خاموش کردنِ «افقیِ اجباری» با CSS.
 * کلاس روی <html> و <body> می‌نشیند تا css/style.css کلِ صفحه را
 * ۹۰ درجه بچرخاند و ابعاد منطقی (var(--appw)/var(--apph)) جابه‌جا شوند.
 * @param {boolean} on
 * @returns {boolean} آیا وضعیت عوض شد؟
 */
export function setForcedLandscape(on) {
  const d = getDoc();
  if (!d || !d.documentElement || !d.documentElement.classList) return false;
  const want = !!on;
  try {
    const before = d.documentElement.classList.contains('force-landscape');
    d.documentElement.classList.toggle('force-landscape', want);
    if (d.body && d.body.classList) d.body.classList.toggle('force-landscape', want);
    const changed = before !== want;
    if (changed) notifyOrientation(want ? 'css' : 'release');
    return changed;
  } catch (_) {
    return false;
  }
}

/**
 * قفلِ جهت روی «افقی» با Screen Orientation API.
 * بیشتر مرورگرها فقط وقتی اجازه می‌دهند که صفحه تمام‌صفحه باشد.
 * @returns {Promise<boolean>}
 */
export async function tryLockLandscape() {
  const w = getWin();
  if (!w) return false;
  try {
    const scr = w.screen;
    const orient = scr && (scr.orientation || scr.mozOrientation || scr.msOrientation);
    if (orient && typeof orient.lock === 'function') {
      for (const mode of LANDSCAPE_LOCKS) {
        try {
          await orient.lock(mode);
          return true;
        } catch (_) {
          // حالتِ بعدی را امتحان کن
        }
      }
    }
    // API قدیمی (اندرویدِ قبل از ۵ / IE11)
    if (scr && typeof scr.lockOrientation === 'function') {
      for (const mode of LANDSCAPE_LOCKS) {
        try {
          if (scr.lockOrientation(mode)) return true;
        } catch (_) {}
      }
    }
  } catch (_) {}
  return false;
}

/**
 * کلیدِ اشکال‌زدایی: `?force-landscape=1` در آدرس.
 * با این کلید، چرخشِ CSS حتی روی دسکتاپ هم اعمال می‌شود تا بشود
 * حالتِ «افقیِ اجباریِ» آیفون را بدونِ گوشی دید و آزمایش کرد.
 * @returns {boolean}
 */
export function debugForceLandscape() {
  const w = getWin();
  try {
    const q = (w && w.location && (w.location.search || '')) || '';
    return /[?&](force-landscape|forceLandscape|fl)=1(&|$)/.test(q);
  } catch (_) {
    return false;
  }
}

/**
 * صفحه را افقی کن — لایه‌لایه: قفلِ واقعی، بعد چرخشِ CSS.
 * روی دسکتاپ یا وقتی گوشی از قبل افقی است، کاری نمی‌کند.
 * @returns {Promise<{ok:boolean, mode:'lock'|'css'|'already'|'desktop'|'unsupported'}>}
 */
export async function applyLandscape() {
  // ۰) کلیدِ اشکال‌زدایی → همان چرخشِ CSS، روی هر دستگاهی
  if (debugForceLandscape()) {
    setForcedLandscape(true);
    return { ok: true, mode: 'css' };
  }
  // ۱) دسکتاپ → جهت را دست نزن (و اگر کلاسِ چرخش مانده، بردار)
  if (!isTouchDevice()) {
    setForcedLandscape(false);
    return { ok: true, mode: 'desktop' };
  }
  // ۲) قفلِ واقعیِ جهت — بهترین حالت
  const locked = await tryLockLandscape();
  if (locked) {
    setForcedLandscape(false);
    return { ok: true, mode: 'lock' };
  }
  // ۳) گوشی همین حالا افقی است → چرخشِ CSS لازم نیست
  if (physicalOrientation() === 'landscape') return { ok: true, mode: 'already' };
  // ۴) iOS Safari و بقیهٔ مرورگرهای بدون API → چرخشِ کلِ صفحه با CSS
  if (setForcedLandscape(true)) return { ok: true, mode: 'css' };
  if (isForcedLandscape()) return { ok: true, mode: 'css' };
  return { ok: false, mode: 'unsupported' };
}

/**
 * از حالتِ افقیِ اجباری بیرون بیا (هنگامِ خروج از تمام‌صفحه).
 * قفلِ جهت هم باز می‌شود تا کاربر آزادانه گوشی را بچرخاند.
 * @returns {Promise<{ok:boolean}>}
 */
export async function releaseLandscape() {
  setForcedLandscape(false);
  await tryUnlockOrientation();
  return { ok: true };
}

/**
 * اگر کاربر گوشی را «واقعاً» چرخاند یا از تمام‌صفحه بیرون رفت،
 * چرخشِ CSS را بردار — وگرنه صفحه دو بار می‌چرخد و وارونه می‌شود.
 * @returns {boolean} آیا تغییری داده شد؟
 */
export function refreshForcedLandscape() {
  if (!isForcedLandscape()) return false;
  if (debugForceLandscape()) return false; // در حالتِ آزمایش، چرخش را نگه دار
  if (!isFullscreen() || physicalOrientation() === 'landscape') return setForcedLandscape(false);
  return false;
}

/**
 * اندازهٔ «منطقیِ» صفحه — همان چیزی که کاربر می‌بیند.
 * در حالتِ افقیِ اجباری، عرض و ارتفاعِ فیزیکی جابه‌جا می‌شوند چون
 * window.innerWidth/innerHeight با چرخشِ CSS عوض نمی‌شوند.
 * @returns {{w:number, h:number, rotated:boolean}}
 */
export function getViewportSize() {
  const w = getWin();
  if (!w) return { w: 0, h: 0, rotated: false };
  let vw = w.innerWidth || 0;
  let vh = w.innerHeight || 0;
  try {
    if (w.visualViewport) {
      vw = w.visualViewport.width || vw;
      vh = w.visualViewport.height || vh;
    }
  } catch (_) {}
  if (!isForcedLandscape()) return { w: vw, h: vh, rotated: false };

  // حالتِ افقیِ اجباری: دقیق‌ترین عدد، اندازهٔ خودِ bodyِ چرخانده است
  // (چون با dvh/svh ساخته شده و آدرس‌بار را هم حساب می‌کند).
  try {
    const d = getDoc();
    const b = d && d.body;
    if (b && b.clientWidth > 0 && b.clientHeight > 0) {
      return { w: b.clientWidth, h: b.clientHeight, rotated: true };
    }
  } catch (_) {}
  return { w: vh, h: vw, rotated: true };
}

/**
 * تبدیلِ مختصاتِ لمس/ماوس (clientX/clientY فیزیکی) به مختصاتِ
 * «منطقیِ» صفحهٔ چرخانده.
 *
 * css: `transform: rotate(90deg) translateY(-100%)` روی body یعنی
 *      screen_x = W - y_local  و  screen_y = x_local
 *      →  x_local = screen_y   و  y_local = W - screen_x
 * @param {number} x
 * @param {number} y
 * @returns {{x:number, y:number}}
 */
export function mapPointToLogical(x, y) {
  if (!isForcedLandscape()) return { x, y };
  const w = getWin();
  const physW = (w && (w.innerWidth || 0)) || 0;
  return { x: y, y: physW - x };
}

/**
 * تبدیلِ «جابه‌جایی» (movementX/Y یا اختلاف دو لمس) به دستگاهِ منطقی.
 * @param {number} dx
 * @param {number} dy
 * @returns {{dx:number, dy:number}}
 */
export function mapDeltaToLogical(dx, dy) {
  if (!isForcedLandscape()) return { dx, dy };
  return { dx: dy, dy: -dx };
}

/**
 * ورود به تمام‌صفحه (async).
 * @param {HTMLElement} [preferredEl] - اگر داده نشود documentElement
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function requestFullscreen(preferredEl) {
  const d = getDoc();
  if (!d) return { ok: false, reason: 'unsupported' };

  // اگر قبلاً تمام‌صفحه‌ایم
  if (getFullscreenElement()) return { ok: true };

  // ترتیب تلاش: preferredEl -> documentElement -> body -> html
  const candidates = [];
  if (preferredEl) candidates.push(preferredEl);
  if (d.documentElement) candidates.push(d.documentElement);
  if (d.body) candidates.push(d.body);
  // canvas بازی هم گزینهٔ خوبی است برای موبایل
  try {
    const canvas = d.getElementById && d.getElementById('scene');
    if (canvas) candidates.push(canvas);
  } catch (_) {}

  for (const el of candidates) {
    const fn = getRequestFn(el);
    if (!fn) continue;
    try {
      // اول با navigationUI: hide (برای موبایل نوار را مخفی می‌کند)
      let p;
      try {
        p = fn({ navigationUI: 'hide' });
      } catch (_) {
        p = fn();
      }
      if (p && typeof p.then === 'function') {
        await p;
      }
      // ✅ تمام‌صفحه شد → حالا جهتِ صفحه را «افقی» کن (مخصوص موبایل)
      const orient = applyLandscape();
      // بعضی مرورگرها چند لحظه بعد از fullscreen اجازهٔ قفلِ جهت می‌دهند
      setTimeout(() => {
        applyLandscape().catch(() => {});
      }, 250);
      try {
        await orient;
      } catch (_) {}
      return { ok: true };
    } catch (e) {
      const name = e && e.name ? e.name : '';
      // اگر خطای NotAllowed باشد، شاید به خاطر نبود gesture، تلاش بعدی بی‌فایده است
      // ولی باز هم بقیهٔ candidates را امتحان می‌کنیم
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        // ادامه بده
      }
      // آخرین خطا را نگه دار
      continue;
    }
  }

  // هیچ API کار نکرد — fallback pseudo-fullscreen برای iOS قدیم
  // این حالت واقعاً fullscreen نیست ولی تجربهٔ نزدیک می‌دهد
  try {
    if (d.documentElement) {
      d.documentElement.classList.add('pseudo-fullscreen');
    }
    if (d.body) {
      d.body.classList.add('pseudo-fullscreen');
    }
    // اسکرول به بالا تا نوار آدرس مخفی شود
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 1);
      setTimeout(() => {
        try {
          window.scrollTo(0, 1);
        } catch (_) {}
      }, 300);
    }
    // ✅ شبه‌تمام‌صفحه هم باید افقی شود (دقیقاً همان‌جا که iOS می‌افتد)
    applyLandscape().catch(() => {});
    return { ok: true, reason: 'pseudo' };
  } catch (_) {}

  return { ok: false, reason: 'unsupported' };
}

/**
 * خروج از تمام‌صفحه (async).
 * @returns {Promise<{ok:boolean}>}
 */
export async function exitFullscreen() {
  const d = getDoc();
  if (!d) return { ok: false };

  // اگر pseudo-fullscreen بود
  const isPseudo =
    (d.body && d.body.classList && d.body.classList.contains('pseudo-fullscreen')) ||
    (d.documentElement && d.documentElement.classList && d.documentElement.classList.contains('pseudo-fullscreen'));

  if (isPseudo) {
    try {
      d.documentElement && d.documentElement.classList.remove('pseudo-fullscreen');
      d.body && d.body.classList.remove('pseudo-fullscreen');
    } catch (_) {}
    await releaseLandscape();
    return { ok: true };
  }

  const fn = getExitFn();
  if (!fn) return { ok: false };
  try {
    const p = fn();
    if (p && typeof p.then === 'function') await p;
    await releaseLandscape();
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}

/**
 * ورود/خروج هوشمند (async) — نسخهٔ جدید برای موبایل.
 * @returns {Promise<{ok:boolean, action?:'enter'|'exit', reason?:string}>}
 */
export async function toggleFullscreenAsync() {
  if (isFullscreen()) {
    const r = await exitFullscreen();
    if (r.ok) return { ok: true, action: 'exit' };
    return { ok: false, reason: 'exit-failed' };
  } else {
    const r = await requestFullscreen();
    if (r.ok) return { ok: true, action: 'enter', reason: r.reason };
    return { ok: false, reason: r.reason || 'unsupported' };
  }
}

/**
 * ورود/خروج از حالت تمام‌صفحه (sync, برای سازگاری با تست‌ها).
 * Promise rejection را ساکت می‌خورد تا دکمه نمیرد.
 * @returns {{ok:boolean, action?:'enter'|'exit', reason?:string}}
 */
export function toggleFullscreen() {
  const api = fullscreenApi();
  if (!api) {
    // حتی اگر API نباشد، pseudo-fullscreen را امتحان کن (برای تست، همچنان unsupported برگردان)
    // تست expects unsupported when no document, so don't activate pseudo in that case
    const d = getDoc();
    if (!d) return { ok: false, reason: 'unsupported' };
    // در مرورگر واقعی بدون API، pseudo را فعال کن ولی برای تست‌های بدون DOM همان unsupported
    try {
      if (typeof document !== 'undefined' && document.body) {
        // اگر کاربر واقعاً کلیک کرده، pseudo را فعال کن
        // اما این تابع sync است، پس فقط علامت می‌گذاریم و ok:true برمی‌گردانیم
        // تا دکمه مرده نباشد
        const hasFs = isSupported();
        if (!hasFs) {
          // pseudo fallback
          document.documentElement.classList.add('pseudo-fullscreen');
          document.body.classList.add('pseudo-fullscreen');
          if (typeof window !== 'undefined') window.scrollTo(0, 1);
          // ✅ حتی در شبه‌تمام‌صفحه هم جهت باید افقی شود
          applyLandscape().catch(() => {});
          return { ok: true, action: 'enter', reason: 'pseudo' };
        }
      }
    } catch (_) {}
    return { ok: false, reason: 'unsupported' };
  }
  try {
    if (api.isFull()) {
      const p = api.exit();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      // جهت را هم آزاد کن (چرخشِ CSS برداشته می‌شود)
      releaseLandscape().catch(() => {});
      return { ok: true, action: 'exit' };
    }
    const p = api.enter();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
      // بعضی مرورگرها فقط بعد از resolve اجازهٔ قفلِ جهت می‌دهند
      if (p.then) {
        p.then(() => applyLandscape()).catch(() => {});
      } else {
        applyLandscape().catch(() => {});
      }
    } else {
      applyLandscape().catch(() => {});
    }
    return { ok: true, action: 'enter' };
  } catch (e) {
    return { ok: false, reason: (e && e.name) || 'error' };
  }
}

/**
 * گوش دادن به تغییر تمام‌صفحه (همهٔ پیشوندها).
 * @param {() => void} cb
 * @returns {() => void} cleanup
 */
export function onFullscreenChange(cb) {
  const d = getDoc();
  if (!d || typeof d.addEventListener !== 'function') return () => {};
  const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  for (const ev of events) d.addEventListener(ev, cb);
  return () => {
    for (const ev of events) d.removeEventListener(ev, cb);
  };
}
