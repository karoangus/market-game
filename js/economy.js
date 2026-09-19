// =============================================================
//  economy.js — موتور اقتصاد بازی
//
//  - rollMarketPrices: نوسان قیمت بازار روزانه (تصادفی ولی منطقی)
//  - buyChance: احتمال خرید مشتری بر اساس اختلاف قیمت فروش/بازار
//  - demandInfo: برچسب «تقاضا» برای پنل قیمت‌گذاری
//
//  ➕ کالیبره‌کردن اقتصاد فقط با ویرایش همین فایل است؛
//     بقیهٔ بازی این توابع را صدا می‌زنند.
// =============================================================
import { PRODUCTS } from './config.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * قیمت بازار (خرید) را برای یک روز مشخص محاسبه می‌کند.
 *
 * - روز ۱: همهٔ محصولات روی قیمت پایه.
 * - روزهای بعد: «بلندای تصادفی محدود» (Random Walk) —
 *   قیمت از روز قبل جابه‌جا می‌شود، به‌آرامی به سمت قیمت پایه
 *   برگردانده می‌شود و هرگز از [min, max] خارج نمی‌شود.
 *
 * @param {number} day شمارهٔ روز
 * @param {Object<string, number>} [prevPrices] قیمت‌های روز قبل
 * @returns {Object<string, number>} قیمت بازار هر محصول
 */
export function rollMarketPrices(day, prevPrices = {}) {
  const out = {};
  for (const p of PRODUCTS) {
    // محصول بدون نوسان (فعلاً نان) یا روز اول: قیمت پایه
    if (!p.fluctuates || day <= 1) {
      out[p.id] = p.basePrice;
      continue;
    }
    const prev = typeof prevPrices[p.id] === 'number' ? prevPrices[p.id] : p.basePrice;
    const { min, max } = p.priceRange;
    const span = max - min;
    // در روز، حداکثر ~۲۰٪ بازهٔ قیمت تغییر می‌کند (تغییر منطقی، نه پرش عجیب)
    const step = Math.max(1, Math.round(span * 0.2));
    let next = prev + Math.round((Math.random() * 2 - 1) * step);
    // کشش ملایم به سمت قیمت پایه (ثبات بازار)
    next += (p.basePrice - next) * 0.15;
    out[p.id] = clamp(Math.round(next), min, max);
  }
  return out;
}

/**
 * احتمال اینکه مشتری با این قیمت فروش، محصول را بخرد.
 *
 * d = قیمت فروش − قیمت بازار (خرید)
 *   d ≤ −۲  → قطعی می‌خرد (حراج!)
 *   d = ۰..۲ → معمولی (سود منطقی)
 *   d = ۳..۴ → خیلی کم (دقیقاً نقطهٔ حساس که خواسته شد)
 *   d ≥ ۵   → اصلاً نمی‌خرند
 *
 * @param {number} marketPrice قیمت بازار/خرید
 * @param {number} sellPrice قیمت فروش تعیین‌شده توسط بازیکن
 * @returns {number} احتمال [0..1]
 */
export function buyChance(marketPrice, sellPrice) {
  const d = sellPrice - marketPrice;
  if (d <= -2) return 1.0;
  if (d <= -1) return 0.95;
  if (d <= 0) return 0.9;
  if (d <= 1) return 0.8;
  if (d <= 2) return 0.6;
  if (d <= 3) return 0.35;
  if (d <= 4) return 0.12;
  return 0;
}

/**
 * برچسب و رنگ «تقاضا» برای پنل قیمت‌گذاری —
 * به بازیکن می‌فهماند قیمتش رقابتی است یا نه.
 */
export function demandInfo(marketPrice, sellPrice) {
  const c = buyChance(marketPrice, sellPrice);
  if (c >= 0.9) return { label: 'عالی', cls: 'great', chance: c };
  if (c >= 0.7) return { label: 'خوب', cls: 'good', chance: c };
  if (c >= 0.4) return { label: 'متوسط', cls: 'mid', chance: c };
  if (c >= 0.1) return { label: 'کم', cls: 'low', chance: c };
  if (c > 0) return { label: 'خیلی کم', cls: 'verylow', chance: c };
  return { label: 'هیچ', cls: 'none', chance: 0 };
}
