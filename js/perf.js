// =============================================================
//  perf.js — کیفیت تطبیقی رندر (روانی روی هر گوشی)
//
//  چرا؟ رزولوشن رندر بزرگ‌ترین هزینهٔ GPU در این بازی است. روی
//  گوشی‌های ضعیف، رندر با devicePixelRatio کامل (۲× یا ۳×) یعنی
//  میلیون‌ها پیکسل اضافه و افت فریم. این ماژول «فریم‌تایم» را با
//  میانگین نمایی (EMA) زیر نظر می‌گیرد و رزولوشن رندر را پله‌ای
//  کم/زیاد می‌کند — با هیسترزیس و زمان سرد، تا هیچ‌وقت نپرد.
//
//  نتیجه: روی گوشی قدرتمند همیشه تیز؛ روی گوشی ضعیف خودکار «روان».
//  هیچ چیزی یک‌بار برای همیشه کم نمی‌شود: اگر صحنه خلوت شد، کیفیت
//  خودش برمی‌گردد بالا.
//
//  توابع خالص (shouldChangeQuality / pickPixelRatio / adjustScale)
//  بدون مرورگر در تست اجرا می‌شوند.
// =============================================================

/** پله‌های مقیاس رزولوشن — ۱ یعنی کامل (تا سقف DPR=۲) */
export const QUALITY_SCALES = [1, 0.85, 0.72, 0.6];

/**
 * تصمیم خالص: با وضعیت فعلی، باید کیفیت عوض شود؟
 * قرارداد: +۱ یعنی «یک پله به سمت ایندکسِ بالاتر» (= کیفیت پایین‌تر،
 * رزولوشن کمتر) و −۱ یعنی «یک پله به سمت ایندکسِ پایین‌تر» (= کیفیت
 * بهتر). QUALITY_SCALES[۰] بهترین کیفیت است.
 * @param {{emaMs:number, badStreak:number, goodStreak:number,
 *          msSinceChange:number, scaleIndex:number}} s
 * @returns {number} +۱ افت کیفیت، −۱ ارتقای کیفیت، ۰ بدون تغییر
 */
export function shouldChangeQuality(s) {
  const ema = s.emaMs;
  if (!Number.isFinite(ema)) return 0;
  const canUp = s.scaleIndex > 0; // جا برای بهتر شدن هست؟
  const canDown = s.scaleIndex < QUALITY_SCALES.length - 1; // جا برای سبک‌تر شدن هست؟
  if (!canUp && !canDown) return 0;
  // بعد از هر تغییر، حداقل ۳ ثانیه صبر تا عدد ساکن شود
  if (s.msSinceChange < 3000) return 0;

  // افت جدی؟ (زیر ~۴۵ فریم) — زود تصمیم بگیر: یک پله سبک‌تر
  if (canDown && s.badStreak >= 40) return 1;
  // بهبود پایدار؟ (حدود ۵ ثانیه فریم سریع) — کم‌کم برگرد بالا
  if (canUp && s.goodStreak >= 300) return -1;
  return 0;
}

/** سقف/کفِ معقول برای DPR نهایی */
export function pickPixelRatio(baseRatio, scale) {
  const base = Math.max(0.5, Math.min(2, baseRatio || 1));
  const k = Math.max(0.4, Math.min(1, scale || 1));
  return Math.max(0.4, Math.min(2, Math.round(base * k * 100) / 100));
}

/** ایندکس پلهٔ بعدی با محدودسازی بازه */
export function adjustScale(index, delta) {
  return Math.max(0, Math.min(QUALITY_SCALES.length - 1, index + delta));
}

/**
 * مانیتور فریم‌تایم — در حلقهٔ بازی تغذیه می‌شود.
 *  - push(dt): هر فریم
 *  - tick(now): اگر پله عوض شود، مقدار جدید و «علت» را برمی‌گرداند
 */
export class PerfMonitor {
  constructor({ baseRatio = 1, onChange = null } = {}) {
    this.baseRatio = baseRatio;
    this.onChange = onChange;
    this.scaleIndex = 0;
    this.emaMs = 16.7; // حدس خوش‌بینانهٔ شروع
    this.badStreak = 0;
    this.goodStreak = 0;
    this.lastChangeAt = 0;
    this.lowestIndex = 0;
    this._started = false;
  }

  setBaseRatio(r) {
    if (Number.isFinite(r) && r > 0) this.baseRatio = r;
  }

  /** @param {number} dt ثانیه */
  push(dt) {
    if (!(dt > 0)) return;
    // شکافِ بزرگ (تب مخفی، بریک‌پوینت، قفل‌شدن پروسه…) یعنی آمار
    // «پشت‌سرهم بودن» فریم‌ها باطل است — streakها را پاک کن و فریم
    // را در آمار حساب نکن؛ وگرنه بعد از برگشت به بازی، یک تصمیم
    // اشتباهِ موروثی گرفته می‌شود.
    if (dt > 0.25) {
      this.badStreak = 0;
      this.goodStreak = 0;
      return;
    }
    const ms = dt * 1000;
    const a = 0.06; // وزن EMA
    this.emaMs = this.emaMs + (ms - this.emaMs) * a;
    if (this.emaMs > 22.5) {
      this.badStreak++;
      this.goodStreak = 0;
    } else if (this.emaMs < 14.8) {
      this.goodStreak++;
      this.badStreak = 0;
    } else {
      this.badStreak = 0;
      this.goodStreak = 0;
    }
  }

  reset(now = 0) {
    this.badStreak = 0;
    this.goodStreak = 0;
    this.lastChangeAt = now;
  }

  /**
   * هر فریم صدا بزن؛ اگر پله تغییر کند، {scaleIndex, ratio, down, firstDown} برمی‌گرداند.
   * @param {number} now میلی‌ثانیه (performance.now())
   */
  tick(now) {
    const delta = shouldChangeQuality({
      emaMs: this.emaMs,
      badStreak: this.badStreak,
      goodStreak: this.goodStreak,
      msSinceChange: now - this.lastChangeAt,
      scaleIndex: this.scaleIndex,
    });
    if (!delta) return null;
    const prev = this.scaleIndex;
    this.scaleIndex = adjustScale(this.scaleIndex, delta);
    this.reset(now);
    const ratio = pickPixelRatio(this.baseRatio, QUALITY_SCALES[this.scaleIndex]);
    this.lowestIndex = Math.max(this.lowestIndex, this.scaleIndex);
    const result = {
      scaleIndex: this.scaleIndex,
      ratio,
      down: delta > 0, // کیفیت پایین آمد (رزولوشن کم شد)
      up: delta < 0, // کیفیت برگشت بالا
      firstDown: delta > 0 && prev === 0,
    };
    if (this.onChange) this.onChange(result);
    return result;
  }

  /** برچسب انسانی کیفیت فعلی — برای پنل فروشگاه */
  get label() {
    const p = Math.round(QUALITY_SCALES[this.scaleIndex] * 100);
    return p >= 100 ? 'عالی' : p >= 80 ? 'خوب' : p >= 70 ? 'روان' : 'سبک';
  }
}
