// =============================================================
//  test/economy.test.mjs — تست‌های منطق اقتصاد (بدون مرورگر)
//  اجرا: node test/economy.test.mjs
// =============================================================
import { PRODUCTS, GAME } from '../js/config.js';
import { rollMarketPrices, buyChance, demandInfo } from '../js/economy.js';

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ FAIL:', msg);
  }
}

console.log('۱) محصولات و قیمت پایه‌ها');
check(PRODUCTS.length === 5, 'دقیقاً ۵ محصول وجود دارد');
const expected = { bread: 4, apple: 10, banana: 13, oil: 17, rice: 20 };
for (const [id, price] of Object.entries(expected)) {
  const p = PRODUCTS.find((x) => x.id === id);
  check(!!p, `محصول ${id} تعریف شده`);
  check(p && p.basePrice === price, `${id} قیمت پایه = ${price}`);
}
const ranges = { apple: [5, 20], banana: [7, 17], oil: [10, 20], rice: [15, 30] };
for (const [id, [min, max]] of Object.entries(ranges)) {
  const p = PRODUCTS.find((x) => x.id === id);
  check(p.priceRange.min === min && p.priceRange.max === max, `${id} محدوده [${min},${max}]`);
  check(p.fluctuates === true, `${id} نوسان فعال است`);
  check(p.basePrice >= min && p.basePrice <= max, `${id} قیمت پایه داخل محدوده است`);
}
check(PRODUCTS.find((p) => p.id === 'bread').fluctuates === false, 'نان فعلاً بدون نوسان (سیستم آماده است)');

console.log('۲) تنظیمات بازی');
check(GAME.startingMoney === 100, 'سرمایهٔ اولیه ۱۰۰ دلار');
check(GAME.storeSize.w * GAME.storeSize.d === 20, 'فروشگاه ۲۰ متر مربع است');

console.log('۳) روز اول = قیمت پایه');
const d1 = rollMarketPrices(1, {});
for (const p of PRODUCTS) check(d1[p.id] === p.basePrice, `روز۱ ${p.id} = ${p.basePrice}`);

console.log('۴) شبیه‌سازی ۶۰ روز — قیمت‌ها منطقی می‌مانند');
let prices = d1;
let changedEver = {};
let inRange = true;
let integer = true;
let breadStable = true;
for (let day = 2; day <= 60; day++) {
  const next = rollMarketPrices(day, prices);
  for (const p of PRODUCTS) {
    if (!p.fluctuates) {
      if (next[p.id] !== p.basePrice) breadStable = false;
      continue;
    }
    if (!Number.isInteger(next[p.id])) integer = false;
    if (next[p.id] < p.priceRange.min || next[p.id] > p.priceRange.max) inRange = false;
    if (next[p.id] !== prices[p.id]) changedEver[p.id] = true;
  }
  prices = next;
}
check(inRange, 'هیچ قیمتی از محدودهٔ [min,max] خارج نشد (۶۰ روز)');
check(integer, 'همهٔ قیمت‌ها عدد صحیح هستند');
check(
  Object.keys(changedEver).length === 4 && Object.values(changedEver).every(Boolean),
  'هر ۴ محصول متغیر در طول ۶۰ روز حداقل یک بار تغییر کرد'
);
check(breadStable, 'قیمت نان در ۶۰ روز ثابت ماند');

console.log('۵) رفتار مشتری (buyChance)');
check(buyChance(10, 8) >= 0.9, '۲ دلار ارزان‌تر از بازار → ≥۹۰٪ خرید');
check(buyChance(10, 10) >= 0.8, 'رو به روی بازار → ۸۰-۹۰٪');
check(buyChance(10, 12) >= 0.5 && buyChance(10, 12) <= 0.7, '۲ دلار گران‌تر → متوسط');
check(buyChance(10, 14) <= 0.15, '۴ دلار گران‌تر از بازار → خیلی کم (≤۱۵٪)');
check(buyChance(10, 15) === 0, '۵ دلار گران‌تر → اصلاً نمی‌خرند');
let monotone = true;
let prev = buyChance(10, 4);
for (let sell = 5; sell <= 16; sell++) {
  const c = buyChance(10, sell);
  if (c > prev + 1e-9) monotone = false;
  prev = c;
}
check(monotone, 'احتمال خرید با گران‌ترشدن از بازار هرگز بالا نمی‌رود');
check(buyChance(10, 11) >= buyChance(10, 13), 'نزدیک‌تر به بازار = احتمال بیشتر');
check(demandInfo(10, 15).cls === 'none', 'برچسب تقاضا برای +۵: «هیچ»');
check(demandInfo(10, 10).cls === 'good' || demandInfo(10, 10).cls === 'great', 'برچسب تقاضا برای قیمت منطقی: خوب/عالی');

console.log('');
console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed) process.exit(1);
