// =============================================================
//  main.js — نقطهٔ ورود: صحنهٔ سه‌بعدی، حلقهٔ بازی و اتصال
//  همهٔ سیستم‌ها به هم (روزها، خرید، قیمت‌گذاری، مشتری‌ها)
//
//  ⚠️ ترتیب راه‌اندازی عمداً این‌گونه است:
//    ۱) اول دکمه‌ها وصل می‌شوند (ui.initUI) — یعنی دکمهٔ
//       «شروع بازی» همیشه زنده است.
//    ۲) بعد موتور سه‌بعدی ساخته می‌شود و داخل try است؛ اگر
//       WebGL در دسترس نبود، بازی در «حالت بدون گرافیک» ادامه
//       می‌یابد و پیام خطا نمایش داده می‌شود — نه یک دکمهٔ مرده
//       و بی‌سروصدا.
// =============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PRODUCTS, GAME } from './config.js';
import { rollMarketPrices } from './economy.js';
import { newGameState, saveGame, loadGame, hasSave, clearSave, freshDayStats } from './state.js';
import {
  createWorld,
  createHeadlessWorld,
  buildLights,
  refreshShelves,
  refreshTags,
  floatText,
  REGISTER_POS,
} from './scene3d.js';
import { DaySimulation } from './customers.js';
import * as ui from './ui.js';
import { sfx } from './sound.js';
import { fa, money } from './util.js';

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let world = null;
let state = null;
let phase = 'menu'; // menu | prep | running | report
let sim = null;
const clock = new THREE.Clock();
const HOME_CAM = new THREE.Vector3(0.9, 4.6, 8.0);
const HOME_TARGET = new THREE.Vector3(0, 0.85, 0);

init();

function init() {
  // ۱) اول رابط کاربری — حتی اگر موتور سه‌بعدی بمیرد، دکمه‌ها کار می‌کنند
  ui.initUI({
    startNew,
    continueGame,
    restart,
    buy,
    setPrice,
    startDay,
    nextDay,
    resetView,
    refreshSupplier: () => state && ui.refreshSupplier(state),
    refreshPricing: () => state && ui.refreshPricing(state),
  });
  ui.showContinue(hasSave());
  window.addEventListener('resize', onResize);

  // ۲) موتور سه‌بعدی (اختیاری — خطایش بازی را متوقف نمی‌کند)
  initEngine();

  registerServiceWorker();
  animate();

  // نشانهٔ «بازی بالا آمد» برای watchdog در index.html
  window.__MG_READY__ = true;
}

/**
 * ساخت رندرر/صحنهٔ سه‌بعدی. اگر WebGL موجود نباشد (مرورگر قدیمی،
 * غیرفعال‌شده، یا مسدودشده توسط افزونه) یک دنیای بدون‌گرافیک
 * ساخته می‌شود تا منطق بازی (خرید، قیمت‌گذاری، مشتری، گزارش)
 * همچنان کامل کار کند.
 */
function initEngine() {
  try {
    const canvas = document.getElementById('scene');
    if (!canvas) throw new Error('canvas #scene پیدا نشد');

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe0f2);
    scene.fog = new THREE.Fog(0xcfe8f7, 26, 48);

    camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.copy(HOME_CAM);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 15;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = 1.52;

    buildLights(scene);
    world = createWorld(scene);
    return true;
  } catch (err) {
    // هر خطایی اینجا افتاد: رندر را خاموش کن ولی بازی را نگه دار
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
    world = createHeadlessWorld();
    console.warn('[market-game] موتور سه‌بعدی بالا نیامد — حالت بدون گرافیک فعال شد:', err);
    ui.showEngineError(err);
    return false;
  }
}

// ---------- PWA: ثبت Service Worker (آفلاین + نصب‌پذیری) ----------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const isSecure =
    location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!isSecure) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function onResize() {
  if (!renderer || !camera) return; // حالت بدون گرافیک
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- شروع بازی ----------
function enterGame(msg) {
  ui.hideStartScreen(); // صفحهٔ شروع کنار می‌رود تا بازی دیده شود
  ui.showHud();
  ui.setHud(state);
  refreshShelves(world, state.inventory);
  refreshTags(world, state.salePrice);
  phase = 'prep';
  if (msg) ui.toast(msg, 'info', 3600);
}

function startNew() {
  sfx.init();
  state = newGameState();
  saveGame(state);
  enterGame('🚀 با ۱۰۰ دلار و یک سوپرمارکت ۲۰ متری شروع شد! اول جنس بخر 🛒');
}

function continueGame() {
  sfx.init();
  state = loadGame();
  if (!state) {
    state = newGameState();
    saveGame(state);
  }
  enterGame('🛒 به سوپرمارکتت خوش اومدی!');
}

function restart() {
  ui.confirmBox('پیشرفت فعلی پاک شود و بازی از اول شروع شود؟', () => {
    clearSave();
    state = newGameState();
    saveGame(state);
    enterGame('🔄 بازی از نو شروع شد!');
  });
}

// ---------- خرید از تأمین‌کننده ----------
function buy(id, n) {
  if (!state || phase !== 'prep' || n < 1) return false;
  const p = PRODUCTS.find((x) => x.id === id);
  const cost = state.market[id] * n;
  if (state.money < cost) {
    ui.toast('💸 پول کافی نیست!', 'warn');
    return false;
  }
  state.money -= cost;
  state.inventory[id] += n;
  state.dayStats.expenses += cost;
  saveGame(state);
  ui.setHud(state);
  refreshShelves(world, state.inventory); // کالاها با انیمیشن روی قفسه چیده می‌شوند
  ui.toast(`${p.emoji} ${fa(n)} «${p.name}» خرید شد و روی قفسه چیده شد`);
  sfx.buy();
  return true;
}

// ---------- قیمت‌گذاری ----------
function setPrice(id, delta) {
  if (!state || phase === 'running') return;
  const next = Math.min(GAME.price.max, Math.max(GAME.price.min, state.salePrice[id] + delta));
  if (next === state.salePrice[id]) return;
  state.salePrice[id] = next;
  saveGame(state);
  refreshTags(world, state.salePrice); // تگ روی قفسه هم به‌روز می‌شود
  ui.refreshPricing(state);
  sfx.click();
}

// ---------- شروع روز (ورود مشتری‌ها) ----------
function startDay() {
  if (!state || phase !== 'prep') return;
  const totalInv = Object.values(state.inventory).reduce((a, b) => a + b, 0);
  const go = () => {
    phase = 'running';
    closeSheets();
    ui.setRunning(true);
    sim = new DaySimulation(state, world, {
      onSale: (items, rev) => {
        sfx.coin();
        ui.setHud(state);
        ui.bumpMoney(rev);
        if (renderer) floatText(world, `+${money(rev)}`, REGISTER_POS);
      },
      onDayEnd: () => endDay(),
    });
  };
  if (totalInv === 0) {
    ui.confirmBox('قفسه‌ها کاملاً خالی است! مشتری‌ها چیزی نمی‌خرند. باز هم شروع کنیم؟', go);
  } else {
    go();
  }
}

function endDay() {
  phase = 'report';
  sim = null;
  // هزینه‌هایی که تا لحظهٔ گزارش محاسبه شده — خرید بعدی (بین گزارش و
  // روز بعد) به آمارِ روزِ تازه منتقل می‌شود، نه روز قدیم
  state.reportedExpenses = state.dayStats.expenses;
  ui.setRunning(false);
  saveGame(state);
  sfx.dayEnd();
  setTimeout(() => {
    if (phase === 'report') ui.showReport(state);
  }, 500);
}

// ---------- روز بعد: قیمت بازار دوباره تغییر می‌کند ----------
function nextDay() {
  if (!state || phase !== 'report') return;
  state.day += 1;
  const prev = state.market;
  state.market = rollMarketPrices(state.day, prev);
  const carried = Math.max(
    0,
    state.dayStats.expenses - (state.reportedExpenses ?? state.dayStats.expenses)
  );
  state.dayStats = freshDayStats();
  state.dayStats.expenses = carried;
  delete state.reportedExpenses;
  phase = 'prep';
  saveGame(state);
  closeSheets();
  ui.setHud(state);
  refreshTags(world, state.salePrice);

  const changed = PRODUCTS.filter((p) => prev[p.id] !== state.market[p.id]);
  if (changed.length) {
    const parts = changed.map((p) => {
      const d = state.market[p.id] - prev[p.id];
      const arrow = d > 0 ? '▲' : '▼';
      return `${p.emoji} ${fa(state.market[p.id])} ${arrow}`;
    });
    ui.toast(`📊 قیمت بازار روز ${fa(state.day)}: ${parts.join('  ')}`, 'info', 4500);
  } else {
    ui.toast(`🌅 روز ${fa(state.day)} آغاز شد — قیمت‌ها ثابت ماند`, 'info', 3200);
  }
}

function closeSheets() {
  ui.closeSheets();
}

function resetView() {
  if (camera && controls) {
    camera.position.copy(HOME_CAM);
    controls.target.copy(HOME_TARGET);
  }
  sfx.click();
}

// ---------- حلقهٔ بازی ----------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  if (controls) controls.update();
  if (world) world.update(dt);
  if (sim) {
    sim.update(dt);
    // ممکن است sim.update روز را تمام کرده و sim را null کرده باشد
    if (sim) ui.setProgress(sim.spawned, sim.total);
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}
