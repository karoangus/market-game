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
// =============================================================
import { fullscreenApi, isFullscreen, toggleFullscreen } from '../js/fullscreen.js';

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

console.log('');
console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed) process.exit(1);
