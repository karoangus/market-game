// =============================================================
//  progress.js — پیشرفتِ بازیکن: مرحله‌های بازشده، ستاره‌ها، رکوردها
//  بدون DOM کار می‌کند تا در تست نود هم قابل استفاده باشد.
// =============================================================
export const SAVE_KEY = 'borj-save-v1';

/** ذخیره‌گاه امن (اگر localStorage نبود یا خطا داد، حافظهٔ موقت) */
const memory = { data: null };
function store() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const t = '__borj_probe__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return localStorage;
    }
  } catch {}
  return {
    getItem: () => memory.data,
    setItem: (_k, v) => {
      memory.data = v;
    },
  };
}

export function emptySave() {
  return { cleared: [], stars: {}, best: {}, coins: {}, sound: true };
}

export function load() {
  try {
    const raw = store().getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const s = JSON.parse(raw);
    return {
      cleared: Array.isArray(s.cleared) ? s.cleared : [],
      stars: s.stars && typeof s.stars === 'object' ? s.stars : {},
      best: s.best && typeof s.best === 'object' ? s.best : {},
      coins: s.coins && typeof s.coins === 'object' ? s.coins : {},
      sound: s.sound !== false,
    };
  } catch {
    return emptySave();
  }
}

export function save(s) {
  try {
    store().setItem(SAVE_KEY, JSON.stringify(s));
  } catch {}
}
export function clear() {
  try {
    store().setItem(SAVE_KEY, JSON.stringify(emptySave()));
  } catch {}
}

// ---------------------------------------------------------------
//  ستاره‌ها
//  ⭐ یکی: رسیدن به دروازه
//  ⭐⭐ سرعت (بیش از نیمی از زمان باقی بماند) یا همهٔ سکه‌ها
//  ⭐⭐⭐ هم سرعت، هم همهٔ سکه‌ها
// ---------------------------------------------------------------
export function starsFor(level, { timeUsed = 0, coins = 0, coinTotal = 0 } = {}) {
  const time = level.time || 60;
  const fast = timeUsed <= time / 2;
  const all = coinTotal > 0 && coins >= coinTotal;
  if (fast && all) return 3;
  if (fast || all) return 2;
  return 1;
}

/** آیا مرحلهٔ i باز است؟ مرحلهٔ اول همیشه، بقیه با تمام‌کردن قبلی */
export function isUnlocked(s, i) {
  if (i <= 0) return true;
  return s.cleared.includes(i - 1);
}

/** ثبت نتیجهٔ یک برد. خروجی: { stars, improved } */
export function record(s, index, { timeUsed = 0, coins = 0, coinTotal = 0, level } = {}) {
  const stars = starsFor(level || { time: 60 }, { timeUsed, coins, coinTotal });
  const improved = (s.stars[index] || 0) < stars;
  if (improved) s.stars[index] = stars;
  if (!s.cleared.includes(index)) s.cleared.push(index);
  s.cleared.sort((a, b) => a - b);
  const b = s.best[index];
  if (b == null || timeUsed < b) s.best[index] = Math.round(timeUsed * 10) / 10;
  const c = s.coins[index];
  if (c == null || coins > c) s.coins[index] = coins;
  save(s);
  return { stars, improved };
}

/** مجموع ستاره‌های گرفته‌شده */
export function totalStars(s) {
  return Object.values(s.stars).reduce((a, b) => a + b, 0);
}
