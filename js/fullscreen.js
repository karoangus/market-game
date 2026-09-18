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
//
//  این نسخه:
//   • همهٔ پیشوندها (standard, webkit, moz, ms) را می‌شناسد.
//   • enter/exit را با Promise مدیریت می‌کند و خطا را برمی‌گرداند.
//   • روی موبایل سعی می‌کند جهت صفحه را portrait قفل کند.
//   • fallback شبه‌تمام‌صفحه برای iOS قدیم (pseudo-fullscreen).
//   • تابع onFullscreenChange برای گوش دادن به همهٔ رویدادها.
//   • toggleFullscreen قدیمی (sync) برای سازگاری با تست‌ها حفظ شد.
// =============================================================

/** @returns {Document|undefined} */
function getDoc() {
  return typeof document !== 'undefined' ? document : undefined;
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
      // اگر موفق بود، سعی کن portrait قفل کنی (مخصوص موبایل)
      // تاخیر کوچک تا fullscreen اعمال شود (بعضی مرورگرها فقط بعد از fullscreen اجازه قفل می‌دهند)
      setTimeout(() => {
        tryLockPortrait();
      }, 150);
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
    // باز هم سعی کن portrait قفل کنی
    tryLockPortrait();
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
    await tryUnlockOrientation();
    return { ok: true };
  }

  const fn = getExitFn();
  if (!fn) return { ok: false };
  try {
    const p = fn();
    if (p && typeof p.then === 'function') await p;
    await tryUnlockOrientation();
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
          tryLockPortrait();
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
      // unlock orientation async
      tryUnlockOrientation();
      return { ok: true, action: 'exit' };
    }
    const p = api.enter();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
      // بعضی مرورگرها فقط بعد از resolve اجازه قفل می‌دهند
      if (p.then) {
        p.then(() => tryLockPortrait()).catch(() => {});
      } else {
        tryLockPortrait();
      }
    } else {
      tryLockPortrait();
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
