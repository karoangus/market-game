// =============================================================
//  nav.js — مسیریابی مشتری‌ها (شبکه + A* + نرم‌کردن مسیر)
//
//  چرا لازم شد؟ قبلاً مشتری مستقیم به سمت هدف می‌رفت (خط راست)،
//  یعنی از توی دیوار، قفسه، میز حساب و از بدن مشتری‌های دیگر رد
//  می‌شد. حالا:
//    ۱) نقشهٔ فروشگاه به یک شبکهٔ خانه‌خانه (۲۰ سانتی) تبدیل می‌شود
//       و همهٔ موانع (دیوار، قفسه، میز، درخت) داخلش «بسته» می‌شوند.
//    ۲) A* کوتاه‌ترین مسیر را دور موانع پیدا می‌کند.
//    ۳) مسیر با «کشیدن ریسمان» نرم می‌شود تا مشتری زیگزاگ نرود.
//    ۴) هنگام حرکت، فاصلهٔ بدنی با مشتری‌های دیگر رعایت می‌شود
//       (جداسازی) — پس هیچ‌کس از توی کسی رد نمی‌شود.
// =============================================================
import * as THREE from 'three';
import { NAV, AGENT_RADIUS, buildObstacles, walkableSpots } from './layout.js';

// ۸ جهت حرکت (شامل قطری‌ها) با هزینهٔ اکتایل
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

/** صف اولویت کوچک برای A* (کمترین f اول بیرون می‌آید) */
class MinHeap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }
  get size() {
    return this.keys.length;
  }
  push(key, val) {
    const k = this.keys;
    const v = this.vals;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop();
    const lastV = v.pop();
    if (k.length) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < k.length && k[l] < k[s]) s = l;
        if (r < k.length && k[r] < k[s]) s = r;
        if (s === i) break;
        [k[s], k[i]] = [k[i], k[s]];
        [v[s], v[i]] = [v[i], v[s]];
        i = s;
      }
    }
    return top;
  }
  clear() {
    this.keys.length = 0;
    this.vals.length = 0;
  }
}

export class NavGrid {
  constructor({ cell = NAV.cell, minX = NAV.minX, maxX = NAV.maxX, minZ = NAV.minZ, maxZ = NAV.maxZ } = {}) {
    this.cell = cell;
    this.minX = minX;
    this.minZ = minZ;
    this.nx = Math.max(2, Math.round((maxX - minX) / cell));
    this.nz = Math.max(2, Math.round((maxZ - minZ) / cell));
    this.maxX = minX + this.nx * cell;
    this.maxZ = minZ + this.nz * cell;
    this.blocked = new Uint8Array(this.nx * this.nz);
    this.cost = new Float32Array(this.nx * this.nz).fill(1);
    this._g = new Float32Array(this.nx * this.nz);
    this._f = new Float32Array(this.nx * this.nz);
    this._came = new Int32Array(this.nx * this.nz);
    this._state = new Uint8Array(this.nx * this.nz); // ۰ آزاد، ۱ باز، ۲ بسته
    this._heap = new MinHeap();
    this.build();
  }

  // ---------- ساخت شبکه ----------
  build(obstacles = buildObstacles()) {
    for (const o of obstacles) this.blockBox(o.x0, o.x1, o.z0, o.z1, AGENT_RADIUS);
    // نقاط کلیدی (جلوی قفسه‌ها، صندوق، در) همیشه باید قابل‌ایستادن باشند؛
    // هالهٔ مانع‌ها ممکن است روی آن‌ها بیفتد، پس صریحاً آزادشان می‌کنیم.
    for (const sp of walkableSpots()) this.carve(sp.x, sp.z);
    this.refreshCosts();
  }

  idx(cx, cz) {
    return cz * this.nx + cx;
  }
  inside(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < this.nx && cz < this.nz;
  }
  cellOf(x, z) {
    return {
      cx: Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.minX) / this.cell))),
      cz: Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell))),
    };
  }
  centerX(cx) {
    return this.minX + (cx + 0.5) * this.cell;
  }
  centerZ(cz) {
    return this.minZ + (cz + 0.5) * this.cell;
  }

  /** بستن خانه‌هایی که مرکزشان داخل جعبه (با هالهٔ pad) است */
  blockBox(x0, x1, z0, z1, pad = 0) {
    const a = this.cellOf(x0 - pad, z0 - pad);
    const b = this.cellOf(x1 + pad, z1 + pad);
    for (let cz = a.cz; cz <= b.cz; cz++)
      for (let cx = a.cx; cx <= b.cx; cx++) {
        const px = this.centerX(cx);
        const pz = this.centerZ(cz);
        if (px >= x0 - pad && px <= x1 + pad && pz >= z0 - pad && pz <= z1 + pad)
          this.blocked[this.idx(cx, cz)] = 1;
      }
    return this;
  }

  /** آزادکردن یک خانه (برای نقاط کلیدی مثل جای پرداخت یا جای ایستادن جلوی قفسه) */
  carve(x, z) {
    const { cx, cz } = this.cellOf(x, z);
    if (this.inside(cx, cz)) this.blocked[this.idx(cx, cz)] = 0;
    return this;
  }

  blockedAt(x, z) {
    const { cx, cz } = this.cellOf(x, z);
    if (!this.inside(cx, cz)) return true;
    return this.blocked[this.idx(cx, cz)] === 1;
  }

  /** آیا نقطه‌ای (با شعاع بدنه) قابل‌ایستادن است؟ */
  isFree(x, z) {
    return !this.blockedAt(x, z);
  }

  /** نزدیک‌ترین خانهٔ آزاد به یک نقطه (برای هدف‌هایی که هالهٔ مانع رویشان افتاده) */
  nearestFree(cx, cz, maxRing = 6) {
    if (this.inside(cx, cz) && !this.blocked[this.idx(cx, cz)]) return { cx, cz };
    for (let r = 1; r <= maxRing; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (this.inside(nx, nz) && !this.blocked[this.idx(nx, nz)]) return { cx: nx, cz: nz };
        }
      }
    }
    return null;
  }

  /** هزینهٔ عبور از هر خانه: کنارِ مانع بودن گران‌تر است تا مسیر از وسط راهرو برود */
  refreshCosts() {
    for (let cz = 0; cz < this.nz; cz++)
      for (let cx = 0; cx < this.nx; cx++) {
        const i = this.idx(cx, cz);
        if (this.blocked[i]) {
          this.cost[i] = Infinity;
          continue;
        }
        let free = 0;
        for (const [dx, dz] of DIRS) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.inside(nx, nz) || this.blocked[this.idx(nx, nz)]) continue;
          free++;
        }
        const openness = free / DIRS.length; // ۰ = گوشهٔ تنگ، ۱ = وسط راهرو
        this.cost[i] = 1 + (1 - openness) * 0.9;
      }
  }

  /** آیا خط راست بین دو نقطه از روی مانع نمی‌گذرد؟ */
  isClearLine(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return this.isFree(ax, az);
    const step = Math.max(this.cell * 0.6, 0.1);
    const n = Math.ceil(len / step);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!this.isFree(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }

  /**
   * کوتاه‌ترین مسیر از `from` به `to`.
   * @returns {THREE.Vector3[]|null} فهرست نقاط مسیر (y=0) یا null اگر راهی نبود
   */
  findPath(from, to) {
    // هدف بیرون از محدودهٔ شبکه → مسیری وجود ندارد
    if (to.x < this.minX || to.x > this.maxX || to.z < this.minZ || to.z > this.maxZ) return null;
    const start = this.cellOf(from.x, from.z);
    let goal = this.cellOf(to.x, to.z);
    const startFree = this.nearestFree(start.cx, start.cz, 4);
    if (!startFree) return null;
    const goalFree = this.nearestFree(goal.cx, goal.cz, 8);
    if (!goalFree) return null;
    goal = goalFree;

    const sIdx = this.idx(startFree.cx, startFree.cz);
    const gIdx = this.idx(goal.cx, goal.cz);
    if (sIdx === gIdx) return [new THREE.Vector3(to.x, 0, to.z)];

    const { _g: g, _f: f, _came: came, _state: state, _heap: heap } = this;
    g.fill(Infinity);
    f.fill(Infinity);
    came.fill(-1);
    state.fill(0);
    heap.clear();

    g[sIdx] = 0;
    f[sIdx] = this.heuristic(startFree.cx, startFree.cz, goal.cx, goal.cz);
    heap.push(f[sIdx], sIdx);
    state[sIdx] = 1;

    let found = false;
    let guard = 0;
    while (heap.size && guard++ < 200000) {
      const cur = heap.pop();
      if (state[cur] === 2) continue;
      state[cur] = 2;
      if (cur === gIdx) {
        found = true;
        break;
      }
      const cx = cur % this.nx;
      const cz = (cur - cx) / this.nx;
      for (const [dx, dz, w] of DIRS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!this.inside(nx, nz)) continue;
        const ni = this.idx(nx, nz);
        if (this.blocked[ni]) continue;
        // در حرکت قطری، نباید از گوشهٔ مانع رد شد
        if (dx && dz && (this.blocked[this.idx(cx + dx, cz)] || this.blocked[this.idx(cx, cz + dz)])) continue;
        const tentative = g[cur] + w * this.cost[ni];
        if (tentative < g[ni]) {
          g[ni] = tentative;
          f[ni] = tentative + this.heuristic(nx, nz, goal.cx, goal.cz);
          came[ni] = cur;
          state[ni] = 1;
          heap.push(f[ni], ni);
        }
      }
    }
    if (!found) return null;

    // بازسازی مسیر + نرم‌کردن (کشیدن ریسمان)
    const cells = [];
    let cur = gIdx;
    while (cur !== -1) {
      const cx = cur % this.nx;
      const cz = (cur - cx) / this.nx;
      cells.push({ x: this.centerX(cx), z: this.centerZ(cz) });
      cur = came[cur];
    }
    cells.reverse();
    const pts = [new THREE.Vector3(from.x, 0, from.z)];
    for (const c of cells) pts.push(new THREE.Vector3(c.x, 0, c.z));
    if (this.isFree(to.x, to.z)) pts.push(new THREE.Vector3(to.x, 0, to.z));
    return smoothPath(this, pts);
  }

  heuristic(ax, az, bx, bz) {
    const dx = Math.abs(ax - bx);
    const dz = Math.abs(az - bz);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  }

  /** برای تست/دیباگ: فهرست نقاط کلیدی که باید قابل‌دسترس باشند */
  reachableFrom(from, to) {
    const p = this.findPath(from, to);
    return !!p && p.length > 1;
  }
}

/**
 * نرم‌کردن مسیر: از هر نقطه، دورترین نقطه‌ای که خطش باز است را
 * انتخاب کن. نتیجه: مشتری به‌جای زیگزاگ خانه‌خانه، مورب و طبیعی می‌رود.
 */
export function smoothPath(grid, pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    for (; j > i + 1; j--) {
      if (grid.isClearLine(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) break;
    }
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/**
 * جداسازی: بردار دفع از مشتری‌های نزدیک را حساب می‌کند تا کسی
 * از توی بدن دیگری رد نشود.
 * @param {{x:number,z:number}} pos موقعیت من
 * @param {number} radius شعاع بدن من
 * @param {Array<{pos:{x:number,z:number}, radius:number}>} others
 * @param {number} range تا این فاصله حساس باش
 */
export function separation(pos, radius, others, range = 0.95) {
  let sx = 0;
  let sz = 0;
  for (const o of others) {
    const dx = pos.x - o.pos.x;
    const dz = pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > range * range) continue;
    const d = Math.sqrt(d2) || 0.0001;
    const want = radius + o.radius + 0.05;
    const push = Math.max(0, (range - d) / range) * (d < want ? 1.9 : 0.75);
    sx += (dx / d) * push;
    sz += (dz / d) * push;
  }
  return { x: sx, z: sz };
}

/**
 * اصلاح سخت هم‌پوشانی: کسی که راه می‌رود کاملاً از روی دیگری کنار
 * می‌کشد (نه نصفه) تا مطمئن شویم هیچ‌وقت دو بدن داخل هم نمی‌روند.
 */
export function resolveOverlap(pos, radius, others, iterations = 3) {
  for (let k = 0; k < iterations; k++) {
    let moved = false;
    for (const o of others) {
      let dx = pos.x - o.pos.x;
      let dz = pos.z - o.pos.z;
      const need = radius + o.radius;
      let d = Math.hypot(dx, dz);
      if (d >= need) continue;
      if (d < 1e-4) {
        // دقیقاً روی هم: یک جهت ثابت انتخاب کن تا قفل نشوند
        dx = (o.pos.x * 7919) % 1 - 0.5 || 0.5;
        dz = (o.pos.z * 104729) % 1 - 0.5 || 0.5;
        d = Math.hypot(dx, dz) || 1;
      }
      const push = need - d + 0.006;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
      moved = true;
    }
    if (!moved) break;
  }
  return pos;
}
