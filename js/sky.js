// =============================================================
//  sky.js — چرخهٔ روز (صبح → ظهر → غروب → شب) برای صحنه
//
//  فروشگاه از ساعت ۹ صبح باز می‌شود و تا ۲۱ شب کار می‌کند؛ پس
//  بیرونِ پنجره‌ها باید واقعاً عوض شود. این ماژول یک جدول کلیدِ
//  رنگ دارد و با یک میان‌یابی نرم بین‌شان، رنگ آسمان/مه، رنگ و
//  شدت خورشید، نور محیط و شدت چراغ‌های داخل فروشگاه را می‌دهد.
//
//  هزینه روی GPU: **صفر** — فقط چند lerp رنگی در CPU و ست‌کردن
//  چند رنگ موجود. هیچ آبجکت یا draw-call جدیدی اضافه نمی‌شود.
//
//  sampleSkyPhase(k) خالص است و بدون مرورگر در تست اجرا می‌شود.
// =============================================================

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * کلیدهای روز. k=۰ یعنی ۹ صبح (باز شدن فروشگاه)، k=۱ یعنی ۲۱ شب.
 *  sky   رنگ آسمان/پس‌زمینه
 *  sun   رنگ نور مستقیم خورشید
 *  sunI  شدت خورشید
 *  hemiI شدت نور محیط (Hemisphere)
 *  inI   شدت چراغ‌های داخل فروشگاه (شب روشن‌تر)
 *  night چقدر شب است (۰..۱) — برای رنگِ درخت/خیابان و…
 */
const KEYS = [
  { k: 0.0, sky: hex(0xa7d7f2), sun: hex(0xfff3dd), sunI: 2.0, hemiI: 1.1, inI: 0.55, night: 0 }, // ۹ صبح
  { k: 0.3, sky: hex(0x9ed8f7), sun: hex(0xffffff), sunI: 2.25, hemiI: 1.2, inI: 0.5, night: 0 }, // نیمروز
  { k: 0.55, sky: hex(0x9cc9ea), sun: hex(0xfff2d2), sunI: 1.8, hemiI: 1.05, inI: 0.62, night: 0.05 }, // بعدازظهر
  { k: 0.76, sky: hex(0xf0a86b), sun: hex(0xffab5e), sunI: 1.05, hemiI: 0.82, inI: 0.85, night: 0.35 }, // غروب
  { k: 0.9, sky: hex(0x51527f), sun: hex(0x8a7fae), sunI: 0.4, hemiI: 0.55, inI: 1.05, night: 0.75 }, // گرگ‌ومیش
  { k: 1.0, sky: hex(0x1d2b4d), sun: hex(0x4a5a86), sunI: 0.22, hemiI: 0.38, inI: 1.25, night: 1 }, // شب
];

/** خاکستریِ هوای ابری/بارانی — رنگ‌ها به سمت این می‌روند */
const GRAY = hex(0x8f9aa3);

/**
 * نمونهٔ وضعیت آسمان در نقطهٔ k از روز.
 * @param {number} k پیشرفت روز ۰..۱ (۹ صبح → ۲۱ شب)
 * @param {string} [weather] 'sun' | 'cloud' | 'rain' | 'snow'
 * @returns {{sky:number[], sun:number[], sunI:number, hemiI:number, inI:number, night:number}}
 */
export function sampleSkyPhase(k, weather = 'sun') {
  const t = clamp01(Number.isFinite(k) ? k : 0);
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i].k && t <= KEYS[i + 1].k) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const span = b.k - a.k || 1;
  const f = clamp01((t - a.k) / span);
  // نرم‌کردن بین کلیدها (smoothstep) تا گذر رنگ‌ها ناگهانی نپرد
  const e = f * f * (3 - 2 * f);
  const out = {
    sky: lerp3(a.sky, b.sky, e),
    sun: lerp3(a.sun, b.sun, e),
    sunI: lerp(a.sunI, b.sunI, e),
    hemiI: lerp(a.hemiI, b.hemiI, e),
    inI: lerp(a.inI, b.inI, e),
    night: lerp(a.night, b.night, e),
  };
  // هوا: باران/برف/ابری → رنگ‌ها به خاکستری می‌روند و خورشید کم‌سو می‌شود
  if (weather && weather !== 'sun') {
    const w = weather === 'cloud' ? 0.35 : 0.55;
    out.sky = lerp3(out.sky, GRAY, w);
    out.sun = lerp3(out.sun, GRAY, w * 0.5);
    out.sunI *= 1 - w * 0.45;
    out.hemiI *= 1 - w * 0.15;
    out.night = Math.min(1, out.night + w * 0.1);
  }
  return out;
}

/** رنگ [r,g,b] به عدد hex (برای تست/دیباگ) */
export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}
