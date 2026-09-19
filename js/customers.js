// =============================================================
//  customers.js — شبیه‌سازی یک روز فروش
//
//  هر مشتری یک آدم کامل است با این چرخهٔ زندگی:
//    ۱) بیرون ظاهر می‌شود، به در می‌رسد (در خودکار باز می‌شود)
//    ۲) با مسیریابی A* (nav.js) سرِ قفسه می‌رود — نه از توی دیوار،
//       نه از توی میز حساب، نه از توی مشتری‌های دیگر
//    ۳) کالا را با «دست» برمی‌دارد (IK) و کالا در همان لحظه با یک
//       قوس زیبا داخل سبد خریدش می‌افتد
//    ۴) در صف صندوق می‌ایستد؛ کالاها روی نوار اسکن می‌روند، بوق
//       می‌خورند و داخل کیسه می‌افتند، بعد پول پرداخت می‌شود
//    ۵) با کیسه از فروشگاه بیرون می‌رود
// =============================================================
import * as THREE from 'three';
import { PRODUCTS, GAME } from './config.js';
import { buyChance } from './economy.js';
import {
  buildPerson,
  refreshShelves,
  takeShelfItem,
  sparkle,
  moodBubble,
  floatText,
  REGISTER_POS,
} from './scene3d.js';
import { REGISTER, ENTRANCE, AGENT_RADIUS, DOOR } from './layout.js';
import { BASKET_SLOTS } from './person.js';
import { separation, resolveOverlap } from './nav.js';
import { Tweens, clamp01, easeOutCubic, easeOutBack, arcLerp, lerp } from './anim.js';
import { sfx } from './sound.js';

const jx = (a) => (Math.random() * 2 - 1) * a;
const WALK_STATES = new Set(['toDoor', 'enterShop', 'toShelf', 'toQueue', 'leaveShop', 'exitDoor']);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

/** چرخش نرم به سمت زاویهٔ هدف (کوتاه‌ترین مسیر) */
function turnToward(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export class DaySimulation {
  constructor(state, world, hooks = {}) {
    this.state = state;
    this.world = world;
    this.hooks = hooks;
    const base = GAME.customers.base * (state.reputationMul || 1);
    const raw = base + GAME.customers.perDay * (state.day - 1) + jx(1.5) + (state.customerBias || 0);
    this.total = Math.max(4, Math.min(GAME.customers.max, Math.round(raw)));
    this.spawned = 0;
    this.active = [];
    this.spawnTimer = 0.5;
    this.time = 0;
    this.finished = false;
    this.stats = { customers: 0, buyers: 0, itemsSold: 0, revenue: 0, abandoned: 0, happy: 0 };
    this.queue = [];
    this.paying = null;
    this.spotClaims = new Map();
    this.speedFactor = state.weatherSpeed || 1;
    this.expected = 24 + this.total * 3; // تخمین طول روز برای ساعت فروشگاه
    this._doorOpen = false;
    this.clock = { from: 9, to: 21 }; // ساعت فروشگاه
  }

  /** ساعت بازی به‌صورت «۱۴:۳۰» — برای HUD */
  get clockText() {
    const k = clamp01(this.time / this.expected);
    const h = this.clock.from + (this.clock.to - this.clock.from) * k;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return `${hh}:${String(mm).padStart(2, '0')}`;
  }

  get progress() {
    if (!this.total) return 0;
    return clamp01(this.spawned / this.total);
  }

  update(dt) {
    if (this.finished) return;
    this.time += dt;

    // تولد مشتری — چند نفر هم‌زمان در فروشگاه
    const maxConcurrent = GAME.customers.maxConcurrent || 4;
    if (this.spawned < this.total && this.active.length < maxConcurrent) {
      this.spawnTimer -= dt * this.speedFactor;
      if (this.spawnTimer <= 0) {
        this.spawn();
        this.spawnTimer = (1.15 + Math.random() * 1.9) / (this.state.rateMul || GAME.customers.rateMul || 1);
      }
    }

    // در کشویی با نزدیک‌شدن مشتری باز می‌شود
    const nearDoor = this.active.some(
      (c) => Math.abs(c.pos.x - DOOR.x) < 1.3 && Math.abs(c.pos.z - 2.15) < 1.5
    );
    if (nearDoor !== this._doorOpen) {
      this._doorOpen = nearDoor;
      if (nearDoor) sfx.door();
    }
    // نتیجهٔ نهاییِ «در باز بماند» با وضعیتِ بازیکن (first-person) در main.js
    // OR می‌شود؛ این‌جا فقط آرزوی مشتری‌ها را ثبت می‌کنیم.
    this.world.doorWanted = nearDoor;

    for (const c of this.active) c.update(dt);
    this.active = this.active.filter((c) => !c.gone);

    // محافظ: اگر از ۱۵۰ ثانیه گذشت، روز تمام شود (هیچ کالایی گم نمی‌شود)
    if (this.time > 150) return this.forceFinish();

    if (this.spawned >= this.total && this.active.length === 0) this.finishDay();
  }

  /** پایان اجباری روز با تسویهٔ مشتری‌های باقی‌مانده */
  forceFinish() {
    for (const c of this.active) {
      if (c.basketCount > 0) c.payNow();
      c.dispose();
    }
    this.active = [];
    this.queue = [];
    this.paying = null;
    this.finishDay();
  }

  finishDay() {
    if (this.finished) return;
    this.finished = true;
    if (this.world) this.world.doorWanted = false;
    const s = this.state.dayStats;
    s.customers = this.stats.customers;
    s.buyers = this.stats.buyers;
    s.itemsSold = this.stats.itemsSold;
    s.revenue = this.stats.revenue;
    s.abandoned = this.stats.abandoned;
    s.happy = this.stats.happy;
    if (this.hooks.onDayEnd) this.hooks.onDayEnd(this.stats);
  }

  spawn() {
    const c = new CustomerAgent(this);
    this.world.scene.add(c.group);
    this.active.push(c);
    this.spawned++;
    this.stats.customers++;
    if (this.hooks.onEnter) this.hooks.onEnter(c);
  }

  // ---------- رزرو جای ایستادن جلوی قفسه (دو نفر روی هم نایستند) ----------
  claimSpot(shelfId, agent) {
    const sh = this.world.shelves[shelfId];
    const n = sh && sh.shopSpots ? sh.shopSpots.length : 0;
    for (let i = 0; i < n; i++) {
      const key = `${shelfId}#${i}`;
      if (!this.spotClaims.has(key)) {
        this.spotClaims.set(key, agent);
        return i;
      }
    }
    return -1;
  }
  releaseSpot(shelfId, index) {
    if (index >= 0) this.spotClaims.delete(`${shelfId}#${index}`);
  }
  releaseAllSpots(agent) {
    for (const [key, who] of [...this.spotClaims.entries()]) if (who === agent) this.spotClaims.delete(key);
  }

  // ---------- صف صندوق ----------
  joinQueue(agent) {
    if (!this.queue.includes(agent)) this.queue.push(agent);
    return this.queue.indexOf(agent);
  }
  leaveQueue(agent) {
    const i = this.queue.indexOf(agent);
    if (i >= 0) this.queue.splice(i, 1);
    if (this.paying === agent) this.paying = null;
  }
  queueSlot(agent) {
    const i = this.queue.indexOf(agent);
    if (i < 0) return REGISTER.pay;
    if (i < REGISTER.queue.length) return REGISTER.queue[i];
    return REGISTER.spill[(i - REGISTER.queue.length) % REGISTER.spill.length];
  }
}

// =============================================================
//  یک مشتری
// =============================================================
class CustomerAgent {
  static uid = 0;
  constructor(sim) {
    this.sim = sim;
    this.gone = false;
    this.radius = AGENT_RADIUS;
    this.tweens = new Tweens();
    this.bagScale = 0;
    this.path = null;
    this.pathIndex = 0;
    this.walkTarget = null;

    // شخصیت
    const kind = Math.random();
    this.kind = kind < 0.14 ? 'kid' : kind > 0.86 ? 'elder' : 'adult';
    this.uid = ++CustomerAgent.uid;
    const person = buildPerson({
      scale: this.kind === 'kid' ? 0.74 + Math.random() * 0.08 : this.kind === 'elder' ? 0.95 : 1,
    });
    this.person = person;
    this.group = person.group;
    this.parts = person.parts;
    this.speed =
      (this.kind === 'kid' ? 1.14 : this.kind === 'elder' ? 0.62 : 1) * (0.8 + Math.random() * 0.22);
    this.patience = 14 + Math.random() * 14;
    this.generosity = 0.9 + Math.random() * 0.25;
    this.walkSpeedT = 0;
    this.poseExtra = null;

    this.pos = new THREE.Vector3(ENTRANCE.spawn.x + jx(0.5), 0, ENTRANCE.spawn.z + jx(0.5));
    this.group.position.copy(this.pos);
    this.face = Math.PI - jx(0.4);
    this.group.rotation.y = this.face;
    this.walkPhase = Math.random() * 6;
    this.t = Math.random() * 10;
    this.greet = Math.random() < 0.35 ? 1 : 0;

    // کالاهای موردعلاقه (۱ تا ۳ قلم متفاوت)
    const ids = PRODUCTS.map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    this.wants = ids.slice(0, 1 + Math.floor(Math.random() * 3));
    this.wantIndex = 0;
    this.basket = [];
    this.spotIndex = -1;
    this.shelfId = null;
    this.queueIndex = -1;
    this.waitTime = 0;
    this.moodCooldown = 0;
    this.stuckT = 0;
    this.lastMood = '';
    this.setState('toDoor');
  }

  get basketCount() {
    return this.basket.length;
  }

  // ---------------- وضعیت‌ها ----------------
  setState(name) {
    this.state = name;
    this.stateT = 0;
    this.path = null;
    this.pathIndex = 0;
    this.enterState();
  }

  enterState() {
    switch (this.state) {
      case 'toDoor':
        this.setPath(ENTRANCE.doorOutside);
        break;
      case 'enterShop':
        this.setPath({ x: ENTRANCE.doorInside.x + jx(0.25), z: ENTRANCE.doorInside.z });
        break;
      case 'toShelf': {
        const id = this.wants[this.wantIndex];
        if (!id) {
          this.sim.joinQueue(this);
          this.queueIndex = this.sim.queue.indexOf(this);
          this.setState('toQueue');
          return;
        }
        const idx = this.sim.claimSpot(id, this);
        if (idx < 0) {
          this.setState('waitSpot');
          return;
        }
        this.spotIndex = idx;
        this.shelfId = id;
        const spot = this.sim.world.shelves[id].shopSpots[idx];
        this.setPath(spot);
        break;
      }
      case 'look': {
        const sh = this.sim.world.shelves[this.shelfId];
        this.faceTarget = Math.atan2(sh.slot.x - this.pos.x, sh.slot.z - this.pos.z);
        this.lookDur = 0.55 + Math.random() * 0.55;
        break;
      }
      case 'reach':
        this.reachStart = this.stateT;
        break;
      case 'toQueue': {
        this.sim.joinQueue(this);
        this.queueIndex = this.sim.queue.indexOf(this);
        this.setPath(this.sim.queueSlot(this));
        break;
      }
      case 'pay': {
        const p = REGISTER.pay;
        if (!this.basket.length) {
          // دست‌خالی — نباید به صندوق می‌آمد
          this.sim.paying = null;
          this.sim.leaveQueue(this);
          this.setState('leaveShop');
          return;
        }
        this.faceTarget = p.rot;
        this.scanQueue = this.basket.slice();
        this.basket.length = 0;
        this.scanTimer = 0.55;
        this.scanTotal = 0;
        this.paid = false;
        break;
      }
      case 'leaveShop':
        this.setPath(ENTRANCE.exitHint);
        break;
      case 'exitDoor':
        this.exitStep = 0;
        this.setPath(ENTRANCE.doorInside);
        break;
      default:
        break;
    }
  }

  // ---------------- حرکت ----------------
  setPath(target) {
    this.walkTarget = target ? new THREE.Vector3(target.x, 0, target.z) : null;
    if (!this.walkTarget) {
      this.path = null;
      return false;
    }
    const nav = this.sim.world.nav;
    this.path = nav.findPath(this.pos, this.walkTarget);
    this.pathIndex = this.path ? Math.min(1, this.path.length - 1) : 0;
    this.stuckT = 0;
    return !!this.path;
  }

  /**
   * یک قدم حرکت. برمی‌گرداند: true یعنی به هدف رسیدیم.
   * مسیر A* + جداسازی از بقیه + بررسی مانع در هر قدم.
   */
  step(dt, speedScale = 1) {
    const nav = this.sim.world.nav;
    const target = this.walkTarget;
    if (!target) return true;

    // اگر مسیر نداریم (یا تمام شد) مستقیم به سمت هدف برو — با بررسی مانع
    let dirX;
    let dirZ;
    let dist;
    const hasPath = this.path && this.pathIndex < this.path.length;
    let wp = hasPath ? this.path[this.pathIndex] : target;
    while (hasPath && this.pathIndex < this.path.length - 1) {
      const dx = wp.x - this.pos.x;
      const dz = wp.z - this.pos.z;
      if (Math.hypot(dx, dz) < 0.16) {
        this.pathIndex++;
        wp = this.path[this.pathIndex];
      } else break;
    }
    let dx = wp.x - this.pos.x;
    let dz = wp.z - this.pos.z;
    dist = Math.hypot(dx, dz);
    if (dist < 0.13) {
      if (this.path && this.pathIndex < this.path.length - 1) {
        this.pathIndex++;
        return false;
      }
      return true; // رسیدیم
    }
    dirX = dx / dist;
    dirZ = dz / dist;

    // جداسازی از مشتری‌های دیگر + از «بدنِ بازیکن» (نمای اول‌شخص):
    // مشتری‌ها دور بازیکن می‌چرخند و از توی او رد نمی‌شوند.
    const others = this.sim.active.filter((o) => o !== this && !o.gone);
    const po = this.sim.world && this.sim.world.playerObstacle;
    if (po && po.active) others.push(po);
    const sep = separation(this.pos, this.radius, others, 1.05);
    let vx = dirX + sep.x * 0.8;
    let vz = dirZ + sep.z * 0.8;
    // اگر کسی روبه‌رویم می‌آید، کمی راه بدهم (نه اینکه تنه بزنیم)
    let yieldScale = 1;
    for (const o of others) {
      const ox = o.pos.x - this.pos.x;
      const oz = o.pos.z - this.pos.z;
      const d = Math.hypot(ox, oz);
      if (d > 0.55 || d < 1e-4) continue;
      const toward = (ox / d) * dirX + (oz / d) * dirZ;
      if (toward > 0.6) yieldScale = Math.min(yieldScale, 0.35 + (d / 0.55) * 0.5);
    }
    const vlen = Math.hypot(vx, vz);
    if (vlen > 1e-5) {
      vx /= vlen;
      vz /= vlen;
    } else {
      vx = dirX;
      vz = dirZ;
    }

    const move = Math.min(dist, this.speed * speedScale * yieldScale * dt);
    const tryMove = (nx, nz) => {
      if (!nav.isFree(nx, nz)) return false;
      this.pos.x = nx;
      this.pos.z = nz;
      return true;
    };
    const px = this.pos.x;
    const pz = this.pos.z;
    if (!tryMove(this.pos.x + vx * move, this.pos.z + vz * move)) {
      if (!tryMove(this.pos.x + vx * move, this.pos.z)) {
        if (!tryMove(this.pos.x, this.pos.z + vz * move)) {
          this.stuckT += dt;
          if (this.stuckT > 0.35) {
            this.setPath(this.walkTarget);
            this.stuckT = 0;
          }
        }
      }
    }

    // رفع هم‌پوشانی (هیچ‌وقت داخل بدن هم نمی‌روند) — فقط کسی که راه می‌رود کنار می‌کشد
    if (move > 1e-4) {
      const bx = this.pos.x;
      const bz = this.pos.z;
      resolveOverlap(this.pos, this.radius, others);
      if (!nav.isFree(this.pos.x, this.pos.z)) {
        // اگر کنار کشیدن به مانع خورد، فقط یکی از محورها را امتحان کن
        if (nav.isFree(this.pos.x, bz)) this.pos.z = bz;
        else if (nav.isFree(bx, this.pos.z)) this.pos.x = bx;
        else {
          this.pos.x = bx;
          this.pos.z = bz;
        }
      }
    }

    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz) > 1e-4;
    if (moved) {
      this.face = turnToward(this.face, Math.atan2(dirX, dirZ), dt * 6.5);
      this.walkPhase += dt * 7.6 * this.speed * clamp01(this.walkSpeedT);
      this.walkSpeedT = lerp(this.walkSpeedT, 1, Math.min(1, dt * 8));
    } else {
      this.walkSpeedT = lerp(this.walkSpeedT, 0, Math.min(1, dt * 6));
    }
    return false;
  }

  // ---------------- برداشتن کالا با دست ----------------
  peekShelfItem(shelfId) {
    const sh = this.sim.world.shelves[shelfId];
    if (!sh) return _v1.set(0, 0.8, 0);
    const vis = sh.items.filter((it) => it.visible);
    const src = vis.length ? vis[vis.length - 1] : null;
    if (src && src.parent) {
      src.updateWorldMatrix(true, false);
      return src.getWorldPosition(_v1);
    }
    const spot = sh.shopSpots[0];
    return _v1.set(spot.x + (sh.slot.x - spot.x) * 0.7, 0.82, spot.z + (sh.slot.z - spot.z) * 0.7);
  }

  grabItem(id) {
    const st = this.sim.state;
    if ((st.inventory[id] || 0) <= 0) return null;
    st.inventory[id]--;
    const taken = takeShelfItem(this.sim.world, id);
    if (!taken) return null;
    const entry = { id, mesh: taken.mesh, price: st.salePrice[id], flying: true, uid: ++CustomerAgent.uid };
    this.basket.push(entry);
    refreshShelves(this.sim.world, st.inventory);
    sfx.grab();
    sparkle(this.sim.world, taken.mesh, 0xfff0a0, 5, 0.2);
    return entry;
  }

  /** کالا از دست به سبد خرید (با قوس) */
  moveItemToBasket(entry) {
    const mesh = entry.mesh;
    const hand = this.parts.handR;
    const slot = BASKET_SLOTS[Math.min(this.basket.length - 1, BASKET_SLOTS.length - 1)];
    hand.attach(mesh);
    const from = mesh.position.clone();
    this.parts.basketItems.updateWorldMatrix(true, false);
    const slotWorld = _v2.copy(slot).applyMatrix4(this.parts.basketItems.matrixWorld);
    hand.updateWorldMatrix(true, false);
    const to = hand.worldToLocal(slotWorld.clone());
    const startScale = mesh.scale.x;
    this.tweens.add({
      dur: 0.32,
      ease: easeOutCubic,
      onUpdate: (k) => {
        arcLerp(mesh.position, from, to, k, 0.07);
        mesh.scale.setScalar(lerp(startScale, 0.66, k));
      },
      onDone: () => {
        this.parts.basketItems.attach(mesh);
        mesh.position.copy(slot);
        mesh.rotation.set(0, Math.random() * 0.7 - 0.35, 0);
        entry.flying = false;
        this.tweens.add({
          dur: 0.26,
          ease: easeOutBack,
          onUpdate: (k) => mesh.scale.setScalar(0.66 * (0.75 + 0.25 * k)),
        });
        sfx.basket();
      },
    });
  }

  /** پرداخت فوری (پایان روز) — همان منطق پول، بدون انیمیشن */
  payNow() {
    // نکته: اگر روز وسطِ اسکن تمام شود، کالاهای روی نوار هم باید
    // پرداخت شوند — وگرنه جنس از قفسه کم شده بود ولی پولش نمی‌آمد!
    const items = this.basket.concat(this.scanQueue || []);
    if (!items.length) return 0;
    let rev = 0;
    for (const b of items) {
      if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
      rev += b.price;
    }
    const sold = items.length;
    this.basket.length = 0;
    this.scanQueue = [];
    this.commitSale(sold, rev);
    return rev;
  }

  /** تنها جایی که پول به حساب می‌آید */
  commitSale(sold, rev) {
    const st = this.sim.state;
    st.money += rev;
    this.sim.stats.itemsSold += sold;
    this.sim.stats.revenue += rev;
    this.sim.stats.buyers += 1;
    this.sim.stats.happy += 1;
    this.bagScale = Math.min(1.3, 0.65 + sold * 0.22);
    if (this.sim.hooks.onSale) this.sim.hooks.onSale(sold, rev, this);
  }

  /** انیمیشن اسکن: کالا از سبد → نوار اسکن → بوق → کیسه */
  scanNext() {
    const entry = this.scanQueue.shift();
    if (!entry) return false;
    this.scanTotal += entry.price;
    const world = this.sim.world;
    const mesh = entry.mesh;
    const c = REGISTER.counter;
    const i = this.scannedCount = (this.scannedCount || 0) + 1;
    world.scene.attach(mesh);
    const from = mesh.position.clone();
    const belt = _v2.set(c.x - 0.34 + (i % 3) * 0.18, 0.99, c.z + (i % 2 ? 0.08 : -0.06)).clone();
    const bag = _v3.set(c.x + 0.52, 0.86, c.z + 0.02).clone();
    this.tweens.add({
      dur: 0.3,
      ease: easeOutCubic,
      onUpdate: (k) => {
        arcLerp(mesh.position, from, belt, k, 0.16);
        mesh.rotation.y += 0.22;
      },
      onDone: () => {
        sfx.beep();
        world.cashierScan = 1;
        if (world.cashierApi) {
          world.cashierApi.sync();
          // ⚠️ target باید وکتور «تازه» باشد — اگر بافر مشترک ماژول را
          // بدهیم، اولین برداشتنِ کالا توسط مشتری‌ها همان بافر را بازنویسی
          // می‌کند و دستِ متصدی وسط روز به سمت قفسه‌ها می‌رود!
          world.cashierReach = { k: 1, target: world.cashierApi.toUpperLocal(belt) };
        }
        if (world.drawRegister) {
          const item = PRODUCTS.find((p) => p.id === entry.id);
          world.drawRegister(['مجموع', `${Math.round(this.scanTotal)} $`, item ? item.name : '']);
        }
        this.tweens.add({
          dur: 0.24,
          ease: easeOutCubic,
          onUpdate: (k) => {
            arcLerp(mesh.position, belt, bag, k, 0.12);
            mesh.scale.setScalar(lerp(0.66, 0.02, k));
          },
          onDone: () => {
            if (mesh.parent) mesh.parent.remove(mesh);
          },
        });
      },
    });
    return true;
  }

  completePayment() {
    this.commitSale(Math.max(1, this.scannedCount || 1), this.scanTotal);
    // نکته: کالاها همان لحظهٔ برداشتن از موجودی کم شده‌اند؛ این‌جا فقط پول حساب می‌شود
    sfx.coin();
    floatText(this.sim.world, `+${Math.round(this.scanTotal)} $`, REGISTER_POS, { color: '#a8f0a0' });
    sparkle(this.sim.world, REGISTER_POS, 0xa8f0a0, 10, 0.3);
    this.showMood(Math.random() < 0.5 ? '🤩' : '😊', true);
    this.scannedCount = 0;
  }

  showMood(emoji, force = false) {
    if (!force && (this.moodCooldown > 0 || this.lastMood === emoji)) return;
    this.moodCooldown = 3.5;
    this.lastMood = emoji;
    moodBubble(this.sim.world, this.parts.head, emoji, 1.3);
  }

  dispose() {
    this.sim.releaseAllSpots(this);
    this.sim.leaveQueue(this);
    for (const b of this.basket) if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
    this.basket.length = 0;
    (this.scanQueue || []).forEach((b) => b.mesh.parent && b.mesh.parent.remove(b.mesh));
    this.scanQueue = [];
    if (this.group.parent) this.group.parent.remove(this.group);
  }

  /** بعد از هر قفسه: آزادکردن جا و رفتن به کالای بعدی */
  finishShelf() {
    if (this.shelfId != null && this.spotIndex >= 0) this.sim.releaseSpot(this.shelfId, this.spotIndex);
    this.spotIndex = -1;
    this.shelfId = null;
    this.poseExtra = null;
    this.wantIndex++;
    if (this.wantIndex < this.wants.length) {
      this.setState('toShelf');
      return;
    }
    // دست‌خالی: صف صندوق معنی ندارد → مستقیم بیرون
    if (!this.basket.length) {
      this.showMood(this.lastMood === '😠' ? '😠' : '😐');
      this.setState('leaveShop');
      return;
    }
    this.sim.joinQueue(this);
    this.queueIndex = this.sim.queue.indexOf(this);
    this.setState('toQueue');
  }

  // ---------------- حلقه ----------------
  update(dt) {
    this.t += dt;
    this.stateT += dt;
    this.moodCooldown = Math.max(0, this.moodCooldown - dt);
    this.greet = Math.max(0, this.greet - dt * 1.5);
    this.tweens.update(dt);
    this.poseExtra = this.poseExtra || null;

    const st = this.sim.state;
    const world = this.sim.world;

    switch (this.state) {
      case 'toDoor': {
        if (this.step(dt)) this.setState('enterShop');
        break;
      }
      case 'enterShop': {
        if (this.step(dt)) this.setState('toShelf');
        break;
      }
      case 'toShelf': {
        if (this.step(dt)) {
          const sh = world.shelves[this.shelfId];
          this.face = turnToward(
            this.face,
            Math.atan2(sh.slot.x - this.pos.x, sh.slot.z - this.pos.z),
            dt * 8
          );
          this.setState('look');
        }
        break;
      }
      case 'waitSpot': {
        // قفسه شلوغ است: کمی این‌طرف‌تر صبر کن، بعد دوباره امتحان کن
        this.walkSpeedT = lerp(this.walkSpeedT, 0, Math.min(1, dt * 6));
        this.poseExtra = { lookYaw: Math.sin(this.t * 1.4) * 0.4 };
        if (this.stateT > 1.1 + Math.random() * 0.8) {
          const id = this.wants[this.wantIndex];
          const idx = this.sim.claimSpot(id, this);
          if (idx >= 0) {
            this.spotIndex = idx;
            this.shelfId = id;
            this.setPath(world.shelves[id].shopSpots[idx]);
            this.state = 'toShelf';
            this.stateT = 0;
          } else if (this.stateT > 5) {
            this.showMood('😕');
            this.wantIndex++;
            this.setState(this.wantIndex >= this.wants.length ? 'toQueue' : 'toShelf');
          }
        }
        break;
      }
      case 'look': {
        const sh = world.shelves[this.shelfId];
        if (!sh) {
          this.finishShelf();
          break;
        }
        this.face = turnToward(
          this.face,
          Math.atan2(sh.slot.x - this.pos.x, sh.slot.z - this.pos.z),
          dt * 7
        );
        this.poseExtra = {
          lookYaw: 0,
          lookPitch: 0.22 + Math.sin(this.t * 2.2) * 0.06,
          lean: 0.1,
          fingers: 0.15,
        };
        this.walkSpeedT = lerp(this.walkSpeedT, 0, Math.min(1, dt * 8));
        if (this.stateT > this.lookDur) {
          const id = this.shelfId;
          const stock = st.inventory[id] || 0;
          if (stock <= 0) {
            this.showMood('😯');
            this.finishShelf();
            break;
          }
          const chance = Math.min(
            1,
            buyChance(st.market[id], st.salePrice[id]) *
              (this.generosity + (st.generous || 0)) *
              (1 - (st.toughness || 0))
          );
          if (Math.random() < chance) {
            const profit = st.salePrice[id] - st.market[id];
            if (profit <= 0) this.showMood('🤩');
            else if (profit <= 2) this.showMood('🙂');
            this.setState('reach');
          } else {
            this.showMood(st.salePrice[id] - st.market[id] > 3 ? '😠' : '😐');
            this.finishShelf();
          }
        }
        break;
      }
      case 'reach': {
        const itemWorld = this.peekShelfItem(this.shelfId);
        this.person.sync();
        const local = this.person.toUpperLocal(itemWorld, _v1).clone();
        const k = clamp01(this.stateT / 0.5);
        const itemY = itemWorld.y;
        this.poseExtra = {
          lean: 0.34 * k,
          crouch: clamp01((0.9 - itemY) / 0.62) * k,
          lookPitch: (0.9 - itemY) * 0.5 * k,
          fingers: k < 0.72 ? 0.05 : 0.95,
          reach: { side: 'R', k: easeOutCubic(k), target: local },
        };
        if (this.stateT >= 0.5) {
          const entry = this.grabItem(this.shelfId);
          if (entry) {
            this.moveItemToBasket(entry);
            this.setState('hold');
          } else {
            this.showMood('😕');
            this.finishShelf();
          }
        }
        break;
      }
      case 'hold': {
        // دست کالا را گرفته و به سمت سبد می‌آورد
        const held = this.basket.find((b) => b.flying);
        const itemWorld = held ? held.mesh.getWorldPosition(_v2) : this.peekShelfItem(this.shelfId);
        this.person.sync();
        const local = this.person.toUpperLocal(itemWorld, _v1).clone();
        const k = clamp01(this.stateT / 0.45);
        this.poseExtra = {
          lean: 0.2 * (1 - k * 0.6),
          fingers: 0.95,
          reach: { side: 'R', k: 1 - easeOutCubic(k) * 0.8, target: local },
        };
        this.walkSpeedT = lerp(this.walkSpeedT, 0, Math.min(1, dt * 8));
        if (this.stateT > 0.45) this.finishShelf();
        break;
      }
      case 'toQueue': {
        this.sim.joinQueue(this);
        const idx = this.sim.queue.indexOf(this);
        if (idx !== this.queueIndex || (!this.path && !this.walkTarget)) {
          this.queueIndex = idx;
          this.setPath(this.sim.queueSlot(this));
        }
        const nearPay =
          Math.hypot(this.pos.x - REGISTER.pay.x, this.pos.z - REGISTER.pay.z) < 0.75;
        if (idx === 0 && !this.sim.paying && nearPay && this.stateT > 0.15) {
          this.sim.paying = this;
          this.setState('pay');
          break;
        }
        this.step(dt);
        break;
      }
      case 'pay': {
        const p = REGISTER.pay;
        this.face = turnToward(this.face, p.rot, dt * 7);
        this.poseExtra = { lean: 0.05, holdBasket: 0.4, lookPitch: 0.08 };
        // چند قدم ریز تا سر میز
        if (this.stateT < 0.5) {
          const dx = p.x - this.pos.x;
          const dz = p.z - this.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.1) {
            const step = Math.min(d, this.speed * 0.6 * dt);
            const nx = this.pos.x + (dx / d) * step;
            const nz = this.pos.z + (dz / d) * step;
            if (world.nav.isFree(nx, nz)) {
              this.pos.x = nx;
              this.pos.z = nz;
              this.walkSpeedT = 0.55;
              this.walkPhase += dt * 6;
            }
          }
          break;
        }
        this.walkSpeedT = lerp(this.walkSpeedT, 0, Math.min(1, dt * 7));
        this.scanTimer -= dt;
        if (this.scanTimer > 0) break;
        if (this.scanQueue.length) {
          this.scanNext();
          this.scanTimer = 0.52;
        } else if (!this.paid) {
          this.paid = true;
          this.scanTimer = 0.42;
        } else {
          this.completePayment();
          world.cashierScan = 0;
          world.cashierReach = { k: 0, target: new THREE.Vector3(0, 0.2, 0.35) };
          this.sim.paying = null;
          this.sim.leaveQueue(this);
          this.setState('leaveShop');
        }
        break;
      }
      case 'leaveShop': {
        if (this.step(dt)) this.setState('exitDoor');
        break;
      }
      case 'exitDoor': {
        const targets = [ENTRANCE.doorInside, ENTRANCE.doorOutside, ENTRANCE.leave];
        const i = Math.min(this.exitStep, targets.length - 1);
        const t = targets[i];
        if (!this.walkTarget || this.targetKey !== i) {
          this.targetKey = i;
          this.setPath({ x: t.x + jx(0.25), z: t.z + jx(0.2) });
        }
        if (this.step(dt)) {
          this.exitStep++;
          this.targetKey = -1;
          if (this.exitStep >= targets.length) {
            this.gone = true;
            this.dispose();
          }
        }
        break;
      }
      default:
        break;
    }

    // انیمیشن نهایی بدن + جای‌گذاری در صحنه
    this.person.pose(
      Object.assign(
        {
          t: this.t,
          phase: this.walkPhase,
          walk: clamp01(this.walkSpeedT),
          speed: this.walkSpeedT,
          lean: 0,
          holdBasket: 1,
          fingers: 0.5,
          greet: this.greet,
          lookYaw: 0,
          lookPitch: 0,
          bagScale: this.bagScale,
        },
        this.poseExtra || {}
      )
    );
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.face;
    // هر وضعیتی که поз خاص می‌خواهد، خودش هر فریم آن را می‌سازد
    this.poseExtra = null;

    // محافظِ گیرکردن: هیچ مشتری‌ای برای همیشه وسط راه نمی‌ماند
    if (WALK_STATES.has(this.state) && this.stateT > 22) {
      if (this.state === 'toShelf' || this.state === 'waitSpot') {
        this.finishShelf();
      } else if (this.state === 'leaveShop' || this.state === 'exitDoor') {
        this.gone = true;
        this.dispose();
      } else if (this.state === 'toQueue') {
        // نتوانست سرِ صف برسد: از صف بیرون بیا و راه بیفت
        this.sim.leaveQueue(this);
        this.setState('leaveShop');
      } else {
        this.setState(this.basket.length ? 'toQueue' : 'leaveShop');
      }
    }
  }
}
