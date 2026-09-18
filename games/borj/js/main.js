// =============================================================
//  main.js — راه‌اندازی بازی «دویدن تا برج»
//  فهرست مرحله‌ها، حلقهٔ بازی، کنترل لمسی و کلیدی، پیشرفت و صدا
// =============================================================
import { LEVELS, levelAt } from './levels.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { audio } from './audio.js';
import { load, record, totalStars, isUnlocked, clear } from './progress.js';

const $ = (id) => document.getElementById(id);
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/[0-9]/g, (d) => FA[+d]);
const SCREENS = ['screen-title', 'screen-game', 'screen-win', 'screen-howto'];

let save = load();
let index = 0;
let game = null;
let renderer = null;
let running = false;
let paused = false;
let raf = 0;
let last = 0;
let acc = 0;
let ended = null; // 'won' | 'over' | null — پایانِ پردازش‌شدهٔ همین تلاش
const STEP = 1 / 120;

const keys = { left: false, right: false, jump: false };

// ---------------- صفحه‌ها ----------------
function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  if (id === 'screen-title') paintLevels();
}
function overlay(id) {
  for (const o of ['ov-pause', 'ov-clear', 'ov-over']) $(o).classList.toggle('hidden', o !== id);
}
function hideOverlays() {
  overlay(null);
}

// ---------------- فهرست مرحله‌ها ----------------
function paintLevels() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const open = isUnlocked(save, i);
    const stars = save.stars[i] || 0;
    const b = document.createElement('button');
    b.className = 'lvl-card';
    b.disabled = !open;
    b.innerHTML =
      `<span class="n">${fa(i + 1)}</span>` +
      `<span class="nm">${open ? L.name : 'قفل است'}</span>` +
      `<span class="st">${open ? '⭐'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars)) : ''}</span>` +
      (open ? '' : '<span class="lock">🔒</span>');
    // best time of this level, if any
    if (open && save.best[i]) b.title = `بهترین زمان: ${fa(save.best[i])} ثانیه`;
    b.addEventListener('click', () => {
      audio.click();
      startLevel(i);
    });
    grid.appendChild(b);
  });
  $('stat-stars').textContent = fa(totalStars(save));
  $('stat-stars-max').textContent = fa(LEVELS.length * 3);
}

// ---------------- اندازهٔ بوم ----------------
function fit() {
  if (!renderer || !game) return;
  const stage = document.querySelector('.stage');
  const w = Math.max(320, Math.min(stage.clientWidth || window.innerWidth || 640, 1100));
  const h = Math.max(260, stage.clientHeight || window.innerHeight || 420);
  renderer.resize(w, h);
  game.setViewport(w, h);
}

// ---------------- آغاز مرحله ----------------
function startLevel(i) {
  index = Math.max(0, Math.min(LEVELS.length - 1, i));
  game = new Game(levelAt(index), { hearts: 3 });
  game.setViewport(window.innerWidth || 640, window.innerHeight || 420);
  running = true;
  paused = false;
  acc = 0;
  ended = null;
  last = now();
  audio.unlock();
  audio.bgm();
  hideOverlays();
  show('screen-game');
  fit();
  syncHud();
  if (!raf) raf = requestAnimationFrame(frame);
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

// ---------------- حلقهٔ بازی ----------------
function frame(ts) {
  raf = requestAnimationFrame(frame);
  const t = typeof ts === 'number' ? ts : now();
  let dt = (t - last) / 1000;
  last = t;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(0.06, dt);
  tick(dt);
  if (renderer && game) renderer.draw(game, index);
}

/** یک گام کامل: فیزیک، رخدادها، رابط، وضعیت برد/باخت (برای تست هم استفاده می‌شود) */
function tick(dt) {
  if (!game) return;
  if (running && !paused && game.state === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 16) {
      game.step(STEP, { right: keys.right, left: keys.left, jump: keys.jump });
      acc -= STEP;
      n++;
    }
  }
  if (renderer) renderer.update(dt);
  drain();
  syncHud();
  // پایان مرحله فقط یک‌بار پردازش می‌شود (حتی اگر رخداد بیرون از حلقه رخ دهد)
  if (game.state === 'won' && ended !== 'won') {
    ended = 'won';
    win();
  } else if (game.state === 'dead' && ended !== 'over') {
    ended = 'over';
    over();
  }
}

// ---------------- رخدادهای بازی ----------------
function drain() {
  for (const ev of game.drainEvents()) {
    const cx = ev.x ?? game.player.x + game.player.w / 2;
    const cy = ev.y ?? game.player.y;
    if (ev.type === 'jump') audio.jump();
    else if (ev.type === 'jump2') audio.jump2();
    else if (ev.type === 'coin') {
      audio.coin();
      renderer && renderer.poke('coin', cx, cy);
      renderer && renderer.label('+۱', cx, cy - 10);
    } else if (ev.type === 'power') {
      audio.power();
      renderer && renderer.poke('power', cx, cy);
      renderer && renderer.label('پرش دوگانه!', cx, cy - 14, '#8be9fd');
    } else if (ev.type === 'stomp') {
      audio.stomp();
      renderer && renderer.poke('stomp', cx, cy);
    } else if (ev.type === 'hurt') {
      audio.hurt();
      renderer && renderer.poke('hurt', cx, cy);
    } else if (ev.type === 'dead') {
      audio.dead();
      renderer && renderer.poke('dead', cx, cy);
    } else if (ev.type === 'goal') {
      audio.win();
    } else if (ev.type === 'fall') {
      audio.hurt();
    }
  }
}

// ---------------- نوار اطلاعات ----------------
function syncHud() {
  const L = LEVELS[index];
  $('hud-level').textContent = `مرحلهٔ ${fa(index + 1)} — ${L.name}`;
  $('hud-hearts').textContent = '❤️'.repeat(Math.max(0, game.hearts)) + '🖤'.repeat(Math.max(0, 3 - game.hearts));
  $('hud-coins').textContent = `🪙 ${fa(game.coins)}/${fa(game.coinTotal)}`;
  const frac = Math.max(0, Math.min(1, game.timeLeft / (L.time || 60)));
  $('time-fill').style.width = (frac * 100).toFixed(1) + '%';
  $('hud-time').textContent = fa(Math.ceil(game.timeLeft));
}

// ---------------- پایان مرحله ----------------
function win() {
  running = false;
  const L = LEVELS[index];
  const timeUsed = L.time - game.timeLeft;
  const res = record(save, index, { timeUsed, coins: game.coins, coinTotal: game.coinTotal, level: L });
  $('clear-stars').textContent = '⭐'.repeat(res.stars) + '☆'.repeat(3 - res.stars);
  $('clear-stats').textContent =
    `زمان: ${fa(timeUsed.toFixed(1))} ثانیه · سکه: ${fa(game.coins)} از ${fa(game.coinTotal)}` +
    (res.stars < 3 ? ' — سریع‌تر بدو و همهٔ سکه‌ها را بگیر تا سه‌ستاره شوی.' : ' — عالی بود!');
  $('btn-next').classList.toggle('hidden', index >= LEVELS.length - 1);
  overlay('ov-clear');
  if (index >= LEVELS.length - 1) {
    setTimeout(() => {
      const total = totalStars(save);
      $('win-stats').textContent =
        `هر پنج مرحله را تمام کردی! ⭐ ${fa(total)} از ${fa(LEVELS.length * 3)} ستاره · ${fa(game.deaths)} باختِ جان.`;
      show('screen-win');
    }, 1200);
  }
}

function over() {
  running = false;
  $('over-stats').textContent = `در مرحلهٔ ${fa(index + 1)} (${LEVELS[index].name}) — ${fa(game.coins)} سکه برداشتی. ${
    game.deaths > 1 ? 'این بار نزدیک‌تر بودی!' : 'یک بار دیگر امتحان کن!'
  }`;
  overlay('ov-over');
}

// ---------------- ورودی ----------------
const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  Space: 'jump',
  KeyW: 'jump',
};
function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    keys[k] = true;
    if (k === 'jump') e.preventDefault();
    audio.unlock();
    if (e.code === 'Escape' || e.code === 'KeyP') togglingPause();
  });
  document.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });
}
function togglingPause() {
  if (!game || !running) return;
  paused = !paused;
  pauseOverlay();
}
function pauseOverlay() {
  overlay(paused ? 'ov-pause' : null);
  if (!paused) last = now();
}

/** دکمه‌های لمسی: هر دکمه با pointer capture تا انگشت از رویش هم بگذرد */
function bindTouch(id, key) {
  const el = $(id);
  const down = (e) => {
    e.preventDefault();
    keys[key] = true;
    el.classList.add('on');
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    audio.unlock();
  };
  const up = (e) => {
    if (e) e.preventDefault();
    keys[key] = false;
    el.classList.remove('on');
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------- اتصال دکمه‌ها ----------------
let booted = false;
function boot() {
  if (booted) return;
  booted = true;

  // بوم و نقاش (اگر مرورگر canvas نداشت، بازی منطقی بی‌نقاشی هم کار می‌کند)
  const canvas = $('game');
  try {
    renderer = new Renderer(canvas);
    if (!renderer.ctx) renderer = null;
  } catch {
    renderer = null;
  }

  bindKeys();
  bindTouch('btn-left', 'left');
  bindTouch('btn-right', 'right');
  bindTouch('btn-jump', 'jump');

  $('btn-howto').addEventListener('click', () => {
    audio.click();
    show('screen-howto');
  });
  $('btn-back-title').addEventListener('click', () => {
    audio.click();
    show('screen-title');
  });
  $('btn-sound').addEventListener('click', () => {
    const on = audio.toggle();
    save.sound = on;
    $('btn-sound').textContent = on ? '🔊 صدا' : '🔇 صدا';
  });
  $('btn-reset').addEventListener('click', () => {
    audio.click();
    clear();
    save = load();
    paintLevels();
  });

  $('btn-pause').addEventListener('click', () => {
    audio.click();
    togglingPause();
  });
  $('btn-resume').addEventListener('click', () => {
    audio.click();
    paused = false;
    pauseOverlay();
  });
  $('btn-restart').addEventListener('click', () => {
    audio.click();
    hideOverlays();
    startLevel(index);
  });
  $('btn-retry').addEventListener('click', () => startLevel(index));
  $('btn-next').addEventListener('click', () => startLevel(index + 1));
  $('btn-again').addEventListener('click', () => startLevel(index));
  for (const id of ['btn-levels', 'btn-levels2', 'btn-levels3', 'btn-levels4'])
    $(id).addEventListener('click', () => {
      audio.click();
      running = false;
      hideOverlays();
      show('screen-title');
    });

  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 150));
  window.addEventListener('blur', () => {
    if (running && !paused && game) {
      paused = true;
      pauseOverlay();
    }
  });

  audio.setOn(save.sound !== false);
  $('btn-sound').textContent = audio.on ? '🔊 صدا' : '🔇 صدا';
  paintLevels();
  show('screen-title');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// برای تست‌های خودکار (jsdom) و اشکال‌زدایی در مرورگر
window.BORJ = {
  levels: LEVELS,
  get game() {
    return game;
  },
  get index() {
    return index;
  },
  get save() {
    return save;
  },
  start: startLevel,
  tick,
  keys,
  audio,
  fit,
};
window.__BORJ_READY__ = true;
