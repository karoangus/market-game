// =============================================================
//  test/obsidian.test.mjs — تست‌های بازی «ابسیدین»
//  اجرا: node test/obsidian.test.mjs
//
//  سه چیز سنجیده می‌شود:
//    ۱) گراف داستان: هیچ مقصد/آیتم/دشمن/شخصیتِ گم‌شده‌ای نباشد
//    ۲) موتور: سفر، فروشگاه، خدمات، نبرد، کوله، ذخیره، پایان‌ها
//    ۳) بازی واقعاً «بازی‌شدنی» است: چند دور خودکار بدون خطا
// =============================================================

// localStorage ساده برای اجرای موتور در نود
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
}

import { Engine, STAT_FA } from '../games/obsidian/js/engine.js';
import { newState, saveGame, loadGame, clearSave, levelOf, XP_TABLE, gainXp, applyEffects } from '../games/obsidian/js/state.js';
import { SCENES, ENDINGS } from '../games/obsidian/data/story.js';
import { CHARS, charsAt } from '../games/obsidian/data/characters.js';
import { ENEMIES, ENCOUNTERS } from '../games/obsidian/data/enemies.js';
import { ITEMS, SMITH_STOCK, SHOP_STOCK, BLACK_STOCK } from '../games/obsidian/data/items.js';
import { LOCATIONS, loc, travelOptions, travelCost } from '../games/obsidian/data/world.js';
import { Combat } from '../games/obsidian/js/combat.js';

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.log('❌ ' + msg);
  }
}
const section = (t) => console.log('\n— ' + t + ' —');

// ---------------------------------------------------------------
section('گراف داستان');
// ---------------------------------------------------------------
const sceneIds = new Set(Object.keys(SCENES));
const endingIds = new Set(Object.keys(ENDINGS));
const itemIds = new Set(Object.keys(ITEMS));
const foeIds = new Set(Object.keys(ENEMIES));
const locIds = new Set(Object.keys(LOCATIONS));

let badTargets = 0;
let badEffects = 0;
let badFoes = 0;
let badArt = 0;
for (const [id, s] of Object.entries(SCENES)) {
  if (!s.t) badArt++;
  if (s.at && !locIds.has(s.at)) badArt++;
  for (const c of s.choices || []) {
    if (c.to && c.to !== '@' && c.to !== '#' && !sceneIds.has(c.to) && !endingIds.has(c.to)) badTargets++;
    for (const d of c.do || []) {
      const m = /^item:([a-z_0-9]+)/.exec(d);
      if (m && !itemIds.has(m[1])) badEffects++;
      const g = /^goto:([a-z_0-9]+)$/.exec(d);
      if (g && !sceneIds.has(g[1]) && !endingIds.has(g[1])) badEffects++;
      const e = /^end:([a-z_0-9]+)$/.exec(d);
      if (e && !endingIds.has(e[1])) badEffects++;
      const cm = /^combat:([a-z_0-9+,]+)$/.exec(d);
      if (cm) for (const f of cm[1].split(/[,+]/)) if (!foeIds.has(f)) badFoes++;
    }
  }
  if (s.combat) {
    if (!s.combat.foes || !s.combat.foes.length) badFoes++;
    for (const f of s.combat.foes || []) if (!foeIds.has(f)) badFoes++;
    for (const t of [s.combat.onWin, s.combat.onLose]) {
      if (t && !sceneIds.has(t) && !endingIds.has(t)) badTargets++;
    }
  }
}
check(badTargets === 0, `همهٔ مقصدهای داستان وجود دارند (${badTargets} مقصد گم‌شده)`);
check(badEffects === 0, `همهٔ آیتم‌های اثرها وجود دارند (${badEffects} اثر خراب)`);
check(badFoes === 0, `همهٔ دشمن‌های نبرد وجود دارند (${badFoes} دشمن گم‌شده)`);
check(badArt === 0, `همهٔ صحنه‌ها عنوان و مکان درست دارند (${badArt} صحنه ناقص)`);
check(Object.keys(SCENES).length > 100, `داستان به‌قدر کافی بلند است (${Object.keys(SCENES).length} صحنه)`);
check(Object.keys(ENDINGS).length >= 6, `چند پایان داریم (${Object.keys(ENDINGS).length})`);

// هر شخصیت صحنهٔ گفت‌وگو و مکان درست دارد
let badTalk = 0;
for (const [cid, c] of Object.entries(CHARS)) {
  if (c.talk && !sceneIds.has(c.talk)) badTalk++;
  if (c.where && !c.where.split('+').every((w) => locIds.has(w))) badTalk++;
}
check(badTalk === 0, `هر شخصیت صحنهٔ گفت‌وگو و مکان دارد (${badTalk} ایراد)`);

// هر مکان: همسایه‌ها، دشمن‌های کمین، قفل‌ها
let badLoc = 0;
for (const [lid, L] of Object.entries(LOCATIONS)) {
  for (const n of L.neighbors || []) if (!locIds.has(n)) badLoc++;
  if (L.encounters && !ENCOUNTERS[L.encounters]) badLoc++;
  for (const l of L.locked || []) {
    const [k, v] = String(l).split(':');
    if (k === 'item' && !itemIds.has(v)) badLoc++;
    if (k === 'quest' ) badLoc++; // قالبِ پشتیبانی‌نشده
  }
}
check(badLoc === 0, `نقشه سالم است (${badLoc} ایراد در مکان‌ها)`);
check(
  Object.keys(LOCATIONS).length >= 20,
  `نقشه به‌قدر کافی بزرگ است (${Object.keys(LOCATIONS).length} مکان)`
);

// فروشگاه‌ها
let badStock = 0;
for (const arr of [SMITH_STOCK, SHOP_STOCK, BLACK_STOCK]) for (const id of arr) if (!itemIds.has(id)) badStock++;
check(badStock === 0, `فهرست فروشگاه‌ها سالم است (${badStock} آیتم گم‌شده)`);

// صحنه‌های داستانی که هیچ‌جا نمی‌شود به آن‌ها رسید (به‌جز قلاب‌ها و کارها)
const reachable = new Set(['intro_1']);
for (const [id, s] of Object.entries(SCENES)) {
  for (const c of s.choices || []) {
    if (c.to && c.to !== '@' && c.to !== '#' && sceneIds.has(c.to)) reachable.add(c.to);
    for (const d of c.do || []) {
      if (d.startsWith('goto:')) reachable.add(d.slice(5));
      if (d.startsWith('end:')) reachable.add(d.slice(4));
    }
  }
  if (s.combat) {
    if (s.combat.onWin) reachable.add(s.combat.onWin);
    if (s.combat.onLose) reachable.add(s.combat.onLose);
  }
}
const orphan = Object.keys(SCENES).filter(
  (id) => !reachable.has(id) && !SCENES[id].hook && !SCENES[id].job && !/^(talk_|q_)/.test(id)
);
check(orphan.length === 0, `صحنهٔ بی‌راه نداریم (${orphan.length}: ${orphan.slice(0, 4).join(', ')})`);

// ---------------------------------------------------------------
section('موتور بازی');
// ---------------------------------------------------------------
function fresh(extra = {}) {
  return Engine.start({ state: newState({ name: 'تست', ...extra }) });
}

check(!!STAT_FA.might && !!STAT_FA.agility, 'نام فارسی ویژگی‌ها هست');

{
  const eng = fresh();
  const v = eng.view();
  check(v.type === 'scene' && v.choices.length >= 2, 'بازی از صحنهٔ آغاز شروع می‌شود');
  check(v.title && v.text.length > 0, 'صحنه عنوان و متن دارد');
}

{
  // سفر: از دهکده فقط به همسایه‌ها
  const eng = fresh();
  eng.enter('@loc');
  const st = eng.state;
  check(eng.view().type === 'hub', 'مرکز مکان نمای hub است');
  const before = st.location;
  eng.travelTo('borj_sorkh');
  check(st.location === before, 'سفرِ غیرمجاز انجام نمی‌شود');
  const opts = travelOptions(st);
  check(opts.length === (loc(st.location).neighbors || []).length, 'گزینه‌های سفر به‌اندازهٔ راه‌های نقشه‌اند');
  eng.travelTo(opts[0].id);
  check(st.location === opts[0].id, 'سفر مجاز انجام می‌شود');
  check(st.visited[opts[0].id] === 1, 'مکان دیده‌شده ثبت می‌شود');
}

{
  // خدمات: مسافرخانه
  const eng = fresh();
  eng.state.location = 'sangab';
  eng.enter('@loc');
  eng.state.gold = 100;
  eng.state.hp = 4;
  eng.state.energy = 1;
  const i = eng.view().choices.findIndex((c) => c.k === 'service' && c.v === 'inn');
  check(i >= 0, 'مسافرخانه در دهکده هست');
  eng.choose(i);
  check(eng.state.hp === eng.state.hpMax, 'مسافرخانه جان را پر می‌کند');
  check(eng.state.gold === 94, 'هزینهٔ مسافرخانه کم می‌شود');
  check(eng.state.energy === eng.state.energyMax, 'مسافرخانه توان را پر می‌کند');
}

{
  // فروشگاه: خرید نان
  const eng = fresh();
  eng.state.location = 'sangab';
  eng.enter('@loc');
  eng.state.gold = 50;
  const i = eng.view().choices.findIndex((c) => c.k === 'service' && c.v === 'shop');
  eng.choose(i);
  const v = eng.view();
  check(v.type === 'shop', 'فروشگاه باز می‌شود');
  const b = v.choices.findIndex((c) => c.k === 'buy' && c.v === 'bread');
  const g0 = eng.state.gold;
  eng.choose(b);
  check(eng.state.gold < g0, 'خرید پول کم می‌کند');
  check((eng.state.inv.bread || 0) > 0, 'نان به کوله اضافه می‌شود');
  const close = eng.view().choices.findIndex((c) => c.k === 'goto');
  eng.choose(close);
  check(eng.view().type === 'hub', 'از فروشگاه برمی‌گردیم به مکان');
}

{
  // آموزش ویژگی
  const eng = fresh();
  eng.state.location = 'sangab';
  eng.enter('@loc');
  eng.state.gold = 200;
  const i = eng.view().choices.findIndex((c) => c.k === 'service' && c.v === 'train');
  eng.choose(i);
  const v = eng.view();
  check((v.type === 'train' || v.id === 'train'), 'آموزشگاه باز می‌شود');
  const t = v.choices.findIndex((c) => c.k === 'train' && c.v === 'might');
  if (t >= 0) {
    const m0 = eng.state.stats.might;
    eng.choose(t);
    check(eng.state.stats.might === m0 + 1, 'زور یکی زیاد می‌شود');
  } else {
    check(false, 'آموزش زور در آموزشگاه هست');
  }
}

{
  // نبرد: با تابع خودکار تا پایان
  const eng = fresh();
  eng.enter('ch1_fight');
  const v = eng.view();
  check(v.type === 'combat', 'صحنهٔ نبرد، نمای نبرد می‌دهد');
  check(v.actions.length >= 3, 'اقدام‌های نبرد ساخته می‌شوند');
  check(v.foes.length === 3, 'سه دشمن در نبرد فصل یک هست');
  const c = new Combat(eng.state, ['bandit']);
  c.autoResolve();
  check(c.over === true, 'نبرد خودکار تمام می‌شود');
  check(eng.state.hp >= 0 && Number.isFinite(eng.state.hp), 'جان بازیکن سالم می‌ماند');
}

{
  // باخت: صحنه دوباره در دسترس است و بازی بن‌بست نمی‌شود
  const eng = fresh();
  eng.state.location = 'sangab';
  eng.state.hp = 1;
  eng.enter('ch1_fight');
  let guard = 0;
  while (eng.view().type === 'combat' && guard++ < 60) eng.choose(eng.view().actions.findIndex((a) => a.id === 'attack'));
  check(guard < 60, 'نبرد در زمان معقول تمام می‌شود');
  eng.enter('@loc');
  const hub = eng.view();
  const back = hub.choices.some((c) => c.v === 'ch1_fight') || eng.state.hp > 1;
  check(back, 'پس از باخت راه ادامه هست (تلاش دوباره یا جان بازگشته)');
}

{
  // پیشرفت داستان: هر فصل صحنه‌های خودش را دارد
  const chapters = new Set(Object.values(SCENES).map((s) => s.chapter).filter(Boolean));
  check(chapters.size >= 5, `چند فصل داریم (${[...chapters].sort().join(',')})`);
}

{
  // انتخاب‌هایی که به پایان می‌رسند: موتور باید ENDINGS را بشناسد
  const eng = fresh();
  let found = false;
  for (const [id, s] of Object.entries(SCENES)) {
    for (const c of s.choices || []) {
      if (c.to && ENDINGS[c.to]) {
        eng.enter(id);
        const vi = eng.view().choices.findIndex((x) => x.choice && x.choice.to === c.to);
        if (vi >= 0 && !eng.view().choices[vi].locked) {
          eng.choose(vi);
          found = eng.view().type === 'end';
          break;
        }
      }
    }
    if (found) break;
  }
  check(found, 'گزینۀ داستانی که به پایان می‌رسد درست کار می‌کند');
}

{
  // پایان‌ها
  let ok = true;
  for (const id of Object.keys(ENDINGS)) {
    const eng = fresh();
    const v = eng.ending(id);
    if (v.type !== 'end' || !v.title || !v.text || !v.text.length) ok = false;
    if (!eng.state.endings.includes(id)) ok = false;
  }
  check(ok, `همهٔ ${Object.keys(ENDINGS).length} پایان متن و عنوان دارند و ثبت می‌شوند`);
}

{
  // کوله: خوردن و آشامیدن
  const eng = fresh();
  eng.state.hp = 3;
  eng.state.inv = { ...eng.state.inv, potion: 2 };
  const iv = eng.invView();
  const i = iv.choices.findIndex((c) => c.k === 'use' && c.v === 'potion');
  check(i >= 0, 'شربت جان در کوله دیده می‌شود');
  const n0 = eng.state.inv.potion;
  eng.chooseInView(iv, i);
  check(eng.state.hp > 3, 'شربت جان، جان را زیاد می‌کند');
  check(eng.state.inv.potion === n0 - 1, 'شربت از کوله کم می‌شود');
}

{
  // ذخیره و بازخوانی
  const eng = fresh();
  eng.state.gold = 77;
  eng.state.hp = 9;
  eng.state.location = 'jangal';
  eng.state.scene = '@loc';
  eng.save();
  const back = loadGame();
  check(back && back.gold === 77 && back.hp === 9 && back.location === 'jangal', 'ذخیره و بازخوانی درست است');
  const eng2 = Engine.loadOrNull({});
  check(!!eng2 && eng2.view().type === 'hub', 'بازی از روی ذخیره ادامه پیدا می‌کند');
  clearSave();
  check(loadGame() === null, 'پاک‌کردن ذخیره کار می‌کند');
}

{
  // سطح و تجربه
  check(levelOf(0) === 1, 'سطح آغاز یک است');
  check(levelOf(XP_TABLE[3]) === 4, 'آستانهٔ سطح درست است');
  const st = newState();
  const hp0 = st.hpMax;
  st.xp = XP_TABLE[2];
  st.hp = 2;
  gainXp(st, 1);
  check(st.level >= 3 && st.hpMax > hp0 && st.hp === st.hpMax, 'بالا رفتن سطح جان را بیشتر و پر می‌کند');
}

// ---------------------------------------------------------------
section('تعادل: سطح و نبردهای سخت');
// ---------------------------------------------------------------
{
  // ⚠️ باگی که پایان‌ها را نایافتنی می‌کرد: تجربهٔ داستان (`xp += …`) سطح را
  //    بالا نمی‌برد؛ سطح همیشه ۱ می‌ماند، جان/توان رشد نمی‌کرد و نبردِ آخر
  //    (شایدِ ورخان) عملاً نبردنی بود. این تست همان را می‌گیرد.
  const st = newState({});
  applyEffects(st, ['xp += 400']);
  check(st.level > 1, `تجربهٔ داستان سطح را بالا می‌برد (سطح ${st.level})`);
  check(st.hpMax > 30, `هر سطح جانِ بیشینه را بیشتر می‌کند (${st.hpMax})`);
  const st2 = newState({});
  const lv = levelOf(400);
  applyEffects(st2, ['xp += 400']);
  check(st2.level === lv && st2.hpMax === 30 + 6 * (lv - 1), 'سطح و پاداشش با جدول تجربه هم‌خوان است');
  check(st2.hp === st2.hpMax && st2.energy === st2.energyMax, 'هنگام بالا رفتن سطح، جان و توان پر می‌شود');
}

{
  // «بازیکنِ خوب باید بتواند به پایان‌ها برسد»: سخت‌ترین نبرد داستان را با
  // یک شخصیتِ معقول (سطح ۶، ویژگی ۵، شمشیر و زرهٔ چرمی) می‌آزماییم.
  const LEVEL = 6;
  const mk = () => {
    const st = newState({});
    st.level = LEVEL;
    st.xp = XP_TABLE[LEVEL - 1];
    st.hpMax = 30 + 6 * (LEVEL - 1);
    st.hp = st.hpMax;
    st.energyMax = 12 + (LEVEL - 1);
    st.energy = st.energyMax;
    for (const k of Object.keys(st.stats)) st.stats[k] = 5;
    st.inv = { potion: 4, potion_big: 1 };
    st.weapon = 'blade';
    st.armor = 'leather';
    return st;
  };
  const hard = Object.entries(SCENES).filter(([, s]) => s.combat && s.combat.foes.includes('varkhan'));
  check(hard.length > 0, 'نبردِ ورخان در داستان هست');
  let wins = 0;
  const runs = 24;
  for (let i = 0; i < runs; i++) {
    const st = mk();
    const c = new Combat(st, hard[0][1].combat.foes, {});
    let guard = 0;
    while (!c.over && guard++ < 300) {
      const frac = st.hp / st.hpMax;
      if (frac < 0.4 && st.inv.potion_big) c.act('potion_big');
      else if (frac < 0.5 && st.inv.potion) c.act('potion');
      else {
        const sk = c.actions().find((a) => a.id === 'skill' && a.ok);
        if (sk && (frac > 0.55 || st.energy > 8)) c.act('skill', sk.skill);
        else c.act('attack');
      }
    }
    if (c.won) wins++;
  }
  check(wins >= runs * 0.6, `بازیکنِ آماده نبردِ آخر را می‌برد (${wins}/${runs} برد)`);
  // و برعکس: بازیکنِ ناآماده نباید ببرد (یعنی داستان بی‌چالش نیست)
  let rawWins = 0;
  for (let i = 0; i < runs; i++) {
    const st = newState({});
    st.inv = { potion: 1 };
    const c = new Combat(st, hard[0][1].combat.foes, {});
    let guard = 0;
    while (!c.over && guard++ < 300) c.act(st.hp < st.hpMax * 0.4 && st.inv.potion ? 'potion' : 'attack');
    if (c.won) rawWins++;
  }
  check(rawWins < runs * 0.7, `نبردِ آخر بدون آمادگی سخت است (${rawWins}/${runs} برد)`);
}

// ---------------------------------------------------------------
section('گشتِ خودکار در بازی');
// ---------------------------------------------------------------
{
  // پیمایش گراف صحنه‌ها: از آغاز تا یک پایان، فقط با انتخاب‌های ممکن
  const seen = new Set();
  const queue = ['intro_1'];
  // قلاب‌های مکان‌ها از مرکز مکان در دسترس‌اند، پس همان‌ها را هم شروع می‌کنیم
  for (const [id, s] of Object.entries(SCENES)) if (s.hook) queue.push(id);
  let reachedEnd = false;
  while (queue.length && seen.size < 4000) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const s = SCENES[id];
    if (!s) continue;
    for (const c of s.choices || []) {
      if (c.to && ENDINGS[c.to]) reachedEnd = true;
      if (c.to && c.to !== '@' && c.to !== '#') queue.push(c.to);
      for (const d of c.do || []) {
        if (d.startsWith('end:')) reachedEnd = true;
        if (d.startsWith('goto:')) queue.push(d.slice(5));
      }
    }
    if (s.combat) {
      for (const t of [s.combat.onWin, s.combat.onLose]) if (t) queue.push(t);
      for (const t of [s.combat.onWin, s.combat.onLose]) if (t && ENDINGS[t]) reachedEnd = true;
    }
  }
  check(seen.size > 60, `گراف داستان پیمایش‌شدنی است (${seen.size} صحنه از آغاز دیدنی است)`);
  check(reachedEnd, 'از آغاز داستان، پایان در دسترس است');
}

{
  // چند دور بازی خودکار با سیاست ساده: هیچ خطایی رخ ندهد
  const errs = [];
  const rounds = 6;
  for (let r = 0; r < rounds; r++) {
    let seed = r * 7717 + 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const eng = Engine.start({ state: newState({ name: 'گشت' }) });
    for (let step = 0; step < 320; step++) {
      let v;
      try {
        v = eng.view();
      } catch (e) {
        errs.push('view: ' + e.message);
        break;
      }
      if (v.type === 'end') break;
      const list = v.type === 'combat' ? v.actions : v.choices || [];
      const ok = list.map((c, i) => ({ c, i })).filter(({ c }) => !c.locked);
      if (!ok.length) break;
      let i;
      if (v.type === 'combat') {
        const heal = ok.find(({ c }) => (c.id === 'potion' || c.id === 'skill') && v.hp / v.hpMax < 0.5);
        i = (heal || ok[0]).i;
      } else if (v.type === 'hub') {
        const story = ok.filter(({ c }) => c.story);
        i = (story.length && rnd() < 0.6 ? story[0] : ok[Math.floor(rnd() * ok.length)]).i;
      } else {
        const fwd = ok.filter(({ c }) => c.choice && c.choice.to && c.choice.to !== '@');
        i = (fwd.length ? fwd[Math.floor(rnd() * fwd.length)] : ok[0]).i;
      }
      try {
        eng.choose(i);
      } catch (e) {
        errs.push(`گام ${step} (${v.type}): ${e.message}`);
        break;
      }
      const st = eng.state;
      if (!Number.isFinite(st.hp) || st.hp < 0 || st.hp > st.hpMax) errs.push('جان نامعتبر: ' + st.hp);
      if (!Number.isFinite(st.gold) || st.gold < 0) errs.push('پول نامعتبر: ' + st.gold);
      if (!Number.isFinite(st.energy) || st.energy < 0) errs.push('توان نامعتبر: ' + st.energy);
      if (st.day < 1) errs.push('روز نامعتبر: ' + st.day);
    }
  }
  check(errs.length === 0, `گشتِ خودکار بی‌خطا بود (${[...new Set(errs)].slice(0, 3).join(' | ')})`);
}

// ---------------------------------------------------------------
console.log('');
console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed) process.exit(1);
