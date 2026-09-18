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
    this.elTip = mk(
      'fp-tip',
      'fp-el',
      this.touchMode
        ? '🕹️ سمت چپ صفحه: راه‌رفتن · سمت راست: نگاه کردن'
        : '🖱️ برای گرفتن دوربین کلیک کن · WASD حرکت · E تعامل'
    );
    this.elJoy = mk('fp-joy', 'fp-el', '<div id="fp-joy-knob"></div>');
    this.elAct = mk('fp-act', 'fp-el', '✋');
    this._hintText = '';
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
      this._lookBy(e.movementX || 0, e.movementY || 0, LOOK_SENS_MOUSE);
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
      if (this.elTip)
        this.elTip.innerHTML = '🕹️ سمت چپ صفحه: راه‌رفتن · سمت راست: نگاه کردن';
    }
    if (e.pointerType === 'mouse' || this._paused()) return;
    const w = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 800;
    try {
      if (this.canvas.setPointerCapture) this.canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* بعضی مرورگرها capture ندارند — اشکالی ندارد */
    }
    if (e.clientX < w * 0.45 && !this._joy) {
      this._joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      this._tipDismissed = true;
    } else if (!this._look) {
      this._look = { id: e.pointerId, lx: e.clientX, ly: e.clientY, moved: 0, t0: Date.now() };
    }
    if (e.preventDefault) e.preventDefault();
  }

  _onPointerMove(e) {
    if (this._joy && e.pointerId === this._joy.id) {
      let dx = e.clientX - this._joy.ox;
      let dy = e.clientY - this._joy.oy;
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
      const dx = e.clientX - this._look.lx;
      const dy = e.clientY - this._look.ly;
      this._look.lx = e.clientX;
      this._look.ly = e.clientY;
      this._look.moved += Math.abs(dx) + Math.abs(dy);
      this._lookBy(dx, dy, LOOK_SENS_TOUCH);
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
    if (this.elJoy) this.elJoy.classList.remove('show');
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
    const running = (this.keys.ShiftLeft || this.keys.ShiftRight) && inp.y > 0.1;
    const speed = running ? RUN_SPEED : WALK_SPEED;

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

  // ---------------- هم‌گام‌سازی DOM ----------------
  _syncDom(blocked) {
    if (!this.elCross) return;
    const inGame = !this.attract && this.mode !== 'intro';
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
