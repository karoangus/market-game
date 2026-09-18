// =============================================================
//  anim.js — کمکی‌های انیمیشن (میان‌یابی، easing، سیستم تویین)
//
//  همهٔ انیمیشن‌های بازی (برداشتن کالا با دست، رفتن کالا به سبد،
//  اسکن روی صندوق، باز/بسته‌شدن در، پول شناور…) از این‌جا رد
//  می‌شوند تا کد یک‌دست و قابل‌تنظیم باشد.
// =============================================================
import * as THREE from 'three';

export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};
export const easeOutBounce = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/** وزنهٔ نرم برای حرکت (نزدیک رسیدن آرام می‌شود) */
export const nearness = (t) => clamp01(t);

/**
 * سیستم تویین ساده — هر تویین یک بازهٔ زمانی با easing دارد.
 * `dur` بر حسب ثانیه، `from`/`to` عدد یا وکتور، `onUpdate(k)` با k بین ۰ و ۱.
 */
export class Tweens {
  constructor() {
    this.list = [];
  }
  get busy() {
    return this.list.length > 0;
  }
  /** @returns {object} تویین (برای لغو: tween.kill = true) */
  add({ dur = 0.3, delay = 0, ease = easeOutCubic, onUpdate, onDone, tag = '' }) {
    const tw = { t: -delay, dur, ease, onUpdate, onDone, tag, kill: false };
    this.list.push(tw);
    return tw;
  }
  delay(dur) {
    return this.add({ dur, onUpdate: () => {}, ease: (t) => t });
  }
  cancel(tag) {
    for (const tw of this.list) if (tw.tag === tag) tw.kill = true;
  }
  clear() {
    this.list.length = 0;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.kill) {
        this.list.splice(i, 1);
        continue;
      }
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = tw.dur <= 0 ? 1 : clamp01(tw.t / tw.dur);
      if (tw.onUpdate) tw.onUpdate(tw.ease ? tw.ease(k) : k, k);
      if (k >= 1) {
        this.list.splice(i, 1);
        if (tw.onDone) tw.onDone();
      }
    }
  }
}

/** میان‌یابی خطی بین دو وکتور (بدون تخصیص حافظهٔ جدید در هر فریم) */
export function lerpVectors(out, a, b, t) {
  out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  return out;
}

/**
 * یک قوس زیبا برای جابه‌جایی اشیاء (کالا از قفسه به دست، از دست به سبد…)
 * @param {THREE.Vector3} out خروجی
 * @param {THREE.Vector3} a مبدأ
 * @param {THREE.Vector3} b مقصد
 * @param {number} k پیشرفت ۰..۱
 * @param {number} arc ارتفاع قوس
 */
export function arcLerp(out, a, b, k, arc = 0.18) {
  out.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k) + Math.sin(Math.PI * k) * arc, lerp(a.z, b.z, k));
  return out;
}

/** نوسان نرم (برای نفس‌کشیدن، تاب‌خوردن، لرزش) */
export const wave = (t, speed = 1, phase = 0) => Math.sin(t * speed + phase);
