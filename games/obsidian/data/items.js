// =============================================================
//  items.js — کالاها، سلاح‌ها، زره‌ها، داروها و اشیای داستانی
//  kind: weapon | armor | use | quest | mat
// =============================================================
export const ITEMS = {
  // --- دارو و خوراک ---
  potion:    { name: 'شربت جان', emoji: '🧪', kind: 'use', price: 18, heal: 14, desc: 'مایع تلخ گیاهی؛ زخم‌ها را می‌بندد.' },
  potion_big:{ name: 'شربت بزرگ جان', emoji: '⚗️', kind: 'use', price: 42, heal: 30, desc: 'کارِ حکیمان؛ جان را یک‌سر می‌کَند.' },
  bread:     { name: 'نان جو', emoji: '🍞', kind: 'use', price: 4, heal: 4, energy: 3, desc: 'نان خشک راه؛ گرسنگی را می‌خواباند.' },
  date:      { name: 'خرما', emoji: '🌴', kind: 'use', price: 6, heal: 3, energy: 5, desc: 'شیرینی صحرا؛ توان را برمی‌گرداند.' },
  herbal:    { name: 'بستهٔ سبزینه', emoji: '🌿', kind: 'use', price: 12, heal: 8, cure: true, desc: 'زهر را می‌شوید.' },
  // --- سلاح ---
  knife:     { name: 'کارد کهنه', emoji: '🔪', kind: 'weapon', price: 10, dmg: 2, desc: 'کاردِ پدر؛ لبه‌اش پریده ولی کار می‌کند.' },
  blade:     { name: 'تیغهٔ فولادی', emoji: '🗡️', kind: 'weapon', price: 55, dmg: 4, desc: 'ساختهٔ دستِ رستمِ پتک.' },
  obs_blade: { name: 'تیغهٔ ابسیدین', emoji: '⚔️', kind: 'weapon', price: 0, dmg: 7, desc: 'از سنگ سیاه؛ دستِ دشمن را می‌بُرد و خواننده را می‌آزارد.' },
  staff:     { name: 'عصای باد', emoji: '🪄', kind: 'weapon', price: 70, dmg: 3, spirit: 1, desc: 'عصایی سبک؛ خرد را تیز و دل را گرم می‌کند.' },
  bow:       { name: 'کمان بلند', emoji: '🏹', kind: 'weapon', price: 60, dmg: 4, ranged: true, desc: 'کمان مِهرآ؛ از دور می‌زند.' },
  // --- زره و سپر ---
  leather:   { name: 'نیم‌تنهٔ چرمی', emoji: '🧥', kind: 'armor', price: 40, def: 2, desc: 'چرمِ ضخیم؛ جان را چند ضربه بیشتر نگه می‌دارد.' },
  ringmail:  { name: 'زرهٔ حلقه‌ای', emoji: '🛡️', kind: 'armor', price: 95, def: 4, desc: 'سنگین ولی استوار.' },
  cloak:     { name: 'شنل خاکستری', emoji: '🧣', kind: 'armor', price: 30, def: 1, agility: 1, desc: 'در تاریکی گم می‌شوی.' },
  // --- اشیای داستانی ---
  shard:     { name: 'خردهٔ ابسیدین', emoji: '🪨', kind: 'quest', price: 0, desc: 'سنگ سیاهی که در دلش نور می‌جنبد. اگر گوش بدهی، نامت را می‌خواند.' },
  shard2:    { name: 'خردهٔ دوم', emoji: '🪩', kind: 'quest', price: 0, desc: 'دوقلوی سنگ. هر دو که نزدیک شوند، هوا سرد می‌شود.' },
  key_iron:  { name: 'کلید آهنی', emoji: '🗝️', kind: 'quest', price: 0, desc: 'کلید زندان زیرزمینی شهر کهن.' },
  letter:    { name: 'نامهٔ سوخته', emoji: '📜', kind: 'quest', price: 0, desc: 'نیم‌سوخته؛ از «ورخان» و «وعدهٔ دژ» می‌گوید.' },
  ring_ash:  { name: 'انگشتر خاکستر', emoji: '💍', kind: 'quest', price: 0, desc: 'یادگار مادر؛ خاکسترش هنوز گرم است.' },
  waterskin: { name: 'مشک آب', emoji: '💧', kind: 'use', price: 8, energy: 2, desc: 'در صحرا جان می‌دهد.' },
  lantern:   { name: 'فانوس', emoji: '🏮', kind: 'mat', price: 14, desc: 'در چاه و غار، تنها دوستت.' },
  rope:      { name: 'طناب', emoji: '🪢', kind: 'mat', price: 10, desc: 'همیشه به کار می‌آید.' },
  salt:      { name: 'نمکِ سیاه', emoji: '🧂', kind: 'mat', price: 22, desc: 'در بازار سیاه گران است؛ در آیین‌ها لازم.' },
  ore:       { name: 'سنگِ معدن', emoji: '⛏️', kind: 'mat', price: 15, desc: 'سنگدلی که در دلش فلز خوابیده.' },
  ghost_veil:{ name: 'تورِ روح', emoji: '🕸️', kind: 'quest', price: 0, desc: 'توری که مردگان از آن رد می‌شوند.' },
  // --- هدیه و رابطه ---
  gift_flower: { name: 'دستهٔ گل کوهی', emoji: '💐', kind: 'use', price: 9, gift: 2, desc: 'هدیه‌ای که دل را نرم می‌کند.' },
  gift_tea:    { name: 'چایِ دودار', emoji: '🍵', kind: 'use', price: 11, gift: 2, desc: 'چایِ مسافر؛ دوست می‌سازد.' },
  gift_blade:  { name: 'خنجرِ نقره‌کوب', emoji: '🔻', kind: 'use', price: 60, gift: 4, desc: 'هدیه‌ای گران برای همراه وفادار.' },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const CONSUMABLE_KINDS = ['use'];

export function item(id) {
  return ITEMS[id] || { name: id, emoji: '❔', kind: 'mat', desc: '' };
}

/** زرادخانهٔ سرخ (شهر کهن) */
export const SMITH_STOCK = ['blade', 'leather', 'ringmail', 'cloak', 'bow', 'staff', 'potion', 'potion_big'];
/** داروخانه و خواربار */
export const SHOP_STOCK = ['potion', 'bread', 'date', 'herbal', 'waterskin', 'lantern', 'rope', 'gift_flower', 'gift_tea'];
/** بازار سیاه */
export const BLACK_STOCK = ['potion_big', 'obs_blade', 'salt', 'cloak', 'gift_blade'];
