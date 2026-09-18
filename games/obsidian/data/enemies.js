// =============================================================
//  enemies.js — دشمنان، جانوران و سرداران ابسیدین
//  kind: beast | human | undead | shade | boss
// =============================================================
export const ENEMIES = {
  rat:       { name: 'موشِ انبار', emoji: '🐀', hp: 8,  atk: 3,  def: 0, xp: 8,  gold: 2,  kind: 'beast', desc: 'کوچک ولی دندان‌تیز.' },
  wolf:      { name: 'گرگ خاکستری', emoji: '🐺', hp: 16, atk: 6,  def: 1, xp: 18, gold: 4,  kind: 'beast', desc: 'چشمانش در تاریکی می‌درخشد.' },
  wolf_alpha:{ name: 'گرگِ سرکرده', emoji: '🐺', hp: 28, atk: 8,  def: 2, xp: 34, gold: 9,  kind: 'beast', desc: 'زخمِ کهنه روی پهلویش دارد و از هیچ‌کس نمی‌ترسد.' },
  boar:      { name: 'گراز وحشی', emoji: '🐗', hp: 22, atk: 7,  def: 2, xp: 24, gold: 5,  kind: 'beast', desc: 'با سرِ سنگینش درخت را می‌اندازد.' },
  bandit:    { name: 'راهزن', emoji: '🪓', hp: 18, atk: 6,  def: 1, xp: 22, gold: 14, kind: 'human', desc: 'چاقو در آستین دارد و چهره‌اش را شال پوشانده.' },
  bandit_cap:{ name: 'سرکردهٔ راهزنان', emoji: '🦹', hp: 34, atk: 9,  def: 2, xp: 48, gold: 40, kind: 'human', desc: '«شغالِ سرخ»؛ نامش در سه ولایت ترس دارد.' },
  soldier:   { name: 'سرباز فراری', emoji: '🪖', hp: 24, atk: 7,  def: 3, xp: 26, gold: 10, kind: 'human', desc: 'زره‌اش زنگ‌زده و چشم‌اش خسته است.' },
  cultist:   { name: 'مُريدِ سیاه', emoji: '🧎', hp: 20, atk: 6,  def: 1, xp: 30, gold: 12, kind: 'human', desc: 'زیر لب اسم ورخان را می‌خواند.' },
  assassin:  { name: 'خنجرزن', emoji: '🥷', hp: 26, atk: 10, def: 2, xp: 44, gold: 26, kind: 'human', desc: 'از روستای خنجر؛ بی‌صدا می‌آید.' },
  ghoul:     { name: 'غولِ گور', emoji: '🧟', hp: 28, atk: 8,  def: 2, xp: 38, gold: 8,  kind: 'undead', desc: 'از خاکستر گورها برخاسته.' },
  ghost:     { name: 'روحِ سرگردان', emoji: '👻', hp: 18, atk: 7,  def: 0, xp: 30, gold: 0,  kind: 'undead', desc: 'از سرما می‌زند، نه از آهن.' },
  shade:     { name: 'سایهٔ ابسیدین', emoji: '🌑', hp: 30, atk: 9,  def: 3, xp: 46, gold: 6,  kind: 'shade', desc: 'نور را می‌خورد و تاریک‌تر می‌شود.' },
  shade_lord:{ name: 'سایه‌سالار', emoji: '👤', hp: 46, atk: 11, def: 4, xp: 80, gold: 30, kind: 'shade', desc: 'بدلِ ورخان؛ هرچه بزنی، دو تا می‌شود.' },
  scorpion:  { name: 'کژدمِ شنی', emoji: '🦂', hp: 14, atk: 8,  def: 1, xp: 26, gold: 3,  kind: 'beast', desc: 'زهرش تا فردا در رگ می‌سوزد.' },
  snake:     { name: 'مارِ ریگ', emoji: '🐍', hp: 12, atk: 7,  def: 0, xp: 20, gold: 2,  kind: 'beast', desc: 'خودش را ریگ می‌کند.' },
  kavosh:    { name: 'کاوشگرِ دیوانه', emoji: '⛏️', hp: 32, atk: 9,  def: 3, xp: 42, gold: 18, kind: 'human', desc: 'در معدن مانده و دیگر برنگشت.' },
  // --- سرداران (boss) ---
  shoghal:   { name: 'شغالِ سرخ', emoji: '🦹', hp: 56, atk: 11, def: 3, xp: 120, gold: 90, kind: 'boss', boss: true, desc: 'سرکردهٔ راهزنان؛ تیغش دندانه‌دار است.' },
  yalda:     { name: 'یلدا، جادوگر جنگل', emoji: '🧙‍♀️', hp: 48, atk: 12, def: 2, xp: 130, gold: 40, kind: 'boss', boss: true, desc: 'با ریشه‌ها سخن می‌گوید و با باد می‌رقصد.' },
  saghe:     { name: 'سایه‌بان، جادوگر مردگان', emoji: '💀', hp: 64, atk: 13, def: 4, xp: 170, gold: 70, kind: 'boss', boss: true, desc: 'از گورستان خاموش دست بر نمی‌دارد.' },
  varkhan:   { name: 'ورخان، سالار ابسیدین', emoji: '🐉', hp: 120, atk: 15, def: 6, xp: 400, gold: 0, kind: 'boss', boss: true, desc: 'مردی که سنگ سیاه را در سینه‌اش کاشته.' },
  varkhan2:  { name: 'ورخانِ برخاسته', emoji: '🌋', hp: 170, atk: 17, def: 7, xp: 600, gold: 0, kind: 'boss', boss: true, desc: 'دیگر مرد نیست؛ کوهی است که راه می‌رود.' },
};

export const ENEMY_IDS = Object.keys(ENEMIES);
export function enemy(id) {
  return ENEMIES[id] || { name: id, emoji: '❓', hp: 10, atk: 3, def: 0, xp: 5, gold: 1 };
}

/** گروه‌های دشمن برای سفرها و مکان‌ها */
export const ENCOUNTERS = {
  road: [['bandit'], ['wolf'], ['bandit', 'bandit']],
  forest: [['wolf'], ['wolf', 'wolf'], ['boar'], ['wolf_alpha']],
  desert: [['scorpion'], ['snake'], ['scorpion', 'scorpion'], ['bandit']],
  night: [['ghoul'], ['ghost'], ['shade'], ['cultist', 'cultist']],
  cave: [['shade'], ['kavosh'], ['shade', 'shade'], ['cultist']],
  city_under: [['rat', 'rat'], ['bandit'], ['assassin']],
  graveyard: [['ghoul', 'ghoul'], ['ghost'], ['cultist', 'ghoul']],
  fort: [['soldier', 'soldier'], ['soldier'], ['assassin']],
};
