// =============================================================
//  state.js — وضعیت بازی + ذخیره‌سازی (localStorage)
//
//  ➕ سیستم‌های جدید (کارمند، انبار، شعبه و…) می‌توانند
//     فیلدهای خود را به همین آبجکت اضافه کنند و ذخیره/بارگذاری
//     بدون تغییر کار کند (loadGame فیلدهای قدیمی را هم حفظ می‌کند).
// =============================================================
import { PRODUCTS, GAME } from './config.js';

const SAVE_KEY = 'market-game-save-v1';

/** آمار یک روز (قبل از شروع مشتری‌ها) */
export function freshDayStats() {
  return { customers: 0, buyers: 0, itemsSold: 0, revenue: 0, expenses: 0 };
}

/** بازی جدید: سرمایهٔ ۱۰۰ دلار، روز ۱، قفسه‌های خالی */
export function newGameState() {
  const inventory = {};
  const salePrice = {};
  const market = {};
  for (const p of PRODUCTS) {
    inventory[p.id] = 0;
    salePrice[p.id] = p.basePrice + GAME.price.defaultMargin;
    market[p.id] = p.basePrice;
  }
  return {
    day: 1,
    money: GAME.startingMoney,
    inventory,
    salePrice,
    market,
    dayStats: freshDayStats(),
  };
}

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    /* حالت خصوصی مرورگر — بازی ادامه می‌یابد فقط ذخیره نمی‌شود */
  }
}

/**
 * بارگذاری ذخیره + سازگاری رو به جلو:
 * اگر محصول جدیدی به کاتالوگ اضافه شده باشد، در ذخیرهٔ قدیمی
 * با مقدار پیش‌فرض تکمیل می‌شود.
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s.day !== 'number' || typeof s.money !== 'number') return null;
    s.inventory = s.inventory || {};
    s.salePrice = s.salePrice || {};
    s.market = s.market || {};
    for (const p of PRODUCTS) {
      if (typeof s.inventory[p.id] !== 'number') s.inventory[p.id] = 0;
      if (typeof s.salePrice[p.id] !== 'number')
        s.salePrice[p.id] = p.basePrice + GAME.price.defaultMargin;
      if (typeof s.market[p.id] !== 'number') s.market[p.id] = p.basePrice;
    }
    if (!s.dayStats) s.dayStats = freshDayStats();
    return s;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    /* ignore */
  }
}
