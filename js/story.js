// =============================================================
//  story.js — لایهٔ داستان بازی
//
//  هر روز یک «قصه» دارد: هوا چطور است، چه رویدادی در محله افتاده و
//  مأموریت امروزِ فروشگاه چیست. همین چیزها باعث می‌شوند هر روز با
//  روز قبل فرق کند: بعضی روزها شلوغ، بعضی خلوت، بعضی پرسود.
//
//  ⚠️ نکتهٔ اقتصادی: این لایه فقط «تعداد مشتری» و «سخت‌پسندی» را
//     عوض می‌کند، نه قیمت‌ها و نه پول را — پس تعادل اقتصاد بازی
//     دست‌نخورده می‌ماند.
// =============================================================

const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

/** هواها: روی سرعت آمدن مشتری‌ها اثر دارند */
export const WEATHERS = {
  sun: { id: 'sun', name: 'آفتابی', emoji: '☀️', speed: 1, note: 'هوا آفتابی است — مردم برای قدم‌زدن می‌آیند.' },
  cloud: { id: 'cloud', name: 'ابری', emoji: '⛅', speed: 0.94, note: 'هوا ابری است؛ روز معمولی.' },
  rain: { id: 'rain', name: 'بارانی', emoji: '🌧️', speed: 0.78, note: 'باران می‌بارد؛ کمتر کسی بیرون می‌آید.' },
  snow: { id: 'snow', name: 'برفی', emoji: '❄️', speed: 0.68, note: 'برف آمده؛ فروشگاه تقریباً خلوت است.' },
};

/** رویدادهای محله */
export const EVENTS = [
  { id: 'festival', name: 'جشن محله', emoji: '🎉', bias: 4, rate: 1.15, desc: 'امشب جشن محله است؛ همه برای خرید می‌آیند!' },
  { id: 'payday', name: 'روز حقوق', emoji: '💼', bias: 2, generous: 0.12, desc: 'امروز حقوق پرداخت شده؛ مشتری‌ها دست‌ودل‌بازترند.' },
  { id: 'schoolOff', name: 'تعطیلی مدرسه', emoji: '🧒', bias: 3, rate: 1.1, desc: 'مدرسه‌ها تعطیل‌اند؛ بچه‌ها با پدر و مادر می‌آیند.' },
  { id: 'heat', name: 'گرمای شدید', emoji: '🥵', bias: 1, desc: 'گرما بیداد می‌کند؛ تشنه‌ها سرازیر می‌شوند.' },
  { id: 'rival', name: 'رقیب تخفیف گذاشت', emoji: '🏪', bias: -1, tough: 0.18, desc: 'فروشگاه روبه‌رو تخفیف زده؛ مشتری‌ها سخت‌پسند شده‌اند.' },
  { id: 'quiet', name: 'روز خلوت', emoji: '😴', bias: -3, rate: 0.85, desc: 'خیابان خلوت است؛ امروز روزِ آهسته‌ای است.' },
  { id: 'inspection', name: 'بازرس بهداشت', emoji: '🧑‍⚕️', bias: 1, desc: 'بازرس محله سر زده؛ همه تمیزکاری می‌کنند.' },
  { id: 'parade', name: 'رژهٔ خیابانی', emoji: '🎺', bias: 3, rate: 1.2, desc: 'رژه از جلوی فروشگاه رد می‌شود؛ جمعیت زیاد است!' },
];

/** مأموریت‌های روزانه — فقط تجربه (XP) می‌دهند، نه پول */
export const QUEST_TYPES = [
  {
    id: 'sell',
    label: 'فروشندهٔ روز',
    make: (day) => 3 + (day % 4),
    unit: 'قلم کالا',
    emoji: '📦',
    xp: 10,
    progress: (q, s) => s.itemsSold,
  },
  {
    id: 'buyers',
    label: 'مشتری‌های خوشحال',
    make: (day) => 3 + (day % 3),
    unit: 'خریدار',
    emoji: '🙋',
    xp: 8,
    progress: (q, s) => s.buyers,
  },
  {
    id: 'revenue',
    label: 'صندوق پرپول',
    make: () => 20 + Math.floor(Math.random() * 3) * 10,
    unit: 'دلار درآمد',
    emoji: '💰',
    xp: 12,
    progress: (q, s) => Math.round(s.revenue),
  },
  {
    id: 'crowd',
    label: 'فروشگاه شلوغ',
    make: (day) => 6 + (day % 3),
    unit: 'مشتری',
    emoji: '🚶',
    xp: 7,
    progress: (q, s) => s.customers,
  },
];

export const TICKER_LINES = [
  '🛒 فروشگاه باز است — روز خوبی داشته باشی!',
  '💡 نکته: قیمت نزدیک‌تر به بازار = مشتری بیشتر',
  '🧹 کف فروشگاه برق می‌زند',
  '🔔 صدای صندوق، موسیقیِ کسب‌وکار است',
  '🥤 یادت نرود قفسه‌ها را پر کنی',
  '📈 هر روز قیمت بازار عوض می‌شود',
];

/** پیام‌های زندهٔ نوار خبر — بر اساس رویدادهای واقعی روز */
export function liveLine(kind, data = {}) {
  switch (kind) {
    case 'enter':
      return pick([
        '🚶 یک مشتری وارد شد',
        '🔔 در باز شد — مشتری جدید',
        '🛍️ یکی برای خرید آمد',
      ]);
    case 'sale':
      return `💰 ${data.n} قلم فروش رفت (+${data.rev} $)`;
    case 'soldout':
      return '⚠️ یک قفسه خالی شد — از تأمین‌کننده سفارش بده';
    case 'angry':
      return '😠 یک مشتری از قیمت‌ها ناراضی بود';
    case 'empty':
      return '🚪 مشتری دست‌خالی رفت';
    case 'queue':
      return '⏳ صف صندوق شلوغ شد';
    case 'welcome':
      return '🛒 فروشگاه باز است — روز خوبی داشته باشی!';
    case 'levelup':
      return `⭐ سطح ${data.level} شدی!`;
    default:
      return '🛒 فروشگاه من';
  }
}

// ---------------------------------------------------------------
//  سطح و تجربه
// ---------------------------------------------------------------
/** تجربهٔ لازم برای هر سطح (سطح ۱ = ۰) */
export const LEVEL_XP = [0, 14, 34, 62, 100, 150, 212, 288, 380, 490, 620];

export function levelInfo(xp = 0) {
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) level = i + 1;
  const base = LEVEL_XP[level - 1] ?? 0;
  const next = LEVEL_XP[level] ?? base + 200;
  return {
    level,
    xp,
    base,
    next,
    progress: next > base ? Math.min(1, (xp - base) / (next - base)) : 1,
  };
}

/** عنوان فروشگاه بر اساس سطح — برای گزارش و HUD */
export function levelTitle(level) {
  if (level >= 10) return 'امپراتور سوپرمارکت';
  if (level >= 8) return 'زنجیرهٔ محبوب محله';
  if (level >= 6) return 'فروشگاه بزرگ';
  if (level >= 4) return 'سوپرمارکت شناخته‌شده';
  if (level >= 3) return 'فروشگاه خوش‌نام';
  if (level >= 2) return 'بقالی سرِ خیابان';
  return 'سوپرمارکت تازه‌کار';
}

// ---------------------------------------------------------------
//  چرخاندن داستان روز
// ---------------------------------------------------------------
/** هوا: روز اول همیشه آفتابی است تا بازیکن با آرامش یاد بگیرد */
export function rollWeather(day, rnd = Math.random) {
  if (day <= 1) return WEATHERS.sun;
  const r = rnd();
  if (r < 0.45) return WEATHERS.sun;
  if (r < 0.72) return WEATHERS.cloud;
  if (r < 0.93) return WEATHERS.rain;
  return WEATHERS.snow;
}

/** رویداد: بعضی روزها هیچ رویدادی نیست (بی‌خبری هم خبر است) */
export function rollEvent(day, rnd = Math.random) {
  if (day <= 1) return null;
  if (rnd() < 0.4) return null;
  return pick(EVENTS, rnd);
}

/** مأموریت امروز */
export function rollQuest(day, rnd = Math.random) {
  const type = QUEST_TYPES[Math.floor(rnd() * QUEST_TYPES.length) % QUEST_TYPES.length];
  const target = type.make(day);
  return { id: type.id, label: type.label, emoji: type.emoji, unit: type.unit, target, xp: type.xp, done: false };
}

export function questProgress(quest, stats) {
  if (!quest) return 0;
  const type = QUEST_TYPES.find((t) => t.id === quest.id);
  if (!type) return 0;
  return Math.min(quest.target, Math.max(0, type.progress(quest, stats || {})));
}

export function evaluateQuest(quest, stats) {
  if (!quest) return false;
  return questProgress(quest, stats) >= quest.target;
}

/**
 * اعمال اثر هوا/رویداد/سطح روی یک روز.
 * خروجی: توضیح‌های انسانی برای نمایش در کارت شروع روز.
 */
export function applyDay(state, day, event, weather) {
  const w = weather || WEATHERS.sun;
  state.weather = w.id;
  state.weatherSpeed = w.speed;
  state.customerBias = event ? event.bias || 0 : 0;
  state.rateMul = (event && event.rate) || 1;
  state.toughness = (event && event.tough) || 0;
  state.generous = (event && event.generous) || 0;
  // سطح فروشگاه روی جذابیتش اثر می‌گذارد (حداکثر ۱۵٪)
  const lv = levelInfo(state.xp || 0).level;
  state.reputationMul = 1 + Math.min(0.15, (lv - 1) * 0.02);
  return { weather: w, event };
}

/** پیام پایان مأموریت */
export function questResultText(quest, stats) {
  if (!quest) return '';
  const p = questProgress(quest, stats);
  const ok = p >= quest.target;
  return ok
    ? `${quest.emoji} مأموریت «${quest.label}» انجام شد! +${quest.xp} تجربه`
    : `${quest.emoji} مأموریت «${quest.label}» ناتمام ماند (${p}/${quest.target} ${quest.unit})`;
}

/** جملهٔ داستانی پایان روز — بر اساس نتیجهٔ واقعی */
export function daySummaryLine(stats, money) {
  const profit = (stats.revenue || 0) - (stats.expenses || 0);
  if (stats.customers === 0) return 'امروز هیچ‌کس نیامد… فردا بهتر می‌شود.';
  if (profit < 0) return 'امروز بیشتر خرج کردی تا فروختی — قفسه‌ها پر شد، فردا می‌فروشی.';
  if (profit === 0) return 'سربه‌سر بود؛ نه سود، نه ضرر.';
  if (stats.buyers / Math.max(1, stats.customers) > 0.9) return 'تقریباً همهٔ مشتری‌ها خرید کردند — قیمت‌گذاری‌ات عالی بود!';
  if (profit > 60) return 'روز پرسودی بود! صندوق سنگین شد.';
  return 'روز خوبی بود؛ همین‌طور ادامه بده.';
}
