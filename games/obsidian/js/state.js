// =============================================================
//  state.js — وضعیت بازی «ابسیدین» + زبان شرط‌ها و اثرها
//
//  تمام داستان با یک «زبان کوچک» داده‌ای نوشته می‌شود:
//    شرط‌ها:   'flag:shattered'  '!flag:x'  'rel:mira>=3'  'stat:wits>=3'
//              'item:potion'  'comp:mira'  'quest:q_shard'  'gold>=50'
//              'chapter>=3'  'visited:jangal'  'hp<=10'
//    اثرها:    'flag:x=1'  'rel:mira+=1'  'stat:might+=1'  'gold+=25'
//              'hp-=8'  'item:potion+=2'  'quest:q_shard'  'comp:tigh'
//              'goto:scene'  'end:ending_ash'  'achv:slayer'  'day+=1'
// =============================================================

export const SAVE_KEY = 'obsidian-save-v1';
export const XP_TABLE = [0, 60, 150, 300, 520, 800, 1150, 1600, 2150, 2800, 3600];
export const PHASES = { dawn: 'سپیده‌دم', day: 'روز', dusk: 'غروب', night: 'شب' };

export function newState(extra = {}) {
  return {
    v: 1,
    startedAt: 0,
    name: 'بی‌نام',
    gender: 'm',
    origin: 'kargar',
    // چهار ویژگی اصلی: زور، خرد، دل، چابکی
    stats: { might: 2, wits: 2, spirit: 2, agility: 2 },
    hp: 30,
    hpMax: 30,
    energy: 12,
    energyMax: 12,
    level: 1,
    xp: 0,
    gold: 12,
    inv: { potion: 2, bread: 3 },
    skills: { blade: true },
    flags: {},
    rel: {},
    companions: [],
    quests: {},
    done: {},
    visited: {},
    journal: [],
    log: [],
    kills: 0,
    day: 1,
    phase: 'day',
    chapter: 1,
    location: 'sangab',
    scene: 'intro_1',
    endings: [],
    achievements: [],
    sceneCount: 0,
    phasesPassed: 0,
    ...extra,
  };
}

// ---------------------------------------------------------------
//  شرط‌ها
// ---------------------------------------------------------------
/** یک شرط را به تابع تبدیل می‌کند. اگر رشته ناشناخته باشد، خطا می‌دهد (تست می‌گیرد). */
export function parseCond(src) {
  const s = String(src || '').trim();
  if (!s || s === 'true') return () => true;
  if (s === 'false') return () => false;
  if (s.startsWith('!flag:')) {
    const k = s.slice(6);
    return (st) => !st.flags[k];
  }
  if (s.startsWith('flag:')) {
    const k = s.slice(5);
    return (st) => !!st.flags[k];
  }
  if (s.startsWith('ending:')) {
    const k = s.slice(7);
    return (st) => (st.endings || []).includes(k);
  }
  if (s.startsWith('achv:')) {
    const k = s.slice(5);
    return (st) => (st.achievements || []).includes(k);
  }
  if (s.startsWith('visited:')) {
    const k = s.slice(8);
    return (st) => !!st.visited[k];
  }
  if (s.startsWith('item:')) {
    // ⚠️ شناسهٔ آیتم می‌تواند رقم داشته باشد (`shard2`)؛ بدون ۰-۹ این شرط
    //    استثنا می‌داد و راهِ برج سرخ — یعنی راهِ پایان‌ها — می‌بست.
    const m = s.slice(5).match(/^([a-z_0-9]+)(>=(\d+))?$/);
    if (!m) throw new Error('شرط نامعتبر: ' + s);
    const id = m[1];
    const n = m[3] ? +m[3] : 1;
    return (st) => (st.inv[id] || 0) >= n;
  }
  if (s.startsWith('comp:')) {
    const k = s.slice(5);
    return (st) => (st.companions || []).includes(k);
  }
  if (s.startsWith('quest:')) {
    const k = s.slice(6);
    return (st) => !!st.quests[k];
  }
  if (s.startsWith('questdone:')) {
    const k = s.slice(10);
    return (st) => !!st.done[k];
  }
  if (s.startsWith('skill:')) {
    const k = s.slice(6);
    return (st) => !!st.skills[k];
  }
  if (s.startsWith('rel:')) {
    const m = s.slice(4).match(/^([a-z_]+)\s*(>=|<=|>|<)\s*(-?\d+)$/);
    if (!m) throw new Error('شرط رابطهٔ نامعتبر: ' + s);
    const id = m[1];
    const op = m[2];
    const n = +m[3];
    return (st) => {
      const v = st.rel[id] || 0;
      if (op === '>=') return v >= n;
      if (op === '<=') return v <= n;
      if (op === '>') return v > n;
      return v < n;
    };
  }
  if (s.startsWith('stat:')) {
    const m = s.slice(5).match(/^([a-z_]+)\s*(>=|<=|>|<)\s*(\d+)$/);
    if (!m) throw new Error('شرط ویژگی نامعتبر: ' + s);
    const [, id, op, n] = m;
    return (st) => {
      const v = st.stats[id] || 0;
      if (op === '>=') return v >= +n;
      if (op === '<=') return v <= +n;
      if (op === '>') return v > +n;
      return v < +n;
    };
  }
  const cmp = s.match(/^(gold|hp|energy|level|chapter|kills|day)\s*(>=|<=|>|<)\s*(\d+)$/);
  if (cmp) {
    const [, key, op, n] = cmp;
    return (st) => {
      const v = st[key] || 0;
      if (op === '>=') return v >= +n;
      if (op === '<=') return v <= +n;
      if (op === '>') return v > +n;
      return v < +n;
    };
  }
  throw new Error('شرط ناشناخته: ' + s);
}

export function checkCond(state, cond) {
  if (cond == null) return true;
  if (Array.isArray(cond)) return cond.every((c) => checkCond(state, c));
  if (typeof cond === 'function') return !!cond(state);
  return parseCond(cond)(state);
}

// ---------------------------------------------------------------
//  اثرها
// ---------------------------------------------------------------
export function parseEffect(src) {
  const s = String(src || '').trim();
  if (!s) return () => {};
  let m;
  if ((m = s.match(/^flag:([a-z_0-9]+)\s*=\s*([01]?)$/))) {
    const [, k, v] = m;
    return (st) => {
      st.flags[k] = v === '' ? 1 : +v;
    };
  }
  if ((m = s.match(/^rel:([a-z_]+)\s*(\+=|-=|=)\s*(-?\d+)$/))) {
    const [, id, op, n] = m;
    return (st) => {
      const cur = st.rel[id] || 0;
      st.rel[id] = op === '+=' ? cur + +n : op === '-=' ? cur - +n : +n;
    };
  }
  if ((m = s.match(/^stat:([a-z_]+)\s*(\+=|-=|=)\s*(\d+)$/))) {
    const [, id, op, n] = m;
    return (st) => {
      const cur = st.stats[id] || 0;
      st.stats[id] = op === '+=' ? cur + +n : op === '-=' ? Math.max(1, cur - +n) : +n;
    };
  }
  if ((m = s.match(/^(gold|hp|hpMax|energy|energyMax|xp|day|level|chapter)\s*(\*=|\/=|\+=|-=|=)\s*(-?\d+(?:\.\d+)?)$/))) {
    const [, key, op, n] = m;
    return (st) => {
      const cur = st[key] || 0;
      st[key] = op === '+=' ? cur + +n : op === '-=' ? cur - +n : op === '*=' ? cur * +n : op === '/=' ? cur / +n : +n;
      st[key] = Math.round(st[key]);
      if (key === 'hp') st.hp = Math.max(0, Math.min(st.hp, st.hpMax));
    };
  }
  if ((m = s.match(/^item:([a-z_0-9]+)\s*(\+=|-=|=)\s*(\d+)$/))) {
    const [, id, op, n] = m;
    return (st) => {
      const cur = st.inv[id] || 0;
      const next = op === '+=' ? cur + +n : op === '-=' ? cur - +n : +n;
      if (next <= 0) delete st.inv[id];
      else st.inv[id] = next;
    };
  }
  if ((m = s.match(/^chapter:(\d+)$/))) {
    const n = +m[1];
    return (st) => {
      st.chapter = Math.max(st.chapter, n);
    };
  }
  if ((m = s.match(/^quest:([a-z_0-9]+)$/))) {
    const k = m[1];
    return (st) => {
      st.quests[k] = 1;
      if (!st.journal.includes(k)) st.journal.push(k);
    };
  }
  if ((m = s.match(/^questdone:([a-z_0-9]+)$/))) {
    const k = m[1];
    return (st) => {
      delete st.quests[k];
      st.done[k] = 1;
    };
  }
  if ((m = s.match(/^comp:([a-z_]+)$/))) {
    const k = m[1];
    return (st) => {
      if (!st.companions.includes(k)) st.companions.push(k);
      st.rel[k] = Math.max(st.rel[k] || 0, 2);
    };
  }
  if ((m = s.match(/^uncomp:([a-z_]+)$/))) {
    const k = m[1];
    return (st) => {
      st.companions = st.companions.filter((c) => c !== k);
    };
  }
  if ((m = s.match(/^skill:([a-z_]+)$/))) {
    const k = m[1];
    return (st) => {
      st.skills[k] = true;
    };
  }
  if ((m = s.match(/^achv:([a-z_0-9]+)$/))) {
    const k = m[1];
    return (st) => {
      if (!st.achievements.includes(k)) st.achievements.push(k);
    };
  }
  if ((m = s.match(/^phase:(dawn|day|dusk|night)$/))) {
    const p = m[1];
    return (st) => {
      st.phase = p;
    };
  }
  // اثرهای کنترلی فقط در engine معنا دارند (goto/end/combat)
  if (/^(goto|end|combat|travel):/.test(s)) return () => {};
  throw new Error('اثر ناشناخته: ' + s);
}

export function applyEffects(state, list) {
  const arr = list == null ? [] : Array.isArray(list) ? list : [list];
  for (const e of arr) {
    if (typeof e === 'function') e(state);
    else parseEffect(e)(state);
  }
  clampState(state);
  // ⚠️ تجربه‌ای که داستان می‌دهد (`xp += …`) هم باید سطح را بالا ببرد؛
  //    وگرنه سطح همیشه ۱ می‌ماند، جان/توان رشد نمی‌کند و نبردهای آخر
  //    ناعادلانه و نبردنی می‌شوند (سطح هم در فرمول آسیب اثر دارد).
  syncLevel(state);
  return state;
}

export function clampState(st) {
  st.hpMax = Math.max(1, st.hpMax);
  st.hp = Math.max(0, Math.min(st.hp, st.hpMax));
  st.energy = Math.max(0, Math.min(st.energy, st.energyMax));
  st.gold = Math.max(0, Math.round(st.gold));
  for (const k of Object.keys(st.stats)) st.stats[k] = Math.max(1, Math.min(10, st.stats[k]));
  return st;
}

// ---------------------------------------------------------------
//  تجربه و سطح
// ---------------------------------------------------------------
export function levelOf(xp) {
  let lv = 1;
  for (let i = 0; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]) lv = i + 1;
  return lv;
}
export function xpToNext(xp) {
  const lv = levelOf(xp);
  return XP_TABLE[Math.min(lv, XP_TABLE.length - 1)] ?? XP_TABLE[XP_TABLE.length - 1];
}

/**
 * سطح را با تجربه هم‌آهنگ می‌کند و پاداشِ هر سطح را می‌دهد.
 * ممکن است چند سطح یک‌جا بالا برود (مثلاً پایان یک فصل).
 * خروجی: پیام فارسی برای ژورنال، یا null اگر سطحی عوض نشده باشد.
 */
export function syncLevel(st) {
  const lv = levelOf(st.xp);
  if (lv <= st.level) return null;
  const gained = lv - st.level;
  st.level = lv;
  st.hpMax += 6 * gained;
  st.energyMax += 1 * gained;
  st.hp = st.hpMax;
  st.energy = st.energyMax;
  return `سطح ${lv}! جان و توان بیشتر شد.`;
}

/** تجربه می‌دهد و اگر سطح بالا رفت، پیام برمی‌گرداند */
export function gainXp(st, n) {
  st.xp += n;
  return syncLevel(st);
}

// ---------------------------------------------------------------
//  ذخیره و بارگذاری (localStorage — در Node/jsdom هم کار می‌کند)
// ---------------------------------------------------------------
function store() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function saveGame(st) {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(SAVE_KEY, JSON.stringify(st));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    // سالم‌سازی پرونده‌های قدیمی
    const base = newState();
    const merged = { ...base, ...data };
    merged.stats = { ...base.stats, ...(data.stats || {}) };
    merged.inv = { ...(data.inv || {}) };
    merged.flags = { ...(data.flags || {}) };
    merged.rel = { ...(data.rel || {}) };
    merged.quests = { ...(data.quests || {}) };
    merged.done = { ...(data.done || {}) };
    merged.visited = { ...(data.visited || {}) };
    merged.companions = Array.isArray(data.companions) ? data.companions.slice() : [];
    merged.endings = Array.isArray(data.endings) ? data.endings.slice() : [];
    merged.achievements = Array.isArray(data.achievements) ? data.achievements.slice() : [];
    merged.journal = Array.isArray(data.journal) ? data.journal.slice() : [];
    merged.skills = { ...base.skills, ...(data.skills || {}) };
    return clampState(merged);
  } catch {
    return null;
  }
}

export function hasSave() {
  const s = store();
  try {
    return !!(s && s.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function clearSave() {
  const s = store();
  try {
    s && s.removeItem(SAVE_KEY);
  } catch {}
}
