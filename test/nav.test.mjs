// =============================================================
//  test/nav.test.mjs — تست‌های مسیریابی و حرکت مشتری‌ها
//  اجرا: node test/nav.test.mjs
//
//  این تست‌ها همان سه ایرادی را می‌سنجند که بازیکن گزارش داده بود:
//    ۱) مشتری از توی دیوار/قفسه/میز صندوق رد نشود
//    ۲) مشتری از توی بدن مشتری دیگر رد نشود
//    ۳) کالا واقعاً با دست برداشته شود و به سبد خرید برود
// =============================================================
import * as THREE from 'three';
import {
  ROOM,
  DOOR,
  SHELF_SLOTS,
  REGISTER,
  ENTRANCE,
  NAV,
  AGENT_RADIUS,
  TREES,
  LAMP_POST,
  shelfAABB,
  shelfShopSpots,
  buildObstacles,
  walkableSpots,
  REGISTER_POS,
  REGISTER_SPOT,
  SPAWN_POS,
  DOOR_POS,
} from '../js/layout.js';
import { NavGrid, smoothPath, separation, resolveOverlap } from '../js/nav.js';
import { PRODUCTS, GAME } from '../js/config.js';
import { createHeadlessWorld, refreshShelves } from '../js/scene3d.js';
import { newGameState } from '../js/state.js';
import { DaySimulation } from '../js/customers.js';

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('  ✗ FAIL:', msg);
  }
}

// ---------- ابزار: نمونه‌برداری از یک مسیر ----------
function samplePath(pts, step = 0.05) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  const last = pts[pts.length - 1];
  out.push({ x: last.x, z: last.z });
  return out;
}

/** آیا نقطه داخل جعبهٔ یک قفسه/میز صندوق است؟ (با هالهٔ کوچک) */
function pointInsideBox(p, b, pad = 0.02) {
  return p.x > b.x0 - pad && p.x < b.x1 + pad && p.z > b.z0 - pad && p.z < b.z1 + pad;
}

// ---------- ابزار: پروندهٔ تصادفی قابل‌تکرار ----------
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const grid = new NavGrid();

console.log('۱) هندسهٔ فروشگاه و شبکهٔ مسیریابی');
check(ROOM.w * ROOM.d === 20, 'فروشگاه ۲۰ متر مربع است');
check(SHELF_SLOTS.length >= PRODUCTS.length, 'برای هر محصول یک جایگاه قفسه هست');
check(SHELF_SLOTS.length === PRODUCTS.length, 'جایگاه قفسهٔ بی‌استفاده و بی‌صاحب نداریم');
check(NAV.cell > 0 && NAV.maxX > NAV.minX, 'محدودهٔ شبکهٔ مسیر درست است');
check(grid.nx > 10 && grid.nz > 10, `شبکه ساخته شد (${grid.nx}×${grid.nz} خانه)`);

// نقطهٔ شروع بیرون فروشگاه باید آزاد باشد و دیوار پشت باید بسته
check(grid.isFree(SPAWN_POS.x, SPAWN_POS.z), 'نقطهٔ تولد مشتری (بیرون) آزاد است');
check(!grid.isFree(0, -2.6), 'پشت دیوار فروشگاه بسته است');
check(!grid.isFree(0, 0) === false, 'وسط فروشگاه آزاد است');
check(grid.isFree(DOOR.x, 2.15), 'داخل در ورودی آزاد است');
check(!grid.isFree(-2.4, 2.6) && !grid.isFree(2.4, 2.6), 'دو طرف دیوار جلو بسته است');
check(!grid.isFree(-2.6, 0) && !grid.isFree(2.6, 0), 'دیوارهای چپ و راست بسته‌اند');

// همهٔ قفسه‌های واقعی مانع‌اند، و نقاط ایستادن جلوی آن‌ها آزاد *و قابل‌دسترس*اند
for (let i = 0; i < Math.min(SHELF_SLOTS.length, PRODUCTS.length); i++) {
  const box = shelfAABB(SHELF_SLOTS[i]);
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  check(grid.blockedAt(cx, cz), `مرکز قفسهٔ ${i + 1} در شبکه بسته است`);
  const spots = shelfShopSpots(i);
  check(spots.length === 2, `قفسهٔ ${i + 1} دو جای ایستادن دارد`);
  for (const sp of spots) {
    check(grid.isFree(sp.x, sp.z), `نقطهٔ خرید جلوی قفسهٔ ${i + 1} آزاد است`);
    // ⚠️ «آزاد بودن» کافی نیست: اگر هالهٔ موانع دورِ خانه را بسته باشد،
    //    مشتریِ منصوب به این نقطه هیچ مسیری پیدا نمی‌کند. پس دسترسی را هم بسنج.
    check(
      grid.reachableFrom({ x: SPAWN_POS.x, z: SPAWN_POS.z }, sp) ||
        grid.reachableFrom({ x: DOOR_POS.x, z: DOOR_POS.z }, sp),
      `نقطهٔ خرید جلوی قفسهٔ ${i + 1} (${sp.x.toFixed(2)},${sp.z.toFixed(2)}) از در ورودی قابل‌دسترس است`
    );
  }
}
check(grid.blockedAt(REGISTER.counter.x, REGISTER.counter.z), 'میز صندوق مانع است');
check(grid.isFree(REGISTER.pay.x, REGISTER.pay.z), 'جای پرداخت جلوی صندوق آزاد است');
for (const q of REGISTER.queue) check(grid.isFree(q.x, q.z), `جای صف (${q.x},${q.z}) آزاد است`);
for (const t of TREES) check(grid.blockedAt(t.x, t.z), 'درخت مانع است');
check(grid.blockedAt(LAMP_POST.x, LAMP_POST.z), 'تیر چراغ مانع است');

// همهٔ نقاط کلیدی که بازی استفاده می‌کند باید آزاد باشند
for (const sp of walkableSpots()) {
  check(grid.isFree(sp.x, sp.z), `نقطهٔ کلیدی (${sp.x},${sp.z}) آزاد است`);
}

console.log('۲) مسیریابی A* — هیچ مسیری از توی دیوار/قفسه نمی‌رود');
const targets = [];
for (let i = 0; i < PRODUCTS.length; i++) for (const sp of shelfShopSpots(i)) targets.push({ name: `قفسهٔ ${PRODUCTS[i].id}`, p: sp });
targets.push({ name: 'صندوق', p: REGISTER.pay });
targets.push({ name: 'خروج', p: ENTRANCE.leave });
targets.push({ name: 'بیرون در', p: ENTRANCE.doorOutside });

const obstacles = buildObstacles();
let pathCount = 0;
for (const t of targets) {
  const path = grid.findPath(SPAWN_POS, t.p);
  check(!!path, `از در ورودی به ${t.name} راه هست`);
  if (!path) continue;
  pathCount++;
  // همهٔ نقاط مسیر باید آزاد باشند
  let allFree = true;
  let hitsShelf = null;
  for (const p of samplePath(path, 0.04)) {
    if (!grid.isFree(p.x, p.z)) allFree = false;
    for (const o of obstacles) {
      if (pointInsideBox(p, o, 0.0)) {
        hitsShelf = o;
        break;
      }
    }
    if (hitsShelf) break;
  }
  check(allFree, `هیچ خانهٔ بسته‌ای در مسیر ${t.name} نیست`);
  check(!hitsShelf, `مسیر ${t.name} از توی مانع‌ها (دیوار/قفسه/صندوق) رد نمی‌شود`);
  // خط بین نقطه‌های مسیر باز است
  let clear = true;
  for (let i = 0; i < path.length - 1; i++) {
    if (!grid.isClearLine(path[i].x, path[i].z, path[i + 1].x, path[i + 1].z)) clear = false;
  }
  check(clear, `بخش‌های مسیر ${t.name} خط باز هستند (بدون برخورد در حرکت)`);
}
check(pathCount === targets.length, 'همهٔ هدف‌ها مسیر دارند');

console.log('۳) ورود فقط از درِ باز انجام می‌شود');
{
  const path = grid.findPath(SPAWN_POS, REGISTER.pay);
  const pts = samplePath(path, 0.03);
  let throughDoor = true;
  let crossings = 0;
  for (const p of pts) {
    if (Math.abs(p.z - ROOM.d / 2) < 0.12) {
      crossings++;
      if (Math.abs(p.x - DOOR.x) > DOOR.w / 2 - 0.05) throughDoor = false;
    }
  }
  check(crossings > 0, 'مسیر از روی خط دیوار جلو می‌گذرد');
  check(throughDoor, 'عبور از دیوار جلو فقط داخل بازشوی در است');
}

console.log('۴) مسیرها پایدار و نرم‌اند');
{
  const a = grid.findPath(SPAWN_POS, REGISTER.pay);
  const b = grid.findPath(SPAWN_POS, REGISTER.pay);
  check(JSON.stringify(a.map((p) => [+p.x.toFixed(3), +p.z.toFixed(3)])) ===
        JSON.stringify(b.map((p) => [+p.x.toFixed(3), +p.z.toFixed(3)])), 'مسیر تصادفی نیست (تکرارشدنی است)');

  const raw = [];
  for (let i = 0; i <= 20; i++) raw.push(new THREE.Vector3(-2, 0, -1.5 + i * 0.15));
  const sm = smoothPath(grid, raw);
  check(sm.length <= raw.length, 'نرم‌کردن مسیر تعداد نقطه‌ها را زیاد نمی‌کند');
  check(sm[0] === raw[0] && sm[sm.length - 1] === raw[raw.length - 1], 'ابتدا و انتهای مسیر حفظ می‌شود');

  const far = new THREE.Vector3(20, 0, 20);
  check(grid.findPath(SPAWN_POS, far) === null, 'هدف بیرون از شبکه مسیر ندارد');
}

console.log('۵) جداسازی: مشتری‌ها از توی هم رد نمی‌شوند');
{
  const pos = { x: 0, z: 0 };
  const others = [{ pos: { x: 0.2, z: 0 }, radius: AGENT_RADIUS }];
  const push = separation(pos, AGENT_RADIUS, others);
  check(Math.hypot(push.x, push.z) > 0.05, 'وقتی دو مشتری خیلی نزدیک‌اند نیروی دفع ایجاد می‌شود');
  check(push.x < 0, 'جهت دفع، دور از مشتری دیگر است');

  const far = separation({ x: 0, z: 0 }, AGENT_RADIUS, [{ pos: { x: 3, z: 0 }, radius: AGENT_RADIUS }]);
  check(Math.hypot(far.x, far.z) === 0, 'مشتری‌های دور به هم نیرو نمی‌زنند');

  // پنج مشتری روی هم — بعد از رفع هم‌پوشانی نباید کسی داخل بدن دیگری بماند
  const crowd = [0, 1, 2, 3, 4].map((i) => ({ pos: { x: 0.02 * i, z: 0 }, radius: AGENT_RADIUS }));
  for (let it = 0; it < 6; it++)
    for (let i = 0; i < crowd.length; i++) {
      const others2 = crowd.filter((_, j) => j !== i);
      resolveOverlap(crowd[i].pos, crowd[i].radius, others2);
    }
  let minD = Infinity;
  for (let i = 0; i < crowd.length; i++)
    for (let j = i + 1; j < crowd.length; j++)
      minD = Math.min(minD, Math.hypot(crowd[i].pos.x - crowd[j].pos.x, crowd[i].pos.z - crowd[j].pos.z));
  check(minD >= 2 * AGENT_RADIUS - 0.02, `رفع هم‌پوشانی کار می‌کند (کمترین فاصله ${minD.toFixed(3)})`);
}

console.log('۶) یک روز کامل: بدون رد شدن از مانع، بدون گم‌شدن کالا');
const DAY = { seed: 20240918, dt: 0.05, maxT: 320 };
{
  const realRandom = Math.random;
  Math.random = seeded(DAY.seed);
  const world = createHeadlessWorld();
  const state = newGameState();
  // موجودی همهٔ قفسه‌ها پر، قیمت‌ها هم‌سطح بازار (تا خرید قطعی باشد)
  for (const p of PRODUCTS) {
    state.inventory[p.id] = 8;
    state.salePrice[p.id] = state.market[p.id];
  }
  refreshShelves(world, state.inventory);
  const inv0 = { ...state.inventory };

  let minDist = Infinity;
  let blockedHits = 0;
  let movedThroughWall = 0;
  let sawItemInHand = false;
  let sawItemInBasket = false;
  let maxInHand = 0;
  let leftOnCounter = 0;

  const sim = new DaySimulation(state, world, {
    onSale: () => {},
  });
  let t = 0;
  while (!sim.finished && t < DAY.maxT) {
    sim.update(DAY.dt);
    t += DAY.dt;
    for (const c of sim.active) {
      if (c.gone) continue;
      // ۱) نباید داخل مانع (دیوار/قفسه/میز) باشد
      if (!world.nav.isFree(c.pos.x, c.pos.z)) blockedHits++;
      // ۲) کالا در دست / در سبد
      if (c.parts) {
        const inHand = c.parts.handR ? c.parts.handR.children.filter((o) => o.userData.product).length : 0;
        const inBasket = c.parts.basketItems ? c.parts.basketItems.children.length : 0;
        if (inHand > 0) {
          sawItemInHand = true;
          maxInHand = Math.max(maxInHand, inHand);
        }
        if (inBasket > 0) sawItemInBasket = true;
      }
      for (const b of c.basket || []) if (b.mesh && b.mesh.parent === world.scene) leftOnCounter++;
    }
    const act = sim.active.filter((c) => !c.gone);
    for (let i = 0; i < act.length; i++)
      for (let j = i + 1; j < act.length; j++) {
        const d = Math.hypot(act[i].pos.x - act[j].pos.x, act[i].pos.z - act[j].pos.z);
        minDist = Math.min(minDist, d);
        if (d < 0.05) movedThroughWall++;
      }
  }
  Math.random = realRandom;

  check(sim.finished, 'روز به پایان رسید');
  check(sim.stats.customers >= 4, `مشتری‌ها آمدند (${sim.stats.customers} نفر)`);
  check(sim.stats.buyers > 0, `دست‌کم یک نفر خرید کرد (${sim.stats.buyers} خریدار)`);
  check(blockedHits === 0, `هیچ مشتری داخل دیوار/قفسه/صندوق نبود (${blockedHits} مورد)`);
  check(movedThroughWall === 0, 'هیچ دو مشتری‌ای روی هم نرفتند');
  check(minDist >= 2 * AGENT_RADIUS - 0.06, `کمترین فاصلهٔ دو مشتری ${minDist.toFixed(3)} (بیشتر از قطر بدن ${(2 * AGENT_RADIUS).toFixed(2)})`);

  // کالا واقعاً با دست برداشته شده و به سبد رفته
  check(sawItemInHand, 'کالا در دست مشتری دیده شد (برداشتن با دست)');
  check(sawItemInBasket, 'کالا در سبد خرید مشتری دیده شد');
  check(maxInHand <= 1, 'هم‌زمان فقط یک کالا در دست است (بقیه در سبد)');
  check(leftOnCounter === 0, 'کالایی روی میز صندوق جا نماند');

  // اقتصاد: هر کالای برداشته‌شده یا فروخته شده یا برگشته — هیچ‌کدام گم نمی‌شود
  const removed = Object.keys(inv0).reduce((s, k) => s + (inv0[k] - state.inventory[k]), 0);
  check(removed === sim.stats.itemsSold, `تعداد کالای برداشته‌شده = فروخته‌شده (${removed} = ${sim.stats.itemsSold})`);
  check(state.money === GAME.startingMoney + sim.stats.revenue, 'پول = سرمایهٔ اولیه + درآمد');
  check(state.money === 100 + sim.stats.revenue, `سرمایهٔ نهایی درست است (${state.money} $)`);
  check(sim.stats.revenue > 0, `درآمد مثبت است (${sim.stats.revenue} $)`);
}

console.log('۷) صف صندوق: نوبت‌ها رعایت می‌شود');
{
  const realRandom = Math.random;
  Math.random = seeded(7);
  const world = createHeadlessWorld();
  const state = newGameState();
  for (const p of PRODUCTS) {
    state.inventory[p.id] = 8;
    state.salePrice[p.id] = state.market[p.id];
  }
  refreshShelves(world, state.inventory);
  const sim = new DaySimulation(state, world, {});
  let maxQueue = 0;
  let payingAtOnce = 0;
  let paySpotOverlap = 0;
  let t = 0;
  while (!sim.finished && t < DAY.maxT) {
    sim.update(0.05);
    t += 0.05;
    maxQueue = Math.max(maxQueue, sim.queue.length);
    if (sim.paying) payingAtOnce++;
    const nearPay = sim.active.filter(
      (c) => !c.gone && Math.hypot(c.pos.x - REGISTER.pay.x, c.pos.z - REGISTER.pay.z) < 0.3
    );
    if (nearPay.length > 1) paySpotOverlap++;
  }
  Math.random = realRandom;
  check(maxQueue >= 1 || sim.stats.buyers === 0, `صف صندوق استفاده شد (بیشترین طول صف ${maxQueue})`);
  check(sim.stats.buyers > 0, 'پرداخت در صندوق انجام شد');
  check(paySpotOverlap === 0, 'هم‌زمان دو نفر جای پرداخت نایستادند');
  check(payingAtOnce > 0, 'مشتری واقعاً در حال پرداخت بود');
}

console.log('');
console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed) process.exit(1);
