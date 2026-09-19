// =============================================================
//  test/sky.test.mjs — تست چرخهٔ شبانه‌روز (sky.js)
//
//  نمونه‌برداری رنگ آسمان در طول روز فروشگاه باید پیوسته، محدود
//  و منطقی باشد: صبح روشن، غروب گرم، شب تیره با چراغ‌های روشن‌تر.
// =============================================================
import { sampleSkyPhase, rgbToHex } from '../js/sky.js';

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
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const warmth = (c) => c[0] - c[2]; // قرمز منهای آبی

console.log('— مرزها —');
const at0 = sampleSkyPhase(0);
const at1 = sampleSkyPhase(1);
const atNeg = sampleSkyPhase(-3);
const atBig = sampleSkyPhase(42);
const atNaN = sampleSkyPhase(NaN);
check(at0 && at1 && atNeg && atBig && atNaN, 'نمونه‌گیری در ورودی‌های مرزی به خطا نمی‌خورد');
check(JSON.stringify(atNeg) === JSON.stringify(at0), 'k منفی → گیر می‌افتد به ۰ (صبح)');
check(JSON.stringify(atBig) === JSON.stringify(at1), 'k بزرگ → گیر می‌افتد به ۱ (شب)');
check(JSON.stringify(atNaN) === JSON.stringify(at0), 'k نامعتبر → صبح');

console.log('— منطق روز —');
const morning = sampleSkyPhase(0);
const noon = sampleSkyPhase(0.3);
const sunset = sampleSkyPhase(0.76);
const night = sampleSkyPhase(1);
check(lum(night.sky) < lum(morning.sky) / 2, 'شب به‌طور محسوس تیره‌تر از صبح است');
check(warmth(sunset.sky) > warmth(noon.sky), 'غروب گرم‌تر (نارنجی‌تر) از ظهر است');
check(sunset.sunI < noon.sunI, 'شدت خورشید در غروب کمتر از ظهر است');
check(night.sunI < 0.5, 'شب خورشید تقریباً خاموش است');
check(night.inI > morning.inI * 1.5, 'شب چراغ‌های داخل فروشگاه خیلی روشن‌ترند');
check(night.night === 1 && morning.night === 0, 'شاخصِ شب: صبح ۰ و شب ۱');

console.log('— پیوستگی (بدون پرش رنگ) —');
let maxStep = 0;
let bigSteps = 0;
let prev = sampleSkyPhase(0);
for (let i = 1; i <= 200; i++) {
  const cur = sampleSkyPhase(i / 200);
  for (let ch = 0; ch < 3; ch++) {
    const st = Math.abs(cur.sky[ch] - prev.sky[ch]);
    if (st > 0.01) bigSteps++;
    maxStep = Math.max(maxStep, st);
  }
  prev = cur;
}
// گذر غروب (نارنجی→سرمه‌ای) تندترین شیب را دارد؛ در گام ۰٫۰۰۵ از k
// جهش هر نمونه باید کوچک باشد و تغییر در «بسیاری از نمونه‌ها» پخش
// شود (نه اینکه یک‌باره بپرد).
check(maxStep < 0.04, `بزرگ‌ترین جهش رنگ بین نمونه‌های متوالی کم است (${maxStep.toFixed(4)})`);
check(bigSteps > 20, `تغییر رنگ روی نمونه‌های زیادی پخش است (${bigSteps} گام > ۰٫۰۱)`);

console.log('— هوا —');
const rainNoon = sampleSkyPhase(0.3, 'rain');
const snowNoon = sampleSkyPhase(0.3, 'snow');
const cloudNoon = sampleSkyPhase(0.3, 'cloud');
const sunNoon = sampleSkyPhase(0.3, 'sun');
check(lum(rainNoon.sky) < lum(sunNoon.sky), 'باران آسمان را خاکستری/تیره‌تر می‌کند');
check(lum(snowNoon.sky) < lum(sunNoon.sky), 'برف هم خاکستری می‌کند');
check(rainNoon.sunI < sunNoon.sunI, 'در باران خورشید کم‌سوتر است');
check(lum(cloudNoon.sky) < lum(sunNoon.sky), 'ابری ملایم‌تر از باران خاکستری است');

console.log('— کمکی‌ها —');
check(rgbToHex([1, 0, 0]) === 0xff0000, 'rgbToHex قرمز');
check(rgbToHex([0.2, 0, 1.4]) === (51 << 16 | 255), 'rgbToHex کلمپ می‌کند');

console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed > 0) process.exit(1);
