// =============================================================
//  world.js — نقشهٔ آزاد ابسیدین: ۲۲ مکان، سفر آزاد بین آن‌ها
//  هر مکان خدمات، آدم‌ها و رویدادهای خودش را دارد.
//  encounters: کلید ENCOUNTERS برای برخوردهای تصادفی (کمین‌شمار)
// =============================================================
export const LOCATIONS = {
  sangab: {
    name: 'دهکدهٔ سنگاب', emoji: '🏘️', region: 'کوهستان', safe: true,
    desc: 'دهکده‌ای با بیست خانه و یک چاه. چاه را بیست سال پیش کندند و ده سال است کسی از آن آب نمی‌خورد.',
    neighbors: ['koli', 'jangal', 'chah_tarik'], services: ['inn', 'shop', 'smith', 'heal', 'train'],
    explore: { text: 'دور دهکده می‌گردی؛ بوی نان و دود و ترس.', loot: ['bread', 'herbal'], chance: 0.5 },
  },
  koli: {
    name: 'چهارراه کلاغ', emoji: '🛤️', region: 'راه‌ها', 
    desc: 'چهار راه که به چهار ولایت می‌رود. تیرِ چوبی با کلاغی که هیچ‌وقت پر نمی‌زند.',
    neighbors: ['sangab', 'jangal', 'shahr_kohan', 'kale_khaki', 'pooldar'], services: [],
    explore: { text: 'پای تیرِ کلاغ می‌ایستی؛ مسافران رد می‌شوند.', loot: ['waterskin'], chance: 0.4 },
    encounters: 'road', encounterChance: 0.45,
  },
  pooldar: {
    name: 'پلِ شکسته', emoji: '🌉', region: 'راه‌ها',
    desc: 'پلی که نیمه‌اش در آب افتاده. زیر پل، صدای کشیدن زنجیر می‌آید.',
    neighbors: ['koli', 'kale_khaki', 'karvansara'], services: [],
    explore: { text: 'زیر پل را می‌گردی؛ سکه و خونابه.', loot: ['gold'], chance: 0.6 },
    encounters: 'road', encounterChance: 0.5,
  },
  jangal: {
    name: 'جنگل زمزمه', emoji: '🌲', region: 'جنگل',
    desc: 'جنگلی که برگ‌هایش بی‌باد هم تکان می‌خورند. کسی که وسط جنگل بایستد، اسم خودش را می‌شنود.',
    neighbors: ['sangab', 'koli', 'kuh_ab', 'atlal'], services: [],
    explore: { text: 'در میان درخت‌ها راه می‌روی؛ چیزی مو‌به‌مو نگاهت می‌کند.', loot: ['herbal', 'gift_flower'], chance: 0.55 },
    encounters: 'forest', encounterChance: 0.55,
  },
  kuh_ab: {
    name: 'چشمهٔ کوه', emoji: '⛲', region: 'کوهستان', safe: true,
    desc: 'چشمه‌ای که آبش سرد است و سنگ‌های دورش نامهربان. آب این چشمه هر زخمی را می‌شوید.',
    neighbors: ['jangal', 'damane_kuh'], services: [], rest: 6,
    explore: { text: 'دست در آب می‌زنی؛ سرما تا شانه می‌رود.', loot: ['herbal'], chance: 0.6 },
  },
  damane_kuh: {
    name: 'دامنهٔ کوه', emoji: '⛰️', region: 'کوهستان',
    desc: 'سنگ‌های تیز و بادِ بلند. از این‌جا معدن ابسیدین مثل زخمی سیاه پیدا است.',
    neighbors: ['kuh_ab', 'kuh_obsidian', 'maabad_bad'], services: [],
    explore: { text: 'دنبال گیاهِ سنگ‌روی می‌گردی.', loot: ['herbal', 'ore'], chance: 0.5 },
    encounters: 'forest', encounterChance: 0.35,
  },
  kuh_obsidian: {
    name: 'معدن ابسیدین', emoji: '🕳️', region: 'کوهستان',
    desc: 'دهانهٔ معدنی که صد سال بسته بود و حالا بوی اُسفالت از آن می‌آید. سنگ سیاه، از این‌جا بیرون آمده.',
    neighbors: ['damane_kuh', 'atlal'], services: [],
    explore: { text: 'در تاریکی معدن پیش می‌روی؛ فانوس لازم است.', loot: ['ore', 'salt'], chance: 0.6 },
    encounters: 'cave', encounterChance: 0.6,
  },
  atlal: {
    name: 'آتشگاه خاموش', emoji: '🔥', region: 'معدن',
    desc: 'آتشگاهی که خاکسترش هنوز گرم است و کسی آتشش را روشن نمی‌کند.',
    neighbors: ['jangal', 'kuh_obsidian', 'maabad_bad'], services: [],
    explore: { text: 'خاکستر را پس می‌زنی؛ چیزی زنگ‌زده زیرش است.', loot: ['ore', 'lantern'], chance: 0.55 },
    encounters: 'night', encounterChance: 0.4,
  },
  chah_tarik: {
    name: 'چاه تاریک', emoji: '🕯️', region: 'دهکده',
    desc: 'چاهی که بوی خواب می‌دهد. سنگی که پیدا کردی از همین چاه آمده بود.',
    neighbors: ['sangab'], services: [],
    explore: { text: 'با فانوس در چاه پایین می‌روی.', loot: ['shard2'], chance: 0.35, needItem: 'lantern' },
    encounters: 'cave', encounterChance: 0.5,
  },
  qabrestan: {
    name: 'گورستان خاموش', emoji: '🪦', region: 'دهکده',
    desc: 'گورستانی که سگ‌ها هم از آن رد نمی‌شوند. گورِ مادرت این‌جاست.',
    neighbors: ['sangab', 'atlal'], services: [],
    explore: { text: 'بین سنگ‌ها می‌گردی؛ نام‌هایی نیم‌پاک.', loot: ['ghost_veil'], chance: 0.4 },
    encounters: 'graveyard', encounterChance: 0.6,
  },
  shahr_kohan: {
    name: 'شهر کهن', emoji: '🏙️', region: 'شهر',
    desc: 'شهری با بازارِ سرپوشیده، معبدی سنگی و دیواری که سربازهای ابسیدین از آن نگهبانی می‌دهند.',
    neighbors: ['koli', 'bazar_siyah', 'zindan', 'maabad_bad'], services: ['inn', 'shop', 'smith', 'heal', 'guild', 'train'],
    explore: { text: 'در بازار قدم می‌زنی؛ دستفروش‌ها داد می‌زنند.', loot: ['date', 'gift_tea'], chance: 0.5 },
  },
  zindan: {
    name: 'زندان زیرزمینی', emoji: '⛓️', region: 'شهر',
    desc: 'زیر شهر، ردیفی از سلول‌های سنگی. یکی از آن‌ها همیشه باز است و هیچ‌کس نمی‌داند چرا.',
    neighbors: ['shahr_kohan'], services: [], locked: ['item:key_iron'],
    explore: { text: 'با کلید آهنی در سلول‌ها را باز می‌کنی.', loot: ['letter'], chance: 0.7 },
    encounters: 'city_under', encounterChance: 0.5,
  },
  bazar_siyah: {
    name: 'بازار سیاه', emoji: '🏴', region: 'شهر',
    desc: 'بازاری زیرزمینی که در آن هر چیزی هست، جز نامِ فروشنده.',
    neighbors: ['shahr_kohan', 'khenjar'], services: ['black'],
    explore: { text: 'زیر نگاه‌های دزدکی راه می‌روی.', loot: ['salt', 'rope'], chance: 0.5 },
  },
  khenjar: {
    name: 'روستای خنجر', emoji: '🗡️', region: 'شهر',
    desc: 'روستایی که همهٔ بچه‌هایش پیش از ده‌سالگی خنجر می‌زنند و همه مردانش بی‌صدا راه می‌روند.',
    neighbors: ['bazar_siyah', 'borj_sorkh'], services: [],
    explore: { text: 'در کوچه‌های تنگ، سایه‌ای پشت سایه‌ای می‌رود.', loot: ['knife'], chance: 0.4 },
    encounters: 'city_under', encounterChance: 0.55,
  },
  maabad_bad: {
    name: 'معبد باد', emoji: '🕯️', region: 'شهر', safe: true,
    desc: 'معبدی بی‌سقف که باد از میان ستون‌هایش می‌گذرد و ناله‌ای شبیه نی می‌کند.',
    neighbors: ['shahr_kohan', 'damane_kuh', 'atlal'], services: ['temple', 'heal'],
    explore: { text: 'پیشکش کوچکی می‌گذاری.', loot: ['herbal'], chance: 0.5 },
  },
  kale_khaki: {
    name: 'قلعهٔ خاکی', emoji: '🏰', region: 'مرز',
    desc: 'قلعه‌ای گِلی بر بلندی. چهل سرباز گرسنه پشت دروازه‌اش نگهبانی می‌دهند.',
    neighbors: ['koli', 'pooldar', 'karvansara'], services: ['inn'], faction: 'soldiers',
    explore: { text: 'دور قلعه می‌گردی؛ بوی نان سوخته و عرق سرباز.', loot: ['bread'], chance: 0.5 },
    encounters: 'fort', encounterChance: 0.35,
  },
  karvansara: {
    name: 'کاروانسرا', emoji: '🐪', region: 'مرز', safe: true,
    desc: 'چهار دیوار و یک چاهِ شور. شترها این‌جا زانو می‌زنند و آدم‌ها هم.',
    neighbors: ['pooldar', 'kale_khaki', 'sahra_namak'], services: ['inn', 'shop', 'train'],
    explore: { text: 'بین بارها دنبال چیزی می‌گردی.', loot: ['date', 'waterskin'], chance: 0.55 },
  },
  sahra_namak: {
    name: 'صحرای نمک', emoji: '🏜️', region: 'صحرا',
    desc: 'دریایی که خشک شده و نمکش سفیدِ کورکننده است. سایه‌ای نیست تا نیم‌روز.',
    neighbors: ['karvansara', 'manzar_sabz', 'darya_khoshk'], services: [],
    explore: { text: 'در نمک راه می‌روی؛ هر قدم صدا می‌دهد.', loot: ['salt'], chance: 0.6 },
    encounters: 'desert', encounterChance: 0.55,
  },
  manzar_sabz: {
    name: 'سبزه‌زار', emoji: '🌾', region: 'صحرا', safe: true,
    desc: 'چند هکتار سبزی وسط نمک. کوچ‌نشینان این‌جا جشن می‌گیرند و قسم می‌خورند که این زمین زنده است.',
    neighbors: ['sahra_namak', 'darya_khoshk'], services: ['inn', 'heal'], faction: 'nomads',
    explore: { text: 'در سبزه‌زار دنبال توت وحشی می‌گردی.', loot: ['date', 'gift_flower'], chance: 0.6 },
  },
  darya_khoshk: {
    name: 'دریای خشک', emoji: '⛵', region: 'صحرا',
    desc: 'کشتی‌هایی که روی شن خوابیده‌اند و بادبان‌های پارچه‌پارچه‌. شب‌ها لنگرها صدا می‌دهند.',
    neighbors: ['sahra_namak', 'manzar_sabz', 'dezh_bala'], services: [],
    explore: { text: 'از نردبانِ کشتی بالا می‌روی.', loot: ['rope', 'salt'], chance: 0.55 },
    encounters: 'night', encounterChance: 0.6,
  },
  dezh_bala: {
    name: 'دژ بالا', emoji: '🗼', region: 'آسمان',
    desc: 'دژی که روی ساقه‌ای سنگی نشسته و فقط از یک راه‌پلهٔ مارپیچ می‌شود به آن رسید.',
    neighbors: ['darya_khoshk', 'borj_sorkh'], services: [], locked: ['item:ghost_veil'],
    explore: { text: 'از پله‌ها بالا می‌روی؛ باد موهایت را پس می‌زند.', loot: ['letter'], chance: 0.6 },
    encounters: 'night', encounterChance: 0.5,
  },
  borj_sorkh: {
    name: 'برج سرخ', emoji: '🗼', region: 'آسمان',
    desc: 'برجی از آجرِ سرخ که نوکش در ابر است. قلبِ ابسیدین آن‌جاست.',
    neighbors: ['khenjar', 'dezh_bala'], services: [], locked: ['flag:tower_open'],
    explore: { text: 'دور برج می‌چرخی؛ خشتی که مثل زخم می‌سوزد.', loot: ['ore'], chance: 0.4 },
    encounters: 'night', encounterChance: 0.6,
  },
};

export const LOC_IDS = Object.keys(LOCATIONS);
export function loc(id) {
  return LOCATIONS[id] || { name: id, emoji: '🗺️', desc: '', neighbors: [], services: [] };
}

/** گراف سفر: از کجا به کجا و چقدر خرج سفر (ساعت) */
export function travelCost(a, b) {
  const far = ['sahra_namak', 'manzar_sabz', 'darya_khoshk', 'dezh_bala', 'borj_sorkh', 'kuh_obsidian'];
  if (far.includes(a) || far.includes(b)) return 2;
  return 1;
}
/** آیا مسیر مستقیمی هست؟ */
export function canTravel(a, b) {
  const L = loc(a);
  return (L.neighbors || []).includes(b);
}
/** مقصدهای سفر از یک مکان (اگر کلید آن مکان را نداشته باشی، قفل است) */
export function travelOptions(st) {
  const L = loc(st.location);
  return (L.neighbors || []).map((id) => {
    const t = loc(id);
    let locked = false;
    if (t.locked) locked = !t.locked.every((c) => requireCondName(st, c));
    return { id, name: t.name, emoji: t.emoji, region: t.region, locked, cost: travelCost(st.location, id) };
  });
}
function requireCondName(st, cond) {
  const [kind, arg] = String(cond).split(':');
  if (kind === 'flag') return !!st.flags[arg];
  if (kind === 'item') return (st.inv[arg] || 0) > 0;
  if (kind === 'questdone') return !!st.done[arg];
  return true;
}

export const REGIONS = {
  'کوهستان': '⛰️',
  'جنگل': '🌲',
  'دهکده': '🏘️',
  'شهر': '🏙️',
  'مرز': '🏰',
  'صحرا': '🏜️',
  'راه‌ها': '🛤️',
  'معدن': '🕳️',
  'آسمان': '☁️',
};
