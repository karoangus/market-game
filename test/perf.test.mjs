// =============================================================
//  test/perf.test.mjs — تست کیفیت تطبیقی رندر (perf.js)
//
//  چرا این تست مهم است؟ تصمیم‌های «کم/زیاد کردن رزولوشن» باید
//  پایدار و بدون پرش باشند: با هیسترزیس، زمان سرد و محدودسازی
//  بازه. این تست همان توابع خالص را زیر آزمون می‌گذارد.
// =============================================================
import {
  QUALITY_SCALES,
  shouldChangeQuality,
  pickPixelRatio,
  adjustScale,
  PerfMonitor,
} from '../js/perf.js';

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

console.log('— پله‌های کیفیت —');
check(Array.isArray(QUALITY_SCALES) && QUALITY_SCALES.length >= 3, 'حداقل ۳ پلهٔ کیفیت داریم');
check(QUALITY_SCALES[0] === 1, 'پلهٔ اول = کیفیت کامل');
check(QUALITY_SCALES.every((s) => s > 0.4 && s <= 1), 'همهٔ پله‌ها بین ۰٫۴ و ۱ هستند');
check(
  QUALITY_SCALES.every((s, i) => i === 0 || s < QUALITY_SCALES[i - 1]),
  'پله‌ها نزولی‌اند'
);

console.log('— تصمیم تغییر کیفیت (shouldChangeQuality) —');
// قرارداد: +۱ = یک پله سبک‌تر (ایندکس بالاتر)، −۱ = یک پله باکیفیت‌تر
check(
  shouldChangeQuality({ emaMs: 16.7, badStreak: 0, goodStreak: 0, msSinceChange: 99999, scaleIndex: 0 }) === 0,
  'فریم سالم → بدون تغییر'
);
check(
  shouldChangeQuality({ emaMs: 30, badStreak: 50, goodStreak: 0, msSinceChange: 99999, scaleIndex: 1 }) === 1,
  'افت پایدار فریم → یک پله سبک‌تر (+۱)'
);
check(
  shouldChangeQuality({ emaMs: 12, badStreak: 0, goodStreak: 400, msSinceChange: 99999, scaleIndex: 1 }) === -1,
  'بهبود پایدار → یک پله باکیفیت‌تر (−۱)'
);
check(
  shouldChangeQuality({ emaMs: 30, badStreak: 500, goodStreak: 0, msSinceChange: 500, scaleIndex: 1 }) === 0,
  '۳ ثانیهٔ سرد بعد از هر تغییر رعایت می‌شود'
);
check(
  shouldChangeQuality({ emaMs: 40, badStreak: 999, goodStreak: 0, msSinceChange: 99999, scaleIndex: QUALITY_SCALES.length - 1 }) === 0,
  'سبک‌ترین پله → دیگر سبک‌تر نمی‌شود'
);
check(
  shouldChangeQuality({ emaMs: 10, badStreak: 0, goodStreak: 9999, msSinceChange: 99999, scaleIndex: 0 }) === 0,
  'بالاترین کیفیت → دیگر ارتقا نمی‌گیرد'
);
check(shouldChangeQuality({ emaMs: NaN, badStreak: 0, goodStreak: 0, msSinceChange: 99999, scaleIndex: 0 }) === 0, 'EMA نامعتبر → بدون تغییر');

console.log('— DPR نهایی (pickPixelRatio) —');
check(pickPixelRatio(2, 1) === 2, 'DPR کامل = ۲ باقی می‌ماند');
check(pickPixelRatio(3, 1) === 2, 'DPR بالای ۲ به ۲ سقف می‌خورد');
check(Math.abs(pickPixelRatio(2, 0.6) - 1.2) < 1e-9, 'پلهٔ ۶۰٪ روی DPR=۲ → ۱٫۲');
check(pickPixelRatio(1, 0.6) === 0.6, 'پلهٔ ۶۰٪ روی DPR=۱ → ۰٫۶');
check(pickPixelRatio(2, 99) === 2, 'مقیاسِ نامعتبر بزرگ → از پایه بالاتر نمی‌رود');
check(pickPixelRatio(0.1, 0.5) >= 0.4, 'کف مطلق ۰٫۴ رعایت می‌شود');

console.log('— محدودسازی ایندکس (adjustScale) —');
check(adjustScale(0, -1) === 0, 'از بهترین کیفیت بالاتر نمی‌رود');
check(adjustScale(QUALITY_SCALES.length - 1, 1) === QUALITY_SCALES.length - 1, 'از سبک‌ترین پله پایین‌تر نمی‌رود');
check(adjustScale(1, -1) === 0 && adjustScale(1, 1) === 2, 'حرکت عادی بین پله‌ها');

console.log('— PerfMonitor (جریان واقعی فریم) —');
{
  const mon = new PerfMonitor({ baseRatio: 2 });
  check(mon.scaleIndex === 0, 'شروع از بالاترین کیفیت');
  const events = [];
  mon.onChange = (r) => events.push(r);
  // ۸۰ فریم سنگین پشت‌سرهم (۲۵fps) — باید سبک‌تر شود
  const now0 = 1000;
  let t = now0;
  for (let i = 0; i < 80; i++) {
    mon.push(0.04); // ۴۰ms
    mon.tick(t);
    t += 40;
  }
  check(events.length >= 1, 'حداقل یک تغییر رخ داده');
  const first = events[0];
  check(first.down === true, 'فریم‌های سنگین پایدار → کاهش خودکار کیفیت');
  check(first.firstDown === true, 'اولین کاهش پرچم firstDown دارد');
  check(first.scaleIndex === 1, 'دقیقاً یک پله سبک‌تر شده');
  check(Math.abs(first.ratio - 1.7) < 1e-9, 'DPR جدید = ۲×۰٫۸۵ = ۱٫۷');
  // فریم‌های سبک پایدار → برمی‌گردد بالا
  // (اول «برگشت از وقفه» را شبیه‌سازی می‌کنیم: یک فریمِ خیلی بلند که
  // streakهای قدیمی را باطل می‌کند — همان کاری که rAF واقعی می‌کند)
  mon.push(3); // شکافِ ۳ ثانیه‌ای
  check(mon.badStreak === 0 && mon.goodStreak === 0, 'شکافِ بزرگ streakها را باطل می‌کند');
  t += 10000; // از زمان سرد رد شو
  const upEvents = [];
  mon.onChange = (r) => upEvents.push(r);
  for (let i = 0; i < 400; i++) {
    mon.push(0.012); // ۱۲ms
    mon.tick(t);
    t += 12;
  }
  check(upEvents.length >= 1 && upEvents[0].up === true, 'فریم‌های سبک پایدار → افزایش خودکار کیفیت');
  check(mon.scaleIndex === 0, 'برگشت به بالاترین کیفیت');
  check(mon.label === 'عالی', 'برچسب کیفیت «عالی»');
  // فریم‌های پرش‌دار (تب مخفی) نباید آمار را خراب کنند
  mon.reset(0);
  for (let i = 0; i < 30; i++) mon.push(5); // ۵ ثانیه!؟ clamp می‌شود به ۱۰۰ms
  check(Number.isFinite(mon.emaMs), 'فریم‌های خیلی بلند EMA را نامعتبر نمی‌کنند');
  const idxBefore = mon.scaleIndex;
  mon.tick(100000000); // تازه ریست شده → زمان سرد جلوی پرش را می‌گیرد
  check(mon.scaleIndex === idxBefore, 'بلافاصله بعد از ریست، تصمیمی گرفته نمی‌شود');
}

console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed > 0) process.exit(1);
