// =============================================================
//  main.js — راه‌اندازی ابسیدین: صفحهٔ آغاز، ساخت شخصیت، بازی
// =============================================================
import { Engine } from './engine.js';
import { UI } from './ui.js';
import { voice } from './voice.js';
import { hasSave, clearSave, newState } from './state.js';

const $ = (id) => document.getElementById(id);
let engine = null;
let ui = null;

const create = { name: '', gender: 'm', origin: 'kargar' };

const ORIGINS = {
  kargar: {
    label: 'کارگرِ دهکده',
    stats: { might: 2 },
    inv: { bread: 4, potion: 1, knife: 1 },
    gold: 6,
    weapon: 'knife',
    note: 'دست‌های پینه‌بسته و پشتی که خم نمی‌شود.',
  },
  rohan: {
    label: 'شاگردِ موبد',
    stats: { wits: 2 },
    inv: { potion: 2, potion_big: 1, lantern: 1, herbal: 1 },
    gold: 4,
    weapon: 'knife',
    note: 'کتاب‌ها را بلدی، ولی شمشیر را نه.',
  },
  yatim: {
    label: 'یتیمِ کوه',
    stats: { spirit: 1, agility: 1 },
    inv: { bread: 2, potion: 1 },
    gold: 2,
    weapon: 'bow',
    note: 'کمانِ پدرت را برداشتی و از کوه پایین آمدی.',
  },
};

// ---------------- صفحه‌ها ----------------
function show(id) {
  for (const s of ['screen-title', 'screen-create', 'screen-end']) $(s).classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
  $('game').classList.toggle('hidden', id !== 'game');
}

function paintCreate() {
  document.querySelectorAll('#pick-gender .pick').forEach((b) => b.classList.toggle('on', b.dataset.v === create.gender));
  document.querySelectorAll('#pick-origin .pick').forEach((b) => b.classList.toggle('on', b.dataset.v === create.origin));
  const o = ORIGINS[create.origin];
  const parts = Object.entries(o.stats).map(([k, v]) => {
    const fa = { might: 'زور', wits: 'خرد', spirit: 'دل', agility: 'چابکی' }[k];
    return `${fa} +${v}`;
  });
  $('create-preview').textContent = `${o.note} (${parts.join(' · ')})`;
  $('btn-begin').disabled = !create.name.trim();
  $('btn-begin').style.opacity = create.name.trim() ? '1' : '0.5';
}

// ---------------- آغاز بازی ----------------
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  voice.init();
  try {
    voice.speak('', null);
  } catch {}
}

function startGame(opts = {}) {
  engine = Engine.start(opts);
  engine.state.name = opts.name || 'بی‌نام';
  engine.state.weapon = opts.weapon || 'knife';
  ui = new UI(engine, {
    onTurn: (eng) => {
      eng.save();
      if (eng.message) ui.toast(eng.message);
      eng.message = '';
    },
  });
  show('game');
  ui.render();
  voice.init();
}

function continueGame() {
  const eng = Engine.loadOrNull({});
  if (!eng) {
    ui && ui.toast('ذخیره‌ای پیدا نشد.');
    return;
  }
  engine = eng;
  ui = new UI(engine, {
    onTurn: (e) => {
      e.save();
      if (e.message) ui.toast(e.message);
      e.message = '';
    },
  });
  show('game');
  ui.render();
  voice.init();
  ui.toast('📖 داستانت را از همان‌جا که بودی ادامه می‌دهی.');
}

// ---------------- اتصال‌ها ----------------
let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  $('btn-continue').classList.toggle('hidden', !hasSave());

  $('btn-new').addEventListener('click', () => {
    show('screen-create');
    paintCreate();
  });
  $('btn-back').addEventListener('click', () => show('screen-title'));

  $('in-name').addEventListener('input', (e) => {
    create.name = e.target.value.slice(0, 14);
    paintCreate();
  });
  document.querySelectorAll('#pick-gender .pick').forEach((b) =>
    b.addEventListener('click', () => {
      create.gender = b.dataset.v;
      paintCreate();
    })
  );
  document.querySelectorAll('#pick-origin .pick').forEach((b) =>
    b.addEventListener('click', () => {
      create.origin = b.dataset.v;
      paintCreate();
    })
  );

  $('btn-begin').addEventListener('click', () => {
    const o = ORIGINS[create.origin];
    const st = newState({
      name: create.name.trim() || 'بی‌نام',
      gender: create.gender,
      origin: create.origin,
      weapon: o.weapon,
      gold: o.gold,
      inv: { ...o.inv },
    });
    for (const [k, v] of Object.entries(o.stats)) st.stats[k] += v;
    st.companions = ['mira'];
    st.rel.mira = 2;
    voice.setMuted(false);
    startGame({ state: st, name: st.name, weapon: o.weapon, scene: 'intro_1' });
    ui.toast('🪨 داستان آغاز شد — انتخاب‌هایت سرنوشت را می‌سازند.');
  });

  $('btn-continue').addEventListener('click', () => continueGame());
  $('btn-title2').addEventListener('click', () => {
    show('screen-title');
    $('btn-continue').classList.toggle('hidden', !hasSave());
  });
  $('btn-again').addEventListener('click', () => {
    clearSave();
    show('screen-create');
    paintCreate();
  });

  ui = null;
  show('screen-title');

  // آفلاین‌سازی (اختیاری؛ اگر مرورگر پشتیبانی نکند، بازی عادی کار می‌کند)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// برای تست‌های خودکار (jsdom): دسترسی به موتور و رابط
window.OBS = {
  get engine() {
    return engine;
  },
  get ui() {
    return ui;
  },
  start: startGame,
  origins: ORIGINS,
};
window.__MG_READY__ = true;
