// =============================================================
//  fullscreen.js — نمایش تمام‌صفحه با پیش‌بندهای مرورگرها
//
//  ماژول «خالص» است: کارکرد را در لحظهٔ فراخوانی تشخیص می‌دهد
//  (نه هنگام import)، پس بدون مرورگر هم در تست اجرا می‌شود.
//
//  پشتیبانی:
//   • Chrome/Edge/Firefox: requestFullscreen (استاندارد)
//   • Safari: webkitRequestFullscreen (iOS ۱۶.۴ به بعد)
//   • IE11/Edge قدیم: msRequestFullscreen
//   • Firefox قدیم: mozRequestFullScreen
//
//  اگر مرورگر هیچ‌کدام را ندهد (مثلاً iOS قدیم)، به‌جای دکمهٔ
//  مرده، caller پیام راهنما نشان می‌دهد.
// =============================================================

/**
 * API تمام‌صفحهٔ در دسترس را برمی‌گرداند یا null.
 * @returns {{name:string, enter:Function, exit:Function, isFull:Function, change:string} | null}
 */
export function fullscreenApi() {
  if (typeof document === 'undefined') return null;
  const d = document;
  const el = d.documentElement;
  if (el && typeof el.requestFullscreen === 'function') {
    return {
      name: 'standard',
      enter: () => el.requestFullscreen(),
      exit: () => d.exitFullscreen(),
      isFull: () => !!d.fullscreenElement,
      change: 'fullscreenchange',
    };
  }
  if (el && typeof el.webkitRequestFullscreen === 'function') {
    return {
      name: 'webkit',
      enter: () => el.webkitRequestFullscreen(),
      exit: () => d.webkitExitFullscreen(),
      isFull: () => !!d.webkitFullscreenElement,
      change: 'webkitfullscreenchange',
    };
  }
  if (el && typeof el.msRequestFullscreen === 'function') {
    return {
      name: 'ms',
      enter: () => el.msRequestFullscreen(),
      exit: () => d.msExitFullscreen(),
      isFull: () => !!d.msFullscreenElement,
      change: 'MSFullscreenChange',
    };
  }
  if (el && typeof el.mozRequestFullScreen === 'function') {
    return {
      name: 'moz',
      enter: () => el.mozRequestFullScreen(),
      exit: () => d.mozCancelFullScreen(),
      isFull: () => !!d.mozFullScreenElement,
      change: 'mozfullscreenchange',
    };
  }
  return null;
}

/** آیا حالا در حالت تمام‌صفحه‌ایم؟ */
export function isFullscreen() {
  const api = fullscreenApi();
  return !!(api && api.isFull());
}

/**
 * ورود/خروج از حالت تمام‌صفحه.
 * @returns {{ok:boolean, action?:'enter'|'exit', reason?:string}}
 */
export function toggleFullscreen() {
  const api = fullscreenApi();
  if (!api) return { ok: false, reason: 'unsupported' };
  try {
    if (api.isFull()) {
      const p = api.exit();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return { ok: true, action: 'exit' };
    }
    const p = api.enter();
    if (p && typeof p.catch === 'function') p.catch(() => {}); // مثلاً کاربر رد کرد
    return { ok: true, action: 'enter' };
  } catch (e) {
    return { ok: false, reason: (e && e.name) || 'error' };
  }
}
