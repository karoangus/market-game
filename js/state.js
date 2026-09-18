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
  return { customers: 0, buyers: 0, itemsSold: 0, revenue: 0, expenses: 0, abandoned: 0, happy: 0 };
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
    // ---------- لایهٔ داستان و پیشرفت ----------
    xp: 0, // تجربه
    level: 1, // سطح فروشگاه
    best: 0, // بهترین سود روزانه
    totalRevenue: 0, // درآمد کل
    history: [], // نتیجهٔ روزهای گذشته (برای نمودار گزارش)
    weather: 'sun',
    weatherSpeed: 1,
    customerBias: 0,
    rateMul: 1,
    toughness: 0,
    reputationMul: 1,
    quest: null, // مأموریت امروز
    storyDay: 0, // روزی که داستانش چیده شده
    sound: true,
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
    // سازگاری با ذخیرهٔ قدیمی: فیلدهای داستان/پیشرفت
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    s.dayStats.abandoned = num(s.dayStats.abandoned, 0);
    s.dayStats.happy = num(s.dayStats.happy, 0);
    s.xp = num(s.xp, 0);
    s.level = num(s.level, 1);
    s.best = num(s.best, 0);
    s.totalRevenue = num(s.totalRevenue, 0);
    s.history = Array.isArray(s.history) ? s.history.filter((h) => h && typeof h.day === 'number').slice(-14) : [];
    s.weather = typeof s.weather === 'string' ? s.weather : 'sun';
    s.weatherSpeed = num(s.weatherSpeed, 1);
    s.customerBias = num(s.customerBias, 0);
    s.rateMul = num(s.rateMul, 1);
    s.toughness = num(s.toughness, 0);
    s.reputationMul = num(s.reputationMul, 1);
    if (s.quest && typeof s.quest === 'object' && typeof s.quest.target === 'number') {
      /* مأموریت ذخیره‌شده معتبر است */
    } else {
      s.quest = null;
    }
    s.storyDay = num(s.storyDay, 0);
    s.sound = s.sound !== false;
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
