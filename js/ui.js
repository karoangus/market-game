// =============================================================
//  ui.js — رابط کاربری: صفحهٔ شروع، HUD، پنل‌های تأمین‌کننده /
//  قیمت‌گذاری / گزارش، توست‌ها و جعبهٔ تأیید
// =============================================================
import { PRODUCTS, GAME } from './config.js';
import { demandInfo } from './economy.js';
import { fa } from './util.js';

let cb = {};
const $ = (id) => document.getElementById(id);
const qty = {};

export const money = (n) => `${fa(n)} $`;

// ---------- پنل‌ها ----------
let openId = null;
let lockedSheet = null; // پنلی که نمی‌شود با بستن از آن فرار کرد (گزارش)

function openSheet(id) {
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
  // اگر کاربر خواست پنل قفل‌شده (گزارش) را ببندد، دوباره بازش کن
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
}

export function bumpMoney(rev) {
  const pill = $('hud-money');
  const el = document.createElement('span');
  el.className = 'hud-float';
  el.textContent = `+${fa(rev)}`;
  pill.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

export function setRunning(on) {
  for (const id of ['btn-supplier', 'btn-pricing']) $(id).classList.toggle('locked', on);
  const btn = $('btn-start-day');
  btn.classList.toggle('locked', on);
  // نکته: $ یعنی getElementById — برای زیرعنصرها باید querySelector به کار رود
  btn.querySelector('.b-emoji').textContent = on ? '🚶' : '▶️';
  btn.querySelector('span:last-child').textContent = on ? 'فروش در حال انجام' : 'شروع روز';
  $('day-progress').classList.toggle('hidden', !on);
}

export function setProgress(done, total) {
  $('progress-label').textContent = `مشتری‌ها: ${fa(done)} از ${fa(total)}`;
  $('progress-fill').style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
}

// ---------- پنل تأمین‌کننده ----------
export function refreshSupplier(state) {
  $('supplier-balance').innerHTML = `سرمایه: <b>${money(state.money)}</b>`;
  $('supplier-rows').innerHTML = PRODUCTS.map((p) => {
    const q = qty[p.id] || 1;
    const cost = q * state.market[p.id];
    return `
    <div class="row">
      <div class="row-icon">${p.emoji}</div>
      <div class="row-info">
        <div class="row-line">
          <b>${p.name}</b>
          <small class="mkt">بازار امروز: ${fa(state.market[p.id])} $</small>
        </div>
        <small>هزینه: ${fa(cost)} $</small>
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
          بازار: ${fa(market)} $ · انبار: ${fa(state.inventory[p.id])} ·
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

// ---------- گزارش روز ----------
export function showReport(state) {
  const s = state.dayStats;
  const profit = s.revenue - s.expenses;
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
    <div class="rep-stock">
      ${PRODUCTS.map((p) => `<span class="stock-chip">${p.emoji} ${p.name}: ${fa(state.inventory[p.id])}</span>`).join('')}
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
/**
 * اگر WebGL بالا نیاید، یک نوار هشدار نشان می‌دهد. بازی در حالت
 * بدون‌گرافیک ادامه پیدا می‌کند، پس این فقط اطلاع‌رسانی است.
 */
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
  $('btn-start-day').addEventListener('click', () => cb.startDay());
  $('btn-reset-view').addEventListener('click', () => cb.resetView());

  document.querySelectorAll('.sheet-close').forEach((b) =>
    b.addEventListener('click', () => closeSheet())
  );
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
      // به‌روزرسانی هزینهٔ هر ردیف
      cb.refreshSupplier && cb.refreshSupplier();
    } else if (b.dataset.sup === 'buy') {
      // همان پیش‌فرضی که در ردیف نمایش داده می‌شود (۱) — وگرنه اولین خرید کاری نمی‌کند
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
