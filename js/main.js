// =============================================================
//  main.js — نقطهٔ ورود: صحنهٔ سه‌بعدی، حلقهٔ بازی و اتصال
//  همهٔ سیستم‌ها به هم (روزها، خرید، قیمت‌گذاری، مشتری‌ها، داستان)
//
//  ⚠️ ترتیب راه‌اندازی عمداً این‌گونه است:
//    ۱) اول دکمه‌ها وصل می‌شوند (ui.initUI) — یعنی دکمهٔ
//       «شروع بازی» همیشه زنده است.
//    ۲) بعد موتور سه‌بعدی ساخته می‌شود و داخل try است؛ اگر
//       WebGL در دسترس نبود، بازی در «حالت بدون گرافیک» ادامه
//       می‌یابد و پیام خطا نمایش داده می‌شود — نه یک دکمهٔ مرده.
// =============================================================
import * as THREE from 'three';
import { PRODUCTS, GAME } from './config.js';
import { rollMarketPrices } from './economy.js';
import { newGameState, saveGame, loadGame, hasSave, clearSave, freshDayStats } from './state.js';
import { clamp01 } from './anim.js';
import {
  createWorld,
  createHeadlessWorld,
  buildLights,
  refreshShelves,
  refreshTags,
  floatText,
  sparkle,
  REGISTER_POS,
  DOOR,
} from './scene3d.js';
import { FirstPerson, PLAYER_RADIUS } from './fps.js';
import { DaySimulation } from './customers.js';
import {
  WEATHERS,
  rollWeather,
  rollEvent,
  rollQuest,
  applyDay,
  evaluateQuest,
  questResultText,
  daySummaryLine,
  levelInfo,
  levelTitle,
  liveLine,
} from './story.js';
import * as ui from './ui.js';
import { sfx } from './sound.js';
import { PerfMonitor } from './perf.js';
import { fa } from './util.js';
import {
  toggleFullscreenAsync,
  onFullscreenChange,
  isFullscreen,
  isForcedLandscape,
  applyLandscape,
  releaseLandscape,
  refreshForcedLandscape,
  getViewportSize,
  debugForceLandscape,
  ORIENTATION_EVENT,
} from './fullscreen.js';

let renderer = null;
let scene = null;
let camera = null;
let fps = null; // کنترل اول‌شخص
let world = null;
let state = null;
let phase = 'menu'; // menu | prep | running | report
let sim = null;
let story = { weather: WEATHERS.sun, event: null };
let playerNearDoor = false;
let perfMon = null; // کیفیت تطبیقی رندر (روانی روی گوشی ضعیف)
let lastVibe = 0; // جلوگیری از لرزش‌های پشت‌سرهم
const clock = new THREE.Clock();

init();

function init() {
  // ۱) اول رابط کاربری — حتی اگر موتور سه‌بعدی بمیرد، دکمه‌ها کار می‌کنند
  ui.initUI({
    startNew,
    continueGame,
    restart,
    buy,
    fillShelf,
    setPrice,
    startDay,
    nextDay,
    resetView,
    showInfo,
    toggleSound,
    toggleFullscreen: toggleFs,
    refreshSupplier: () => state && ui.refreshSupplier(state),
    refreshPricing: () => state && ui.refreshPricing(state),
  });
  ui.showContinue(hasSave());
  window.addEventListener('resize', onResize);
  // چرخش گوشی و تغییر orientation
  window.addEventListener('orientationchange', onOrientationChanged);
  // Screen Orientation API تغییر جهت
  if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', onOrientationChanged);
  }
  // جهتِ منطقیِ صفحه عوض شد (قفلِ جهت یا چرخشِ CSS) → رندر را اندازه بزن
  window.addEventListener(ORIENTATION_EVENT, onOrientationChanged);
  // تمام‌صفحه تغییر کرد → رندر و FOV را به‌روز کن
  onFullscreenChange(() => {
    setTimeout(() => {
      onResize();
      // روی موبایل بعد از fullscreen، آدرس‌بار مخفی می‌شود و vh عوض می‌شود
      setTimeout(onResize, 200);
    }, 80);
  });

  // ۲) موتور سه‌بعدی (اختیاری — خطایش بازی را متوقف نمی‌کند)
  initEngine();

  registerServiceWorker();
  animate();

  // نشانهٔ «بازی بالا آمد» برای watchdog در index.html
  window.__MG_READY__ = true;

  // اگر صفحه از اول تمام‌صفحه باز شده (مثلاً reload داخل تمام‌صفحه)،
  // همان قانون «تمام‌صفحه = افقی» را برقرار کن.
  // 🔎 کلیدِ ?force-landscape=1 هم همان چرخشِ CSSِ آیفون را (برای
  //    اشکال‌زدایی) روی هر دستگاهی — از جمله دسکتاپ — روشن می‌کند.
  if (isFullscreen() || debugForceLandscape()) {
    applyLandscape().catch(() => {});
    setTimeout(onResize, 60);
  }
}

/**
 * چرخش گوشی / تغییر جهت منطقی صفحه.
 * اگر کاربر گوشی را «واقعاً» افقی کرده باشد، چرخشِ CSS باید برداشته
 * شود (وگرنه تصویر دو بار می‌چرخد)؛ بعد اندازهٔ رندر به‌روز می‌شود.
 */
function onOrientationChanged() {
  try {
    if (refreshForcedLandscape()) {
      // چرخشِ CSS برداشته شد → کمی صبر کن تا ابعاد واقعی بنشیند
      setTimeout(onResize, 60);
    }
    if (isFullscreen() && !isForcedLandscape()) {
      // در تمام‌صفحه هنوز عمودی‌ایم؟ یک بار دیگر افقی را تلاش کن
      applyLandscape().catch(() => {});
    }
  } catch (_) {}
  // تاخیر کوتاه تا ابعاد جدید اعمال شود
  onResize();
  setTimeout(onResize, 120);
  setTimeout(onResize, 400);
}

/**
 * تغییر حالت تمام‌صفحه — نسخهٔ جدید با پشتیبانی کامل موبایل.
 *
 * ⛶ قانونِ این نسخه: **تمام‌صفحه = افقی**.
 *   روی اندروید: تمام‌صفحهٔ واقعی + قفلِ جهت روی landscape
 *   روی iOS جدید (16.4+): تمام‌صفحه + قفلِ جهت (اگر مرورگر بدهد)
 *   روی iOS قدیم/سافاری: pseudo-fullscreen + چرخشِ ۹۰ درجه با CSS
 *   روی دسکتاپ: فقط تمام‌صفحه (جهت دست‌نخورده)
 */
async function toggleFs() {
  try {
    const r = await toggleFullscreenAsync();
    if (r.ok) {
      sfx.click();
      if (r.action === 'enter') {
        // حالا جهت را افقی کن و اندازهٔ رندر را با «ابعاد منطقی» تازه کن
        const o = await applyLandscape().catch(() => ({ ok: false, mode: 'unsupported' }));
        onResize();
        setTimeout(onResize, 120);
        setTimeout(onResize, 420);
        if (r.reason === 'pseudo' && o.mode !== 'lock') {
          ui.toast(
            o.mode === 'css'
              ? '⛶ تمام‌صفحه شد و صفحه افقی چرخید — برای تجربهٔ بهتر بازی را نصب کن'
              : '⛶ حالت تمام‌صفحهٔ شبیه‌سازی فعال شد — گوشی را افقی بگیر',
            'info',
            3800
          );
        } else if (o.mode === 'css') {
          ui.toast('⛶ تمام‌صفحه + افقی شد (چرخش با خودِ بازی)', 'info', 2600);
        } else if (o.mode === 'lock') {
          ui.toast('⛶ تمام‌صفحه + افقی شد', 'info', 2200);
        } else {
          ui.toast('⛶ تمام‌صفحه فعال شد', 'info', 2000);
        }
      } else {
        await releaseLandscape().catch(() => {});
        onResize();
        setTimeout(onResize, 120);
        setTimeout(onResize, 400);
        ui.toast('↩ از تمام‌صفحه خارج شدی', 'info', 1800);
      }
    } else {
      // واقعاً پشتیبانی نمی‌شود
      ui.toast(
        '⛶ مرورگرت تمام‌صفحه را مستقیم نمی‌دهد — روی اندروید از منوی مرورگر «تمام‌صفحه» را بزن، روی آیفون بازی را به صفحهٔ اصلی اضافه کن (Share → Add to Home Screen)',
        'warn',
        5200
      );
    }
  } catch (e) {
    console.warn('fullscreen toggle failed', e);
    ui.toast('⛶ خطا در تمام‌صفحه — دوباره امتحان کن', 'warn', 3000);
  }
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

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe0f2);
    scene.fog = new THREE.Fog(0xcfe8f7, 30, 60);

    // دوربین اول‌شخص: میدان دید پهن، نزدیکِ نزدیک (قفسه‌ها را می‌شود بویید!)
    // و دورِ کوتاه‌تر — با near بزرگ‌تر و far کوتاه‌تر، دقت بافر عمق چند برابر
    // می‌شود و زد-فایتینگِ بافت‌ها از بین می‌رود.
    camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 130);

    // نورها به دنیا وصل می‌شوند تا چرخهٔ شبانه‌روز (sky.js) بتواند
    // شدت و رنگ‌شان را ساعت به ساعت عوض کند
    world = createWorld(scene);
    world.lights = buildLights(scene);
    world.setDoor(false);

    // کنترل اول‌شخص: WASD/جوی‌استیک، نگاه با ماوس/لمس، کراس‌هیر و تعامل
    fps = new FirstPerson({
      camera,
      canvas: renderer.domElement,
      world,
      isBlocked: () => !state || phase === 'menu' || ui.isBlocking(),
      onInteract: handleInteract,
      formatAim: aimHintText,
    });
    // FOV اولیه بر اساس جهت‌گیری فعلی صفحه (در حالت عمودی پهن‌تر)
    fps.setAspect(camera.aspect);

    // بدنِ بازیکن برای مشتری‌ها هم وجود دارد: دورت می‌چرخند، ازت رد نمی‌شوند
    world.playerObstacle = { pos: fps.pos, radius: PLAYER_RADIUS, active: false };

    // کیفیت تطبیقی: اگر فریم‌ها سنگین شدند، رزولوشن رندر خودکار کم
    // می‌شود (تا ۶۰٪) و وقتی صحنه سبک شد برمی‌گردد — بازی هیچ‌وقت
    // نمی‌پرد و روی گوشی ضعیف هم لغزنده می‌ماند.
    perfMon = new PerfMonitor({
      baseRatio: Math.min(window.devicePixelRatio || 1, 2),
      onChange: (r) => {
        if (renderer) {
          renderer.setPixelRatio(r.ratio);
          if (r.firstDown) ui.toast('⚡ حالت روان فعال شد تا بازی لغزنده بماند', 'info', 2600);
        }
      },
    });
    return true;
  } catch (err) {
    // هر خطایی اینجا افتاد: رندر را خاموش کن ولی بازی را نگه دار
    renderer = null;
    scene = null;
    camera = null;
    fps = null;
    perfMon = null;
    world = createHeadlessWorld();
    console.warn('[market-game] موتور سه‌بعدی بالا نیامد — حالت بدون گرافیک فعال شد:', err);
    ui.showEngineError(err);
    return false;
  }
}

// ---------- تعامل اول‌شخص (نگاه به قفسه/صندوق + E / ضربه) ----------
function handleInteract(aim) {
  if (!state || !aim) return;
  if (phase === 'running') {
    ui.toast('🛍️ الان فروشگاه باز است — بعد از پایان روز تنظیمش می‌کنی', 'info');
    return;
  }
  if (aim.type === 'shelf') {
    ui.openPricingPanel(state);
    ui.flashNews('🏷️ قیمت را عوض کن — مشتری‌ها می‌بینندش');
  } else if (aim.type === 'register') {
    showInfo();
  }
  sfx.click();
}

/** متن برچسب کنار کراس‌هیر بر اساس چیزی که به آن نگاه می‌کنی */
function aimHintText(aim) {
  if (!aim || !state) return '';
  const key = fps && fps.touchMode ? '👆 ضربه' : 'E';
  if (aim.type === 'shelf') {
    const p = PRODUCTS.find((x) => x.id === aim.id);
    if (!p) return '';
    const stock = state.inventory[p.id] || 0;
    return `${p.emoji} ${p.name} · ${fa(state.salePrice[p.id])} $ · موجودی ${fa(stock)} — ${key}: قیمت‌گذاری`;
  }
  return `🧾 صندوق — ${key}: فروشگاه من`;
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
  // روی موبایل، window.innerHeight بعد از مخفی شدن آدرس‌بار تغییر می‌کند
  // (از visualViewport اگر موجود باشد استفاده می‌شود — دقیق‌تر) و در حالتِ
  // «افقیِ اجباری» عرض/ارتفاعِ منطقی جابه‌جا می‌شوند، چون چرخشِ CSS مقدارِ
  // innerWidth/innerHeight را عوض نمی‌کند.
  const size = getViewportSize();
  let w = size.w || window.innerWidth;
  let h = size.h || window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  // چرخش گوشی/بازشدن پنجره → FOV پایه به‌روز می‌شود (حالت عمودی = دید پهن‌تر)
  if (fps) fps.setAspect(camera.aspect);
}

// ---------- داستان روز ----------
/** اگر داستان امروز چیده نشده، بچین (هوا، رویداد، مأموریت) */
function ensureDayStory(force = false) {
  if (!state) return story;
  if (!force && state.storyDay === state.day && state.quest) {
    story = { weather: WEATHERS[state.weather] || WEATHERS.sun, event: story.event };
    // 🐛 باگ: موقع «ادامهٔ بازی»، هوا فقط در داستان بود ولی صحنه هرگز
    // setWeather نمی‌گرفت — باران/برفِ روزِ ذخیره‌شده دیده نمی‌شد.
    if (world && world.setWeather) world.setWeather(story.weather.id);
    return story;
  }
  const weather = rollWeather(state.day);
  const event = rollEvent(state.day);
  applyDay(state, state.day, event, weather);
  state.quest = rollQuest(state.day);
  state.storyDay = state.day;
  story = { weather, event };
  if (world) world.setWeather(weather.id);
  return story;
}

// ---------- شروع بازی ----------
function enterGame(msg) {
  ui.hideStartScreen(); // صفحهٔ شروع کنار می‌رود تا بازی دیده شود
  ui.showHud();
  ensureDayStory();
  if (world && world.setSky) world.setSky(0, story.weather ? story.weather.id : 'sun'); // صبح
  ui.setHud(state);
  ui.setSound(state.sound !== false);
  sfx.setMuted(state.sound === false);
  sfx.setMusic(state.sound !== false); // موسیقی محیطی با وضعیت صدا سینک می‌ماند
  ui.setQuest(state.quest, state.dayStats);
  refreshShelves(world, state.inventory);
  refreshTags(world, state.salePrice, state.market);
  if (world && world.drawOpenSign) world.drawOpenSign(true);
  phase = 'prep';
  if (world.playerObstacle) world.playerObstacle.active = true;
  cameraIntro();
  if (msg) ui.toast(msg, 'info', 3600);
  ui.flashNews(liveLine('welcome'));
  // بعد از ورود به بازی، سایز را یک بار دیگر چک کن (مخصوص موبایل)
  setTimeout(onResize, 150);
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
  // خرید در «prep» (قبل از باز شدن) و «report» (بعد از بستن صندوق —
  // بارگیریِ شبانه) ممکن است؛ فقط وسطِ روز نه.
  if (!state || (phase !== 'prep' && phase !== 'report') || n < 1) return false;
  const p = PRODUCTS.find((x) => x.id === id);
  const cost = state.market[id] * n;
  if (state.money < cost) {
    ui.toast('💸 پول کافی نیست!', 'warn');
    sfx.error();
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

/**
 * «پر کردن قفسه» — تا سقف نمایش قفسه (۱۲ عدد) با یک ضربه جنس بخر.
 * اگر پول کم بود، هرچقدر که شد می‌خرد و می‌گوید.
 * @returns {boolean} آیا خریدی انجام شد؟
 */
function fillShelf(id) {
  if (!state || (phase !== 'prep' && phase !== 'report')) return false;
  const cap = GAME.maxDisplayPerShelf;
  const want = cap - (state.inventory[id] || 0);
  const p = PRODUCTS.find((x) => x.id === id);
  if (want <= 0) {
    ui.toast(`${p.emoji} قفسهٔ ${p.name} همین حالا پر است`, 'info');
    return false;
  }
  const affordable = Math.floor(state.money / state.market[id]);
  const n = Math.min(want, affordable);
  if (n < 1) {
    ui.toast(`💸 پولِ حتی یک «${p.name}» هم کافی نیست`, 'warn');
    sfx.error();
    return false;
  }
  const ok = buy(id, n);
  if (ok && n < want) {
    ui.toast(`🧾 فقط ${fa(n)} از ${fa(want)} عدد شد — پول کم بود`, 'warn', 3200);
  }
  return ok;
}

// ---------- قیمت‌گذاری ----------
function setPrice(id, delta) {
  if (!state || phase === 'running') return;
  const next = Math.min(GAME.price.max, Math.max(GAME.price.min, state.salePrice[id] + delta));
  if (next === state.salePrice[id]) return;
  state.salePrice[id] = next;
  saveGame(state);
  refreshTags(world, state.salePrice, state.market); // تگ روی قفسه هم به‌روز می‌شود
  ui.refreshPricing(state);
  sfx.click();
}

function toggleSound() {
  if (!state) return;
  state.sound = state.sound === false;
  const on = state.sound !== false;
  sfx.setMuted(!on); // خاموشیِ صدا = mute
  sfx.setMusic(on); // موسیقی هم با همان دکمهٔ صدا روشن/خاموش می‌شود
  ui.setSound(state.sound);
  saveGame(state);
}

function showInfo() {
  if (!state) return;
  ui.showStoreInfo(state, { tips: buildTips(), quality: perfMon ? perfMon.label : '' });
}

/** راهنمایی‌های ساده و واقعی بر اساس وضعیت فعلی فروشگاه */
function buildTips() {
  const tips = [];
  const empty = PRODUCTS.filter((p) => (state.inventory[p.id] || 0) === 0);
  if (empty.length) tips.push(`📦 قفسهٔ ${empty.map((p) => p.name).join('، ')} خالی است — از تأمین‌کننده بخر.`);
  const pricey = PRODUCTS.filter((p) => state.salePrice[p.id] - state.market[p.id] > 3);
  if (pricey.length) tips.push(`🏷️ قیمت ${pricey.map((p) => p.name).join('، ')} از بازار خیلی بالاتر است؛ مشتری نمی‌خرد.`);
  if (state.money < 20) tips.push('💸 سرمایه‌ات کم است؛ اول ارزان‌ها را بفروش تا پول برگردد.');
  if (!tips.length) tips.push('👌 همه‌چیز مرتب است — فقط روز را شروع کن و بفروش!');
  return tips;
}

// ---------- شروع روز (ورود مشتری‌ها) ----------
function startDay() {
  if (!state || phase !== 'prep') return;
  const totalInv = Object.values(state.inventory).reduce((a, b) => a + b, 0);
  const go = () => {
    phase = 'running';
    ui.closeSheets();
    ui.setRunning(true);
    ensureDayStory();
    ui.setQuest(state.quest, state.dayStats);
    ui.showDayIntro({
      day: state.day,
      weather: story.weather,
      event: story.event,
      quest: state.quest,
    });
    sfx.dayStart();
    if (world && world.setDoor) world.setDoor(false);
    sim = new DaySimulation(state, world, {
      onSale: (items, rev) => {
        ui.setHud(state);
        ui.bumpMoney(rev);
        if (renderer) {
          floatText(world, `+${Math.round(rev)} $`, REGISTER_POS, { color: '#ffe066' });
        }
        ui.flashNews(liveLine('sale', { n: items, rev: Math.round(rev) }));
        // بازخورد لمسی خیلی ظریف هنگام فروش (موبایل) — حداکثر هر ۲٫۵ ثانیه
        if (typeof navigator !== 'undefined' && navigator.vibrate && state.sound !== false) {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (now - lastVibe > 2500) {
            lastVibe = now;
            try {
              navigator.vibrate(12);
            } catch (_) {}
          }
        }
      },
      onEnter: (c) => {
        if (sim && sim.stats.customers % 2 === 1) ui.flashNews(liveLine('enter'));
        if (c && c.kind === 'kid' && renderer) sparkle(world, c.group, 0x9ad0ff, 4, 0.2);
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
  const s = state.dayStats;
  const profit = s.revenue - s.expenses;
  const earnedXp = Math.round(s.itemsSold * 1 + s.buyers * 1.5 + Math.max(0, profit) / 10);
  const questDone = evaluateQuest(state.quest, s);
  const beforeLevel = levelInfo(state.xp || 0).level;
  state.xp = (state.xp || 0) + earnedXp + (questDone && state.quest ? state.quest.xp : 0);
  const afterLevel = levelInfo(state.xp).level;
  const isBest = profit > (state.best || 0);
  state.best = Math.max(state.best || 0, profit);
  state.totalRevenue = (state.totalRevenue || 0) + s.revenue;
  state.history = (state.history || []).concat([
    { day: state.day, revenue: s.revenue, expenses: s.expenses, profit, customers: s.customers, buyers: s.buyers, itemsSold: s.itemsSold },
  ]).slice(-14);
  state.reportedExpenses = s.expenses;
  sim = null;
  ui.setRunning(false);
  ui.setQuest(state.quest, s);
  if (world && world.drawRegister) world.drawRegister(['روز تمام', 'صندوق بسته']);
  saveGame(state);
  sfx.dayEnd();

  if (isBest && s.revenue > 0) {
    setTimeout(() => ui.toast(`🏆 بهترین سود روزت تا حالا! ${fa(profit)} $`, 'info', 4200), 700);
    sfx.cheer();
  }
  if (afterLevel > beforeLevel) {
    setTimeout(() => {
      ui.toast(`⭐ سطح ${fa(afterLevel)} شدی — ${levelTitle(afterLevel)}!`, 'info', 4600);
      ui.flashNews(`⭐ سطح جدید: ${fa(afterLevel)} — ${levelTitle(afterLevel)}`);
      sfx.cheer();
    }, 1300);
  }
  setTimeout(() => {
    if (phase !== 'report') return;
    ui.showReport(state, {
      summary: daySummaryLine(s, state.money),
      questText: questResultText(state.quest, s),
      xp: earnedXp,
    });
    const q = questResultText(state.quest, s);
    if (q) setTimeout(() => ui.toast(q, 'info', 4000), 600);
  }, 520);
}

// ---------- روز بعد: داستان و قیمت‌های تازه ----------
function nextDay() {
  if (!state || phase !== 'report') return;
  state.day += 1;
  const prev = state.market;
  state.market = rollMarketPrices(state.day, prev);
  const carried = Math.max(0, state.dayStats.expenses - (state.reportedExpenses ?? state.dayStats.expenses));
  state.dayStats = freshDayStats();
  state.dayStats.expenses = carried;
  delete state.reportedExpenses;
  phase = 'prep';

  // داستان روز نو
  story = { weather: WEATHERS.sun, event: null };
  ensureDayStory(true);
  state.quest.done = false;
  saveGame(state);
  ui.closeSheets();
  ui.setHud(state);
  ui.setQuest(state.quest, state.dayStats);
  refreshTags(world, state.salePrice, state.market);
  ui.showDayIntro({ day: state.day, weather: story.weather, event: story.event, quest: state.quest });

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
  sfx.dayStart();
}

function closeSheets() {
  ui.closeSheets();
}

// ---------- دوربین ----------
/** اینتروی سینمایی ورود: از پیاده‌رو، از درِ بازشو، تا چشمِ بازیکن */
function cameraIntro() {
  if (fps) fps.playIntro();
}

function resetView() {
  if (fps && fps.mode !== 'intro') fps.resetToSpawn();
  sfx.click();
}

// ---------- حلقهٔ بازی ----------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const blocked = !state || phase === 'menu' || ui.isBlocking();
  if (fps) fps.update(dt, blocked);

  // درِ شیشه‌ای: برای مشتری‌ها (سیمولیشن) و برای خودِ بازیکن باز می‌شود
  if (world && !world.headless && world.setDoor) {
    let near = false;
    if (fps && fps.mode === 'play' && state && !blocked) {
      // آستانهٔ z کوچک‌تر از مشتری‌هاست تا نقطهٔ شروعِ بازیکن (۱.۲ متریِ در)
      // ناخواسته در را باز نگه ندارد.
      near = Math.abs(fps.pos.x - DOOR.x) < 1.3 && Math.abs(fps.pos.z - 2.15) < 1.12;
    }
    if (near !== playerNearDoor) {
      playerNearDoor = near;
      if (near && state) sfx.door();
    }
    if (!fps || fps.mode !== 'intro') world.setDoor(!!(world.doorWanted || playerNearDoor));
  }

  if (world) world.update(dt);
  // چرخهٔ شبانه‌روز: پیشرفتِ ساعتِ فروشگاه (۹→۲۱) آسمان و نورها را
  // عوض می‌کند — صبح آبی، عصر طلایی، شب سرمه‌ای با چراغ‌های روشن‌تر.
  if (world && world.setSky) {
    const dayK = sim ? clamp01(sim.time / sim.expected) : 0;
    world.setSky(dayK, story.weather ? story.weather.id : 'sun');
  }
  // کیفیت تطبیقی رندر — با EMA فریم‌تایم تصمیم می‌گیرد
  if (perfMon) {
    perfMon.push(dt);
    perfMon.tick(typeof performance !== 'undefined' ? performance.now() : 0);
  }
  if (sim) {
    sim.update(dt);
    if (sim) {
      ui.setProgress(sim.spawned, sim.total);
      ui.setClock(sim.clockText, story.weather ? story.weather.emoji : '☀️');
      ui.setLive(sim.active.length, sim.queue.length);
      ui.setQuest(state.quest, {
        itemsSold: sim.stats.itemsSold,
        buyers: sim.stats.buyers,
        revenue: sim.stats.revenue,
        customers: sim.stats.customers,
      });
    }
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}
