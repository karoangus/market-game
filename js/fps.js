// =============================================================
//  fps.js — دوربین و کنترل «اول‌شخص» (دسکتاپ + موبایل)
//
//  بازیکن خودِ صاحبِ سوپرمارکت است و داخلِ فروشگاه قدم می‌زند:
//   🖥️ دسکتاپ: WASD/کلیدهای جهت = حرکت، ماوس (Pointer Lock) = نگاه،
//      Shift = تند رفتن، E یا کلیک = تعامل
//   📱 موبایل: جوی‌استیکِ شناورِ سمت چپ = حرکت، کشیدن سمت راست = نگاه،
//      دکمهٔ لمسی یا ضربه = تعامل
//
//  حرکت روی همان شبکهٔ مسیریابیِ مشتری‌ها (nav.js) انجام می‌شود —
//  پس بازیکن مثل مشتری از دیوار/قفسه/میز رد نمی‌شود و می‌تواند از
//  درِ شیشه‌ای بیرون برود.
//
//  حسِ خوبِ بازی (جایی که «دقیق» بودن مهم است):
//   • شتاب/ترمز نرم (نه حرکت آجرباتی)
//   • تکانِ سر هنگام قدم (head-bob) + چرخش خفیف سر هنگام پهلو رفتن
//   • نفس‌کشیدن ملایم وقتی ساکنی + صدای قدم
//   • کراس‌هیر وسط صفحه + برچسب تعامل روی قفسه‌ها و صندوق
//   • FOV پویا: در حالت عمودی (موبایل) دید پهن‌تر می‌شود تا «عرض»
//     دید تنگ نشود + هنگام تندروی FOV کمی باز می‌شود (حس سرعت)
//   • دکمهٔ 🏃 در موبایل: نگه‌داشتن = تندروی
//   • اینتروی سینمایی: دوربین از پیاده‌رو میاد، در باز میشه و چشم‌ت
//     داخل فروشگاه قرار می‌گیره
//   • حالت attract: قبل از شروع بازی، دوربین آرام این‌طرف‌وآن‌طرف
//     می‌چرخد تا پشتِ صفحهٔ شروع زنده باشد
//
//  توابع پایین فایل (clampPitch، yawPitchToward، slideMove،
//  pickAimTarget) «خالص»‌اند و بدون مرورگر در تست اجرا می‌شوند.
// =============================================================
import * as THREE from 'three';
import { REGISTER, DOOR, NAV } from './layout.js';
import { clamp01, lerp, easeInOutCubic } from './anim.js';
import { sfx } from './sound.js';
import { getViewportSize, mapPointToLogical, mapDeltaToLogical } from './fullscreen.js';

export const EYE_HEIGHT = 1.62; // ارتفاع چشم بازیکن (اتاق ۲.۸ متری است)
export const WALK_SPEED = 2.35; // متر بر ثانیه
export const RUN_SPEED = 3.7; // با Shift
export const PLAYER_RADIUS = 0.26; // برای اینکه مشتری‌ها دورت بچرخند
export const PLAYER_SPAWN = { x: 1.05, z: 0.95, lookX: -0.4, lookY: 1.35, lookZ: -0.85 };

const PITCH_LIMIT = 1.45; // ±۸۳ درجه — گردن که نمی‌شکند!
const LOOK_SENS_MOUSE = 0.0023;
const LOOK_SENS_TOUCH = 0.0044;
const AIM_DIST = 2.7; // تا این فاصله می‌شود با قفسه/صندوق تعامل کرد
const JOY_RADIUS = 46; // شعاع جوی‌استیک لمسی (پیکسل)

// ---------- FOV (میدان دید) ----------
export const BASE_FOV = 68; // FOV عمودی پایه (درجه) — حالت افقی/دسکتاپ
export const PORTRAIT_FOV_MAX = 92; // سقف FOV عمودی در حالت عمودی (ضد فیش‌ای)
export const RUN_FOV_BOOST = 8; // باز شدن FOV هنگام تندروی (حس سرعت)

// ---------- متن راهنمای کنترل ----------
const TIP_TOUCH = '🕹️ چپ: راه‌رفتن · 🏃 نگه‌دار = دویدن · راست: نگاه';
const TIP_MOUSE = '🖱️ کلیک: دوربین · WASD حرکت · Shift دویدن · E تعامل';

// =============================================================
//  توابع خالص — منطق اصلی، بدون هیچ وابستگی به DOM
// =============================================================

/** زاویه را به بازهٔ (-π, π] برمی‌گرداند */
export function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** سقف بالا/پایین نگاه‌کردن */
export function clampPitch(p) {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));
}

/**
 * FOV عمودی دوربین (درجه) بر اساس نسبت عرض/ارتفاعِ صفحه.
 * حالت افقی: همیشه ۶۸. حالت عمودی (موبایل): دید را می‌گشاییم تا
 * «عرض» دید — یعنی بعدِ کوتاهِ صفحه — تنگ و خفه نشود؛ با سقفی
 * تا فیش‌ای‌ای نشود. (در three.js، fov همیشه FOVِ عمودی است.)
 */
export function computeBaseFov(aspect) {
  if (typeof aspect !== 'number' || !isFinite(aspect) || aspect <= 0) return BASE_FOV;
  if (aspect >= 1) return BASE_FOV;
  // بخواهیم FOVِ افقی همان ۶۸ درجه بماند: vFOV = 2·atan(tan(34°)/aspect)
  const half = (BASE_FOV * Math.PI) / 360;
  const v = (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI;
  return Math.min(PORTRAIT_FOV_MAX, Math.max(BASE_FOV, v));
}

/**
 * حساسیت نگاهِ لمسی، مقیاس‌شده با بعدِ کوتاهِ صفحه:
 * کشیدنِ فاصلهٔ فیزیکیِ یکسان روی صفحهٔ بزرگ‌تر نباید بیشتر بچرخاند.
 * (مرجع: ۴۰۰ پیکسل → ضریب ۱؛ محدود به ۰.۷۵ تا ۱.۴۵)
 */
export function touchLookSens(shortPx) {
  const s = Math.max(200, Math.min(900, shortPx || 400));
  return LOOK_SENS_TOUCH * Math.max(0.75, Math.min(1.45, s / 400));
}

/**
 * yaw/pitch لازم تا از نقطهٔ `from` به نقطهٔ `to` نگاه کنی.
 * قرارداد three.js: yaw=0 یعنی نگاه به ‎-z‎؛ pitch>0 یعنی نگاه به بالا.
 */
export function yawPitchToward(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const yaw = Math.atan2(-dx, -dz);
  const dy = (to.y == null ? EYE_HEIGHT : to.y) - (from.y == null ? EYE_HEIGHT : from.y);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return { yaw, pitch };
}

/**
 * حرکت با برخورد: pos را (dx,dz) جابه‌جا می‌کند ولی هرگز وارد خانهٔ
 * مسدود شبکه نمی‌شود. اول هر دو محور با هم، بعد هر کدام جدا — نتیجه:
 * وقتی به دیوار می‌خوری، کنارش «می‌لغزی» نه اینکه میخ شوی.
 * @returns {{movedX:number, movedZ:number}}
 */
export function slideMove(nav, pos, dx, dz) {
  let movedX = 0;
  let movedZ = 0;
  if (dx !== 0 && dz !== 0 && nav.isFree(pos.x + dx, pos.z + dz)) {
    pos.x += dx;
    pos.z += dz;
    return { movedX: dx, movedZ: dz };
  }
  if (dx !== 0 && nav.isFree(pos.x + dx, pos.z)) {
    pos.x += dx;
    movedX = dx;
  }
  if (dz !== 0 && nav.isFree(pos.x, pos.z + dz)) {
    pos.z += dz;
    movedZ = dz;
  }
  return { movedX, movedZ };
}

/**
 * چه چیزی زیرِ کراس‌هیر است؟ (هندسهٔ دوبعدی ساده — بدون Raycaster)
 * قفسه‌ها و صندوق هر کدام یک «امتیاز» می‌گیرند بر اساس این‌که چقدر
 * دقیقاً جلوی صورتت‌اند و چقدر نزدیکی؛ بهترین برنده است.
 * @returns {{type:'shelf', id:string} | {type:'register'} | null}
 */
export function pickAimTarget({ pos, yaw, shelves = [], register = null, maxDist = AIM_DIST }) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let best = null;
  let bestScore = 0.55; // حداقل امتیاز قبولی
  const consider = (tx, tz, data) => {
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > maxDist || d < 1e-3) return;
    const dot = (dx / d) * fx + (dz / d) * fz;
    if (dot < 0.5) return; // باید تقریباً جلوی صورتت باشد
    const score = dot * 0.72 + (1 - Math.min(1, d / maxDist)) * 0.38;
    if (score > bestScore) {
      bestScore = score;
      best = data;
    }
  };
  for (const sh of shelves) consider(sh.x, sh.z, { type: 'shelf', id: sh.id });
  if (register) consider(register.x, register.z, { type: 'register' });
  return best;
}

// =============================================================
//  کنترل‌کنندهٔ اول‌شخص
// =============================================================
export class FirstPerson {
  /**
   * @param {{camera: THREE.PerspectiveCamera, canvas: HTMLElement, world: Object,
   *          isBlocked?: () => boolean, onInteract?: (aim: any) => void,
   *          formatAim?: (aim: any) => string}} opts
   */
  constructor({ camera, canvas, world, isBlocked, onInteract, formatAim }) {
    this.camera = camera;
    this.canvas = canvas;
    this.world = world;
    this.isBlocked = isBlocked || (() => false);
    this.onInteract = onInteract || (() => {});
    this.formatAim = formatAim || (() => '');

    // --- وضعیت بدن ---
    const sp = PLAYER_SPAWN;
    const a = yawPitchToward({ x: sp.x, y: EYE_HEIGHT, z: sp.z }, { x: sp.lookX, y: sp.lookY, z: sp.lookZ });
    this.spawnPose = { x: sp.x, z: sp.z, yaw: a.yaw, pitch: a.pitch };
    this.pos = new THREE.Vector3(sp.x, 0, sp.z);
    this.yaw = a.yaw;
    this.pitch = a.pitch;
    this.roll = 0;
    this.vel = new THREE.Vector2(0, 0);
    this.keys = Object.create(null);
    this.moveInput = { x: 0, y: 0 }; // جوی‌استیک لمسی

    // --- FOV و جهت‌گیری صفحه ---
    const s0 = this._size();
    const w0 = s0.w;
    const h0 = s0.h;
    this.aspect = w0 > 0 && h0 > 0 ? w0 / h0 : 1;
    this.portrait = this.aspect < 1;
    this.baseFov = computeBaseFov(this.aspect);
    this.fov = this.baseFov; // FOV فعلی (نرم‌شده)
    this.fovTarget = this.baseFov;
    this.touchRun = false; // دکمهٔ 🏃 (موبایل) — نگه‌دار تا بدوی

    // --- حالت‌ها ---
    this.mode = 'play'; // play | intro | reset
    this.attract = true; // تا بازی شروع نشده، دوربین خودکار می‌چرخد
    this.attractT = 0;
    this.intro = null;
    this.resetAnim = null;

    // --- حس‌وحال ---
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.idleT = (sp.x * 7.3) % 10;
    this.lookVel = 0;
    this._prevYaw = this.yaw;

    // --- تعامل ---
    this.aim = null;
    this._aimKey = '';
    this._shelfAims = null;

    // --- ورودی ---
    this.touchMode =
      (typeof navigator !== 'undefined' && (navigator.maxTouchPoints | 0) > 0) ||
      (typeof window !== 'undefined' && 'ontouchstart' in window);
    this.locked = false;
    this._joy = null; // { id, ox, oy }
    this._look = null; // { id, lx, ly, moved, t0 }
    this._tipDismissed = false;

    this._buildDom();
    this._bind();
    this._applyCamera(0);
  }

  // ---------------- ساخت اجرای رابط (کراس‌هیر، جوی‌استیک…) ----------------
  _buildDom() {
    if (typeof document === 'undefined' || !document.body) return;
    const mk = (id, cls, html) => {
      const e = document.createElement('div');
      e.id = id;
      e.className = cls;
      if (html != null) e.innerHTML = html;
      document.body.appendChild(e);
      return e;
    };
    this.elCross = mk('fp-cross', 'fp-el', '<i></i>');
    this.elHint = mk('fp-hint', 'fp-el', '');
    this.elTip = mk('fp-tip', 'fp-el', this.touchMode ? TIP_TOUCH : TIP_MOUSE);
    this.elJoy = mk('fp-joy', 'fp-el', '<div id="fp-joy-knob"></div>');
    this.elRun = mk('fp-run', 'fp-el', '🏃');
    this.elAct = mk('fp-act', 'fp-el', '✋');
    this._hintText = '';
    // دکمهٔ 🏃: نگه‌داشتن = تندروی (معادل Shift)
    if (this.elRun && this.elRun.addEventListener) {
      this.elRun.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchRun = true;
        this._tipDismissed = true;
        this.elRun.classList.add('on');
      });
      const offRun = () => {
        this.touchRun = false;
        if (this.elRun) this.elRun.classList.remove('on');
      };
      this.elRun.addEventListener('pointerup', offRun);
      this.elRun.addEventListener('pointercancel', offRun);
      this.elRun.addEventListener('pointerleave', offRun);
    }
    if (this.elAct && this.elAct.addEventListener) {
      this.elAct.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._interact();
      });
    }
  }

  // ---------------- اتصال ورودی‌ها ----------------
  _bind() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.keys[e.code] = true;
      if (
        this._gameKeys(e.code) &&
        this.mode === 'play' &&
        !this.attract &&
        !this.isBlocked() &&
        e.preventDefault
      )
        e.preventDefault();
      if (e.code === 'KeyE' && !e.repeat) this._interact();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
      this._releaseTouch();
    });

    const cv = this.canvas;
    if (!cv || !cv.addEventListener || typeof document === 'undefined' || !document.addEventListener)
      return;
    cv.addEventListener('contextmenu', (e) => e.preventDefault && e.preventDefault());
    cv.addEventListener('click', () => {
      if (this.attract || this.mode !== 'play' || this.isBlocked()) return;
      if (this.touchMode) return; // در حالت لمسی، ضربه از مسیر pointer مدیریت می‌شود
      if (!this.locked) this._requestLock();
      else this._interact();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      if (this.locked) this._tipDismissed = true;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this._paused()) return;
      // در حالتِ افقیِ اجباری، جابه‌جاییِ ماوس هم باید بچرخد
      const d = mapDeltaToLogical(e.movementX || 0, e.movementY || 0);
      this._lookBy(d.dx, d.dy, LOOK_SENS_MOUSE);
    });

    // --- لمسی (Pointer Events: موبایل و لپ‌تاپ لمسی) ---
    cv.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    cv.addEventListener('pointermove', (e) => this._onPointerMove(e));
    cv.addEventListener('pointerup', (e) => this._onPointerUp(e));
    cv.addEventListener('pointercancel', (e) => this._onPointerUp(e));
  }

  _gameKeys(code) {
    return (
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'KeyE' ||
      code === 'ShiftLeft' ||
      code === 'ShiftRight' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Space'
    );
  }

  _paused() {
    return this.attract || this.mode !== 'play' || this.isBlocked();
  }

  _requestLock() {
    const cv = this.canvas;
    try {
      if (cv && cv.requestPointerLock) {
        const p = cv.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {
      /* Pointer Lock در همهٔ مرورگرها نیست — بازی ادامه دارد */
    }
  }

  _lookBy(dx, dy, sens) {
    this.yaw = normalizeAngle(this.yaw - dx * sens);
    this.pitch = clampPitch(this.pitch - dy * sens);
  }

  // ---------------- لمسی: جوی‌استیک + نگاه ----------------
  _onPointerDown(e) {
    if (e.pointerType !== 'mouse' && !this.touchMode) {
      this.touchMode = true; // اولین لمس → حالت لمسی فعال شود
      if (this.elTip) this.elTip.innerHTML = TIP_TOUCH;
    }
    if (e.pointerType === 'mouse' || this._paused()) return;
    const { w, h } = this._size();
    const p = this._pt(e);
    try {
      if (this.canvas.setPointerCapture) this.canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* بعضی مرورگرها capture ندارند — اشکالی ندارد */
    }
    // در حالت عمودی صفحه باریک است؛ نصف/نصف درست‌تر از ۴۵٪ می‌افتد
    const split = this.portrait ? 0.5 : 0.45;
    if (p.x < w * split && !this._joy) {
      // محلِ شکل‌گرفتنِ جوی‌استیک به لبهٔ صفحه قفل می‌شود تا کلِ دستگیره
      // (نه نیمی‌اش) داخل صفحه دیده شود — در حالت عمودی مهم است
      this._joy = {
        id: e.pointerId,
        ox: Math.max(66, Math.min(w - 66, p.x)),
        oy: Math.max(66, Math.min(h - 66, p.y)),
      };
      this._tipDismissed = true;
    } else if (!this._look) {
      this._look = { id: e.pointerId, lx: p.x, ly: p.y, moved: 0, t0: Date.now() };
    }
    if (e.preventDefault) e.preventDefault();
  }

  _onPointerMove(e) {
    if (this._joy && e.pointerId === this._joy.id) {
      const p = this._pt(e);
      let dx = p.x - this._joy.ox;
      let dy = p.y - this._joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      this.moveInput.x = dx / JOY_RADIUS;
      this.moveInput.y = -dy / JOY_RADIUS;
      if (this.elJoy) {
        const k = this.elJoy.querySelector('#fp-joy-knob');
        if (k && k.style) k.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      if (e.preventDefault) e.preventDefault();
      return;
    }
    if (this._look && e.pointerId === this._look.id) {
      const p = this._pt(e);
      const dx = p.x - this._look.lx;
      const dy = p.y - this._look.ly;
      this._look.lx = p.x;
      this._look.ly = p.y;
      this._look.moved += Math.abs(dx) + Math.abs(dy);
      // حساسیت با اندازهٔ صفحه مقیاس می‌شود (کشیدنِ یکسان = چرخشِ یکسان)
      const sz = this._size();
      this._lookBy(dx, dy, touchLookSens(Math.min(sz.w, sz.h)));
      this._tipDismissed = true;
      if (e.preventDefault) e.preventDefault();
    }
  }

  _onPointerUp(e) {
    if (this._joy && e.pointerId === this._joy.id) {
      this._joy = null;
      this.moveInput.x = 0;
      this.moveInput.y = 0;
      if (this.elJoy) this.elJoy.classList.remove('show');
      return;
    }
    if (this._look && e.pointerId === this._look.id) {
      // «ضربهٔ سریع» روی سمت راست = تعامل (مثل کلیک)
      if (this._look.moved < 14 && Date.now() - this._look.t0 < 380 && !this._paused()) {
        this._interact();
      }
      this._look = null;
    }
  }

  _releaseTouch() {
    this._joy = null;
    this._look = null;
    this.moveInput.x = 0;
    this.moveInput.y = 0;
    this.touchRun = false;
    if (this.elJoy) this.elJoy.classList.remove('show');
    if (this.elRun) this.elRun.classList.remove('on');
  }

  // ---------------- اندازه و مختصاتِ «منطقیِ» صفحه ----------------
  /**
   * اندازهٔ منطقیِ صفحه (همان چیزی که کاربر می‌بیند).
   * در حالتِ «افقیِ اجباری» (چرخش با CSS، مخصوص iOS) عرض و ارتفاعِ
   * فیزیکی جابه‌جا می‌شوند — چون innerWidth/innerHeight با transform
   * عوض نمی‌شوند.
   */
  _size() {
    const s = getViewportSize();
    const win = typeof window !== 'undefined' ? window : null;
    return {
      w: s.w || (win && win.innerWidth) || 800,
      h: s.h || (win && win.innerHeight) || 600,
    };
  }

  /**
   * مختصاتِ لمس/ماوس را به دستگاهِ «منطقیِ» صفحه می‌بَرد.
   * clientX/clientY همیشه نسبت به ویوپورتِ فیزیکی‌اند، حتی وقتی کلِ
   * صفحه با CSS چرخانده شده باشد — پس بدونِ این تبدیل، جوی‌استیک و
   * نگاهِ لمسی در حالتِ افقیِ اجباری وارونه کار می‌کردند.
   */
  _pt(e) {
    return mapPointToLogical(e.clientX || 0, e.clientY || 0);
  }

  // ---------------- تعامل ----------------
  _interact() {
    if (this._paused() || !this.aim) return;
    this.onInteract(this.aim);
  }

  _aimTargets() {
    if (!this._shelfAims) {
      this._shelfAims = Object.keys(this.world.shelves || {}).map((id) => ({
        id,
        x: this.world.shelves[id].slot.x,
        z: this.world.shelves[id].slot.z,
      }));
    }
    return this._shelfAims;
  }

  /**
   * به‌روزرسانی نسبت عرض/ارتفاع صفحه (چرخش گوشی، resize، تمام‌صفحه).
   * در حالت عمودی میدان دید پهن‌تر می‌شود تا «عرض» دید تنگ نشود.
   * خودِ دوربین در هر فریم به‌آرامی به FOV تازه همگام می‌شود.
   */
  setAspect(aspect) {
    if (typeof aspect !== 'number' || !isFinite(aspect) || aspect <= 0) return;
    this.aspect = aspect;
    this.portrait = aspect < 1;
    this.baseFov = computeBaseFov(aspect);
  }

  // ---------------- اینتروی سینمایی ----------------
  /** دوربین از پیاده‌رو می‌آید، درِ شیشه‌ای باز می‌شود و چشمِ بازیکن داخل می‌نشیند */
  playIntro() {
    const sp = this.spawnPose;
    const mx = DOOR.x;
    this.attract = false;
    this.mode = 'intro';
    this.intro = {
      t: 0,
      dur: 3.6,
      pts: [
        { x: mx + 0.35, y: 2.35, z: 7.1 }, // روی پیاده‌رو، نگاه به ویترین
        { x: mx, y: 1.9, z: 4.2 },
        { x: mx, y: 1.7, z: 2.62 }, // وسط دهانهٔ در
        { x: sp.x, y: EYE_HEIGHT, z: sp.z }, // جای خودت، داخل فروشگاه
      ],
      looks: [
        { x: mx, y: 2.15, z: 2.0 },
        { x: mx - 0.4, y: 1.7, z: 0.8 },
        { x: PLAYER_SPAWN.lookX, y: PLAYER_SPAWN.lookY, z: PLAYER_SPAWN.lookZ },
        { x: PLAYER_SPAWN.lookX, y: PLAYER_SPAWN.lookY, z: PLAYER_SPAWN.lookZ },
      ],
      doorOpened: false,
    };
    if (this.world.setDoor) this.world.setDoor(true);
  }

  _updateIntro(dt) {
    const it = this.intro;
    it.t += dt;
    const k = clamp01(it.t / it.dur);
    const n = it.pts.length - 1;
    const seg = Math.min(n - 1, Math.floor(k * n));
    const sk = easeInOutCubic(k * n - seg);
    const a = it.pts[seg];
    const b = it.pts[seg + 1];
    const la = it.looks[seg];
    const lb = it.looks[seg + 1];
    const px = lerp(a.x, b.x, sk);
    const py = lerp(a.y, b.y, sk);
    const pz = lerp(a.z, b.z, sk);
    const yp = yawPitchToward(
      { x: px, y: py, z: pz },
      { x: lerp(la.x, lb.x, sk), y: lerp(la.y, lb.y, sk), z: lerp(la.z, lb.z, sk) }
    );
    this.camera.position.set(px, py, pz);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(yp.pitch, yp.yaw, 0);
    this.pos.set(px, 0, pz); // بدن بازیکن هم با دوربین می‌آید (تا برخوردها درست باشد)
    if (!it.doorOpened && pz < 3.6 && this.world.setDoor) {
      it.doorOpened = true;
      this.world.setDoor(true);
    }
    if (k >= 1) {
      const sp = this.spawnPose;
      this.pos.set(sp.x, 0, sp.z);
      this.yaw = sp.yaw;
      this.pitch = sp.pitch;
      this.vel.set(0, 0);
      this.mode = 'play';
      this.intro = null;
      if (this.world.setDoor) this.world.setDoor(false);
      this._applyCamera(0);
    }
  }

  // ---------------- برگشت به وسط فروشگاه (دکمهٔ 🎥 قبلی) ----------------
  resetToSpawn() {
    if (this.mode === 'intro') return;
    this.attract = false;
    this.mode = 'reset';
    this.resetAnim = {
      t: 0,
      dur: 0.55,
      fx: this.pos.x,
      fz: this.pos.z,
      fyaw: this.yaw,
      fpitch: this.pitch,
    };
    this._releaseTouch();
  }

  _updateReset(dt) {
    const r = this.resetAnim;
    r.t += dt;
    const k = easeInOutCubic(clamp01(r.t / r.dur));
    const sp = this.spawnPose;
    this.pos.x = lerp(r.fx, sp.x, k);
    this.pos.z = lerp(r.fz, sp.z, k);
    this.yaw = normalizeAngle(r.fyaw + normalizeAngle(sp.yaw - r.fyaw) * k);
    this.pitch = lerp(r.fpitch, sp.pitch, k);
    this.vel.multiplyScalar(Math.max(0, 1 - dt * 10));
    if (r.t >= r.dur) {
      this.mode = 'play';
      this.resetAnim = null;
    }
  }

  // ---------------- حلقهٔ اصلی ----------------
  /**
   * @param {number} dt ثانیه
   * @param {boolean} blocked وقتی پنل/گزارش/منو باز است — ورودی نادیده گرفته می‌شود
   */
  update(dt, blocked) {
    if (this.mode === 'intro') {
      this._updateIntro(dt);
      this._syncDom(true);
      return;
    }
    if (this.mode === 'reset') {
      this._updateReset(dt);
    } else if (this.attract) {
      this._attractTick(dt);
    } else if (!blocked) {
      this._playTick(dt);
    } else {
      // ورودی مرده است؛ حرکت نرم فروکش می‌کند
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 11));
      this.bobAmp = lerp(this.bobAmp, 0, Math.min(1, dt * 6));
      if (this._aimKey) {
        this._aimKey = '';
        this.aim = null;
      }
    }
    this._applyCamera(dt);
    this._syncDom(blocked);
  }

  _attractTick(dt) {
    this.attractT += dt;
    const sp = this.spawnPose;
    this.pos.set(sp.x, 0, sp.z);
    // چرخش ملایم خودکار — صفحهٔ بازی پشتِ منو زنده است
    this.yaw = normalizeAngle(sp.yaw + Math.sin(this.attractT * 0.3) * 0.17);
    this.pitch = sp.pitch + Math.sin(this.attractT * 0.22) * 0.045;
    this.fovTarget = this.baseFov;
  }

  _inputVector() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.KeyW || k.ArrowUp) y += 1;
    if (k.KeyS || k.ArrowDown) y -= 1;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    x += this.moveInput.x;
    y += this.moveInput.y;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  _playTick(dt) {
    const inp = this._inputVector();
    const moving = Math.abs(inp.x) + Math.abs(inp.y) > 0.05;
    // تندروی: Shift (دسکتاپ) یا نگه‌داشتنِ دکمهٔ 🏃 (موبایل) — فقط وقتی به جلو می‌روی
    const running = ((this.keys.ShiftLeft || this.keys.ShiftRight) || this.touchRun) && inp.y > 0.1;
    const speed = running ? RUN_SPEED : WALK_SPEED;
    // FOV هنگام تندروی کمی باز می‌شود (حس سرعت) — وگرنه به پایه برمی‌گردد
    this.fovTarget = this.baseFov + (running ? RUN_FOV_BOOST : 0);

    // جهتِ جهانیِ حرکت: محلیِ دوربین → جهان
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const fx = -sy;
    const fz = -cy;
    const rx = cy;
    const rz = -sy;
    const tx = (fx * inp.y + rx * inp.x) * speed;
    const tz = (fz * inp.y + rz * inp.x) * speed;

    // شتاب/ترمز نرم — حرکت «چسبناک» نه کلیدی
    const k = 1 - Math.exp(-dt * (moving ? 11 : 13));
    this.vel.x = lerp(this.vel.x, tx, k);
    this.vel.y = lerp(this.vel.y, tz, k);

    const dx = this.vel.x * dt;
    const dz = this.vel.y * dt;
    if ((Math.abs(dx) > 1e-5 || Math.abs(dz) > 1e-5) && this.world.nav) {
      slideMove(this.world.nav, this.pos, dx, dz);
    }
    // محدودهٔ سختِ نقشه (نهاراحتی!)
    this.pos.x = Math.max(NAV.minX + 0.2, Math.min(NAV.maxX - 0.2, this.pos.x));
    this.pos.z = Math.max(NAV.minZ + 0.2, Math.min(NAV.maxZ - 0.2, this.pos.z));

    // ---- تکانِ سر و صدای قدم ----
    const spd = Math.hypot(this.vel.x, this.vel.y);
    const ampT = clamp01(spd / WALK_SPEED);
    this.bobAmp = lerp(this.bobAmp, ampT, Math.min(1, dt * (ampT > this.bobAmp ? 9 : 5.5)));
    if (spd > 0.25) {
      const prev = Math.sin(this.bobPhase * 2);
      this.bobPhase += dt * (4.7 + ampT * 3.1);
      const cur = Math.sin(this.bobPhase * 2);
      // لحظهٔ «گذاشتن پا روی زمین» در چرخهٔ قدم
      if (prev > -0.62 && cur <= -0.62 && sfx.step) {
        const inside = Math.abs(this.pos.x) < 2.6 && Math.abs(this.pos.z) < 2.1;
        sfx.step(!inside);
      }
    }

    // ---- چیزی زیر کراس‌هیر هست؟ ----
    const aim = pickAimTarget({
      pos: this.pos,
      yaw: this.yaw,
      shelves: this._aimTargets(),
      register: REGISTER.counter,
    });
    const key = aim ? `${aim.type}#${aim.id || ''}` : '';
    if (key !== this._aimKey) {
      this._aimKey = key;
      this.aim = aim;
    }
  }

  _applyCamera(dt) {
    this.idleT += dt;
    // FOV را به‌آرامی به مقصد می‌رسانیم (پرش‌ناگه نمی‌خوایم)
    const kF = 1 - Math.exp(-(dt || 0.016) * 5);
    this.fov = lerp(this.fov, this.fovTarget, kF);
    this._applyCameraFov();
    // نوسانِ سر: بالا/پایین + چپ/راست + رول خفیف
    const bobY = Math.sin(this.bobPhase * 2) * 0.028 * this.bobAmp;
    const bobX = Math.cos(this.bobPhase) * 0.012 * this.bobAmp;
    const breathe = Math.sin(this.idleT * 1.55) * 0.0035 * (1 - this.bobAmp);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    this.camera.position.set(
      this.pos.x + cy * bobX,
      EYE_HEIGHT + bobY + breathe,
      this.pos.z - sy * bobX
    );
    // رول: ترکیب قدم + چرخش نگاه (sway) + حرکت پهلو (strafe)
    if (dt > 0) {
      const yawVel = normalizeAngle(this.yaw - this._prevYaw) / dt;
      this.lookVel = lerp(this.lookVel, Math.max(-8, Math.min(8, yawVel)), Math.min(1, dt * 9));
    }
    this._prevYaw = this.yaw;
    const rv = rightVector(this.yaw);
    const strafe = (this.vel.x * rv.x + this.vel.y * rv.z) / RUN_SPEED;
    const rollTarget =
      Math.sin(this.bobPhase) * 0.005 * this.bobAmp - strafe * 0.012 - this.lookVel * 0.0028;
    this.roll = lerp(this.roll, rollTarget, Math.min(1, (dt || 0.016) * 10));
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, this.roll);
  }

  /** اعمال FOV روی دوربین واقعی (در تست‌ها دوربین جعلی، fov ندارد) */
  _applyCameraFov() {
    const c = this.camera;
    if (c && typeof c.fov === 'number' && typeof c.updateProjectionMatrix === 'function') {
      if (Math.abs(c.fov - this.fov) > 0.02) {
        c.fov = this.fov;
        c.updateProjectionMatrix();
      }
    }
  }

  // ---------------- هم‌گام‌سازی DOM ----------------
  _syncDom(blocked) {
    if (!this.elCross) return;
    const inGame = !this.attract && this.mode !== 'intro';
    // اگر پنلی روی صفحه باز شود، دکمهٔ دویدن «رها شده» فرض می‌شود — انگشت
    // ممکن است روی پنل رها شده باشد و pointerup به دکمه نرسیده باشد.
    if (blocked && this.touchRun) {
      this.touchRun = false;
      if (this.elRun) this.elRun.classList.remove('on');
    }
    const showAim = inGame && !blocked && !!this.aim;
    toggle(this.elCross, inGame && !blocked);
    this.elCross.classList.toggle('on', showAim);
    toggle(this.elHint, showAim);
    if (showAim) {
      const txt = this.formatAim(this.aim) || '';
      if (txt !== this._hintText) {
        this._hintText = txt;
        this.elHint.innerHTML = txt;
      }
    }
    toggle(
      this.elTip,
      inGame && !blocked && !this._tipDismissed && !this.locked && this.mode === 'play'
    );
    toggle(this.elAct, showAim && this.touchMode);
    toggle(this.elRun, inGame && !blocked && this.touchMode);
    // جوی‌استیک فقط وقتی انگشت روی آن است
    if (this._joy && this.elJoy) {
      this.elJoy.classList.add('show');
      if (this.elJoy.style) {
        this.elJoy.style.left = `${this._joy.ox - 59}px`;
        this.elJoy.style.top = `${this._joy.oy - 59}px`;
      }
    } else if (this.elJoy) {
      this.elJoy.classList.remove('show');
    }
  }
}

// ---------- کمکی‌های محلی ----------
function rightVector(yaw) {
  // بردار «دست راست» دوربین در صفحهٔ زمین
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

function toggle(el, on) {
  if (el && el.classList) el.classList.toggle('show', !!on);
}
