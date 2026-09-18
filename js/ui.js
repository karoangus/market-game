// =============================================================
//  ui.js — رابط کاربری: صفحهٔ شروع، HUD، کارت داستان روز،
//  پنل‌های تأمین‌کننده / قیمت‌گذاری / فروشگاه / گزارش، توست‌ها
// =============================================================
import { PRODUCTS, GAME } from './config.js';
import { demandInfo } from './economy.js';
import { levelInfo, levelTitle, questProgress, QUEST_TYPES, WEATHERS } from './story.js';
import { fa } from './util.js';
import { isFullscreen, onFullscreenChange } from './fullscreen.js';

let cb = {};
const $ = (id) => document.getElementById(id);
const qty = {};

export const money = (n) => `${fa(n)} $`;
const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

// ---------- پنل‌ها ----------
let openId = null;
let lockedSheet = null;

function openSheet(id) {
  // با بازشدن هر پنل، نشانگر ماوس آزاد شود تا بازیکن بتواند پنل را لمس/کلیک کند
  if (typeof document !== 'undefined' && document.exitPointerLock && document.pointerLockElement)
    document.exitPointerLock();
  if (openId) $(openId).classList.remove('open');
  const el = $(id);
  el.classList.add('open');
  el.scrollTop = 0;
  const bd = $('sheet-backdrop');
  bd.classList.add('show');
  bd.style.pointerEvents = 'auto';
  openId = id;
}

function closeSheet(force = false) {
  if (openId) $(openId).classList.remove('open');
  openId = null;
  const bd = $('sheet-backdrop');
  bd.classList.remove('show');
  bd.style.pointerEvents = 'none';
  if (!force && lockedSheet) setTimeout(() => openSheet(lockedSheet), 260);
}

export function lockSheet(id) {
  lockedSheet = id;
}
export function unlockSheet() {
  lockedSheet = null;
}
export function closeSheets() {
  unlockSheet();
  closeSheet(true);
}

/**
 * آیا چیزی روی صفحه باز است که باید ورودیِ اول‌شخص را بگیرد؟
 * (پنل‌ها، گزارشِ قفل‌شده، کارت شروع روز، جعبهٔ تأیید، صفحهٔ شروع)
 * main.js نتیجه‌اش را به کنترل اول‌شخص می‌دهد تا بازیکن وسطِ
 * خواندن گزارش به‌ناگاه به دیوار نکوبد.
 */
export function isBlocking() {
  if (openId || lockedSheet) return true;
  const di = $('day-intro');
  if (di && !di.classList.contains('hidden')) return true;
  const cf = $('confirm-box');
  if (cf && !cf.classList.contains('hidden')) return true;
  const ss = $('start-screen');
  if (ss && !ss.classList.contains('hidden')) return true;
  const be = $('boot-error');
  if (be && !be.classList.contains('hidden')) return true;
  return false;
}

// ---------- HUD ----------
export function showHud() {
  $('hud').classList.remove('hidden');
}
export function hideHud() {
  $('hud').classList.add('hidden');
}
/** برداشتن صفحهٔ شروع — بدون این، صفحهٔ شروع روی بازی می‌ماند! */
export function hideStartScreen() {
  const el = $('start-screen');
  if (el) el.classList.add('hidden');
}

export function setHud(state) {
  $('hud-day').textContent = `📅 روز ${fa(state.day)}`;
  $('money-val').textContent = money(state.money);
  const info = levelInfo(state.xp || 0);
  $('hud-level').textContent = `⭐ سطح ${fa(info.level)}`;
}

export function bumpMoney(rev) {
  const pill = $('hud-money');
  const el = document.createElement('span');
  el.className = 'hud-float';
  el.textContent = `+${fa(rev)}`;
  pill.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

/** ساعت فروشگاه + هوا */
export function setClock(text, weatherEmoji) {
  const el = $('hud-weather');
  if (el) el.textContent = `${weatherEmoji} ${fa(text)}`;
}

/** چند مشتری داخل فروشگاه و چند نفر در صف */
export function setLive(inside, queue) {
  const el = $('hud-live');
  if (!el) return;
  el.textContent = queue > 0 ? `🛍️ ${fa(inside)} نفر داخل · ${fa(queue)} نفر در صف` : `🛍️ ${fa(inside)} نفر داخل فروشگاه`;
}

export function setRunning(on) {
  for (const id of ['btn-supplier', 'btn-pricing', 'btn-info']) $(id).classList.toggle('locked', on);
  const btn = $('btn-start-day');
  btn.classList.toggle('locked', on);
  btn.querySelector('.b-emoji').textContent = on ? '🚶' : '▶️';
  btn.querySelector('span:last-child').textContent = on ? 'فروش در حال انجام' : 'شروع روز';
  $('day-progress').classList.toggle('hidden', !on);
}

export function setProgress(done, total) {
  $('progress-label').textContent = `مشتری‌ها: ${fa(done)} از ${fa(total)}`;
  $('progress-fill').style.width = pct(done / Math.max(1, total));
}

/** نوار خبر کوتاه (پایین HUD) */
export function flashNews(text) {
  const el = $('hud-news');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.remove('pop');
  void el.offsetWidth; // ری‌فلو تا انیمیشن دوباره اجرا شود
  el.classList.add('pop');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 4200);
}

/** چیپ مأموریت امروز */
export function setQuest(quest, stats) {
  const el = $('hud-quest');
  if (!el) return;
  if (!quest) {
    el.classList.add('hidden');
    return;
  }
  const p = questProgress(quest, stats || {});
  const done = p >= quest.target;
  el.classList.remove('hidden');
  el.classList.toggle('done', done);
  el.innerHTML = `<span class="q-emoji">${quest.emoji}</span>
    <span class="q-text">${quest.label}</span>
    <b class="q-count">${fa(p)}/${fa(quest.target)}</b>
    ${done ? '<span class="q-done">✔</span>' : ''}`;
}

/** صدا روشن/خاموش */
export function setSound(on) {
  const b = $('btn-sound');
  if (b) b.textContent = on ? '🔊' : '🔇';
}

// ---------- دکمهٔ تمام‌صفحه ----------
/** حالتِ «روشن» دکمهٔ تمام‌صفحه را با وضعیت واقعی مرورگر هم‌گام می‌کند */
function syncFullscreenUi() {
  const on = isFullscreen();
  for (const id of ['btn-fullscreen', 'btn-fs-start']) {
    const b = $(id);
    if (b) {
      b.classList.toggle('active', on);
      // عنوان دکمه را هم عوض کن
      if (on) {
        b.title = 'خروج از تمام‌صفحه (و برگشت به جهتِ آزاد)';
        if (b.id === 'btn-fs-start') b.textContent = '↩ خروج از تمام‌صفحه';
        if (b.id === 'btn-fullscreen') b.textContent = '⛶';
      } else {
        // ⛶ تمام‌صفحه روی موبایل یعنی «افقی» — عنوان دکمه هم همین را بگوید
        b.title = 'تمام‌صفحه و افقی‌کردنِ صفحه';
        if (b.id === 'btn-fs-start') b.textContent = '⛶ تمام‌صفحهٔ افقی';
        if (b.id === 'btn-fullscreen') b.textContent = '⛶';
      }
    }
  }
}

/**
 * اتصال دکمهٔ تمام‌صفحه (HUD + صفحهٔ شروع) و گوش‌دادن به رویداد تغییر
 * آن. در مرورگرهای بدون API، دکمه همچنان کار می‌کند — hook اصلی
 * (cb.toggleFullscreen) پیام راهنما نشان می‌دهد.
 */
export function initFullscreenButton() {
  // گوش دادن به همهٔ رویدادهای تغییر fullscreen
  onFullscreenChange(() => {
    syncFullscreenUi();
  });
  // همچنین برای pseudo-fullscreen یک MutationObserver
  try {
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      const obs = new MutationObserver(() => syncFullscreenUi());
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  } catch (_) {}
  syncFullscreenUi();
}

// ---------- کارت داستان روز ----------
let introTimer = null;
export function showDayIntro({ day, weather, event, quest, note }) {
  const box = $('day-intro');
  if (!box) return;
  const w = weather || WEATHERS.sun;
  $('intro-day').textContent = `📅 روز ${fa(day)}`;
  $('intro-weather').textContent = `${w.emoji} ${w.name}`;
  $('intro-note').textContent = (event && event.desc) || w.note || note || '';
  const ev = $('intro-event');
  if (event) {
    ev.classList.remove('hidden');
    ev.innerHTML = `<b>${event.emoji} ${event.name}</b><span>${event.desc}</span>`;
  } else {
    ev.classList.add('hidden');
  }
  const q = $('intro-quest');
  if (quest) {
    q.classList.remove('hidden');
    q.innerHTML = `<b>${quest.emoji} مأموریت امروز</b><span>${quest.label} — ${fa(quest.target)} ${quest.unit} (+${fa(quest.xp)} تجربه)</span>`;
  } else {
    q.classList.add('hidden');
  }
  box.classList.remove('hidden');
  box.classList.remove('show');
  void box.offsetWidth;
  box.classList.add('show');
  clearTimeout(introTimer);
  introTimer = setTimeout(() => hideDayIntro(), 5200);
}

export function hideDayIntro() {
  const box = $('day-intro');
  if (!box || box.classList.contains('hidden')) return;
  box.classList.remove('show');
  clearTimeout(introTimer);
  setTimeout(() => box.classList.add('hidden'), 320);
}

// ---------- بازکردن پنل‌ها (برای تعامل اول‌شخص و دکمه‌ها) ----------
export function openPricingPanel(state) {
  refreshPricing(state);
  openSheet('sheet-pricing');
}

export function openSupplierPanel(state) {
  refreshSupplier(state);
  openSheet('sheet-supplier');
}

// ---------- پنل تأمین‌کننده ----------
export function refreshSupplier(state) {
  $('supplier-balance').innerHTML = `سرمایه: <b>${money(state.money)}</b>`;
  $('supplier-rows').innerHTML = PRODUCTS.map((p) => {
    const q = qty[p.id] || 1;
    const cost = q * state.market[p.id];
    const have = state.inventory[p.id] || 0;
    return `
    <div class="row">
      <div class="row-icon">${p.emoji}</div>
      <div class="row-info">
        <div class="row-line">
          <b>${p.name}</b>
          <small class="mkt">بازار امروز: ${fa(state.market[p.id])} $</small>
        </div>
        <small>هزینه: ${fa(cost)} $ · روی قفسه: ${fa(have)}</small>
      </div>
      <div class="row-ctrl">
        <button class="step" data-sup="step" data-id="${p.id}" data-d="-1">−</button>
        <span class="qty" id="qty-${p.id}">${fa(q)}</span>
        <button class="step" data-sup="step" data-id="${p.id}" data-d="1">+</button>
      </div>
      <button class="buy-btn" data-sup="buy" data-id="${p.id}">خرید</button>
    </div>`;
  }).join('');
}

// ---------- پنل قیمت‌گذاری ----------
export function refreshPricing(state) {
  $('pricing-rows').innerHTML = PRODUCTS.map((p) => {
    const market = state.market[p.id];
    const sell = state.salePrice[p.id];
    const profit = sell - market;
    const d = demandInfo(market, sell);
    return `
    <div class="row">
      <div class="row-icon">${p.emoji}</div>
      <div class="row-info">
        <div class="row-line">
          <b>${p.name}</b>
          <span class="demand ${d.cls}">تقاضا: ${d.label}</span>
        </div>
        <small>
          بازار: ${fa(market)} $ · روی قفسه: ${fa(state.inventory[p.id])} ·
          سود تکی: ${profit < 0 ? '−' : '+'}${fa(Math.abs(profit))} $
        </small>
      </div>
      <div class="row-ctrl">
        <button class="step" data-price="step" data-id="${p.id}" data-d="-${GAME.price.step}">−</button>
        <span class="qty">${fa(sell)} $</span>
        <button class="step" data-price="step" data-id="${p.id}" data-d="${GAME.price.step}">+</button>
      </div>
    </div>`;
  }).join('');
}

// ---------- پنل «فروشگاه من» ----------
export function showStoreInfo(state, ctx = {}) {
  const info = levelInfo(state.xp || 0);
  const quest = state.quest;
  const p = quest ? questProgress(quest, state.dayStats) : 0;
  const history = (state.history || []).slice(-7);
  const maxAbs = Math.max(10, ...history.map((h) => Math.abs(h.profit)));
  const tips = ctx.tips || [];
  $('info-body').innerHTML = `
    <div class="lvl-card">
      <div class="lvl-badge">⭐</div>
      <div class="lvl-info">
        <b>سطح ${fa(info.level)} — ${levelTitle(info.level)}</b>
        <small>${fa(info.xp)} تجربه · ${fa(Math.max(0, info.next - info.xp))} تا سطح بعد</small>
        <div class="lvl-track"><div class="lvl-fill" style="width:${pct(info.progress)}"></div></div>
      </div>
    </div>
    ${
      quest
        ? `<div class="info-box">
             <div class="ib-title">${quest.emoji} مأموریت امروز</div>
             <div class="ib-line">${quest.label}: ${fa(p)} از ${fa(quest.target)} ${quest.unit}
             ${p >= quest.target ? '<b class="pos">✔ انجام شد</b>' : ''}</div>
             <div class="lvl-track small"><div class="lvl-fill" style="width:${pct(p / quest.target)}\"></div></div>
             <small>پاداش: ${fa(quest.xp)} تجربه</small>
           </div>`
        : ''
    }
    <div class="info-box">
      <div class="ib-title">📈 کارنامهٔ روزهای اخیر</div>
      ${
        history.length
          ? `<div class="chart">${history
              .map(
                (h) => `<div class="bar-wrap" title="روز ${h.day}">
                  <div class="bar ${h.profit >= 0 ? 'pos' : 'neg'}" style="height:${Math.max(
                  6,
                  (Math.abs(h.profit) / maxAbs) * 100
                )}%\"></div>
                  <span>${fa(h.day)}</span>
                </div>`
              )
              .join('')}</div>`
          : '<div class="ib-line">هنوز روزی ثبت نشده — اولین روزت را بفروش!</div>'
      }
    </div>
    <div class="info-box">
      <div class="ib-title">📊 آمار کلی</div>
      <div class="rep-grid mini">
        <div class="rep-item"><small>بهترین سود روز</small><b>${money(state.best || 0)}</b></div>
        <div class="rep-item"><small>درآمد کل</small><b>${money(state.totalRevenue || 0)}</b></div>
        <div class="rep-item"><small>سرمایهٔ فعلی</small><b>${money(state.money)}</b></div>
        <div class="rep-item"><small>روز فعلی</small><b>${fa(state.day)}</b></div>
      </div>
    </div>
    ${
      tips.length
        ? `<div class="info-box\"><div class="ib-title">💡 راهنمایی مربی</div>${tips
            .map((t) => `<div class="ib-line">${t}</div>`)
            .join('')}</div>`
        : ''
    }
  `;
  openSheet('sheet-info');
}

// ---------- گزارش روز ----------
export function showReport(state, extra = {}) {
  const s = state.dayStats;
  const profit = s.revenue - s.expenses;
  const info = levelInfo(state.xp || 0);
  const quest = state.quest;
  const qp = quest ? questProgress(quest, s) : 0;
  const qDone = quest && qp >= quest.target;
  const history = (state.history || []).slice(-7);
  const maxAbs = Math.max(10, ...history.map((h) => Math.abs(h.profit)), Math.abs(profit));
  $('report-title').textContent = `📊 گزارش روز ${fa(state.day)}`;
  $('report-body').innerHTML = `
    <div class="report-grid">
      <div class="rep-item"><small>مشتری‌ها</small><b>${fa(s.customers)} نفر</b></div>
      <div class="rep-item"><small>خریدار</small><b>${fa(s.buyers)} نفر</b></div>
      <div class="rep-item"><small>فروش</small><b>${fa(s.itemsSold)} قلم</b></div>
      <div class="rep-item"><small>درآمد فروش</small><b>${money(s.revenue)}</b></div>
      <div class="rep-item"><small>هزینهٔ خرید امروز</small><b>${money(s.expenses)}</b></div>
      <div class="rep-item ${profit >= 0 ? 'pos' : 'neg'}"><small>سود خالص</small><b>${profit < 0 ? '−' : '+'}${fa(Math.abs(profit))} $</b></div>
    </div>

    ${
      quest
        ? `<div class="quest-result ${qDone ? 'pos' : 'neg'}">
             <b>${quest.emoji} ${quest.label}</b>
             <span>${fa(qp)}/${fa(quest.target)} ${quest.unit} ${qDone ? '— انجام شد! +' + fa(quest.xp) + ' تجربه' : '— ناتمام'}</span>
           </div>`
        : ''
    }

    <div class="rep-line">${extra.summary || ''}</div>

    <div class="rep-stock">
      ${PRODUCTS.map((p) => `<span class="stock-chip">${p.emoji} ${p.name}: ${fa(state.inventory[p.id])}</span>`).join('')}
    </div>

    ${
      history.length
        ? `<div class="chart small">${history
            .map(
              (h) => `<div class="bar-wrap" title="روز ${h.day}">
                <div class="bar ${h.profit >= 0 ? 'pos' : 'neg'}" style="height:${Math.max(
                6,
                (Math.abs(h.profit) / maxAbs) * 100
              )}%\"></div>
                <span>${fa(h.day)}</span></div>`
            )
            .join('')}</div>`
        : ''
    }

    <div class="xp-line">
      <span>⭐ سطح ${fa(info.level)} — ${levelTitle(info.level)}</span>
      <div class="lvl-track small"><div class="lvl-fill" style="width:${pct(info.progress)}\"></div></div>
    </div>

    <div class="rep-total">سرمایهٔ فعلی تو: <b>${money(state.money)}</b></div>
    <button class="cta" id="btn-next-day">🌅 روز بعد</button>
  `;
  $('btn-next-day').addEventListener('click', () => cb.nextDay());
  lockSheet('sheet-report');
  openSheet('sheet-report');
}

// ---------- توست ----------
export function toast(msg, type = 'info', ms = 2800) {
  const wrap = $('toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 320);
  }, ms);
}

// ---------- جعبهٔ تأیید ----------
export function confirmBox(msg, onYes) {
  $('confirm-msg').textContent = msg;
  cb._confirmYes = onYes;
  $('confirm-box').classList.remove('hidden');
}

// ---------- خطای موتور سه‌بعدی ----------
export function showEngineError(err) {
  if ($('engine-error')) return;
  const wrap = document.createElement('div');
  wrap.id = 'engine-error';
  wrap.className = 'engine-error';
  const title = document.createElement('b');
  title.textContent = '⚠️ گرافیک سه‌بعدی در دسترس نیست';
  const msg = document.createElement('p');
  msg.textContent =
    'مرورگرت WebGL را اجرا نکرد، پس فروشگاه رسم نمی‌شود — ولی بازی کامل کار می‌کند ' +
    '(خرید، قیمت‌گذاری، مشتری‌ها و گزارش). خطا: ' + (err && err.message ? err.message : err);
  const hint = document.createElement('small');
  hint.textContent =
    'راه‌حل: WebGL را در تنظیمات مرورگر فعال کن یا از آخرین نسخهٔ Chrome/Firefox/Safari استفاده کن.';
  const close = document.createElement('button');
  close.className = 'cta small ghost';
  close.textContent = 'باشه، ادامه می‌دهم';
  close.addEventListener('click', () => wrap.remove());
  const card = document.createElement('div');
  card.className = 'engine-error-card';
  card.append(title, msg, hint, close);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
}

// ---------- صفحهٔ شروع ----------
export function showContinue(has) {
  $('btn-continue').classList.toggle('hidden', !has);
  $('btn-restart').classList.toggle('hidden', !has);
}

// ---------- اتصال دکمه‌ها ----------
export function initUI(hooks) {
  cb = hooks;

  $('btn-new-game').addEventListener('click', () => cb.startNew());
  $('btn-continue').addEventListener('click', () => cb.continueGame());
  $('btn-restart').addEventListener('click', () => cb.restart());
  $('btn-supplier').addEventListener('click', () => {
    cb.refreshSupplier && cb.refreshSupplier();
    openSheet('sheet-supplier');
  });
  $('btn-pricing').addEventListener('click', () => {
    cb.refreshPricing && cb.refreshPricing();
    openSheet('sheet-pricing');
  });
  $('btn-info').addEventListener('click', () => cb.showInfo && cb.showInfo());
  $('hud-quest').addEventListener('click', () => cb.showInfo && cb.showInfo());
  $('btn-sound').addEventListener('click', () => cb.toggleSound && cb.toggleSound());
  $('btn-start-day').addEventListener('click', () => cb.startDay());
  $('btn-reset-view').addEventListener('click', () => cb.resetView());

  // تمام‌صفحه (هم روی HUD، هم دکمهٔ صفحهٔ شروع)
  for (const id of ['btn-fullscreen', 'btn-fs-start']) {
    const b = $(id);
    if (b) b.addEventListener('click', () => cb.toggleFullscreen && cb.toggleFullscreen());
  }
  initFullscreenButton();
  $('intro-close').addEventListener('click', () => hideDayIntro());
  $('day-intro').addEventListener('click', (e) => {
    if (e.target.id === 'day-intro') hideDayIntro();
  });

  document.querySelectorAll('.sheet-close').forEach((b) => b.addEventListener('click', () => closeSheet()));
  $('sheet-backdrop').addEventListener('click', () => closeSheet());

  // تأمین‌کننده (event delegation)
  $('supplier-rows').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.sup === 'step') {
      qty[id] = Math.min(99, Math.max(0, (qty[id] || 1) + Number(b.dataset.d)));
      const span = $(`qty-${id}`);
      if (span) span.textContent = fa(qty[id]);
      cb.refreshSupplier && cb.refreshSupplier();
    } else if (b.dataset.sup === 'buy') {
      const ok = cb.buy(id, qty[id] || 1);
      if (ok) {
        qty[id] = 1;
        cb.refreshSupplier && cb.refreshSupplier();
      }
    }
  });

  // قیمت‌گذاری
  $('pricing-rows').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.price !== 'step') return;
    cb.setPrice(b.dataset.id, Number(b.dataset.d));
  });

  // تأیید
  $('confirm-yes').addEventListener('click', () => {
    const f = cb._confirmYes;
    $('confirm-box').classList.add('hidden');
    if (f) f();
  });
  $('confirm-no').addEventListener('click', () => $('confirm-box').classList.add('hidden'));
}

export { QUEST_TYPES };
