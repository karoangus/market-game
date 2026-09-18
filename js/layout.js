// =============================================================
//  layout.js — «نقشهٔ فروشگاه»: تنها منبع حقیقت برای هندسهٔ صحنه
//
//  چرا این فایل جدا شد؟ چون هم صحنهٔ سه‌بعدی (scene3d.js) و هم
//  مسیریابی مشتری‌ها (nav.js) و هم تست‌ها باید «یک» نقشه را ببینند.
//  قبلاً مختصات دیوار و قفسه فقط داخل scene3d بود و هیچ‌کس نمی‌دانست
//  قفسه کجاست؛ نتیجه: مشتری‌ها از توی دیوار و میز حساب رد می‌شدند.
//
//  ➕ برای تغییر چیدمان فروشگاه فقط این فایل را عوض کن؛ مسیریابی و
//     موانع مشتری‌ها خودکار به‌روز می‌شوند.
// =============================================================

/** اتاق فروشگاه: ۵×۴ = ۲۰ متر مربع */
export const ROOM = { w: 5, d: 4, h: 2.8, wallT: 0.14 };

/** لابی در: سمت راست دیوار جلو (شیشهٔ کشویی) */
export const DOOR = { x: 1.2, w: 1.2, h: 2.3 };

/** اندازهٔ هر یونیت قفسه */
export const SHELF = { w: 0.95, d: 0.46, h: 1.62 };

/**
 * جایگاه قفسه‌ها. `rot` جهت روبه‌روی قفسه است (۰ = رو به +z یعنی سمت لابی).
 * ترتیب: ۳ قفسهٔ دیوار پشت + ۲ قفسهٔ دیوار راست — یکی برای هر محصول.
 *
 * ⚠️ سه چیز را در این چیدمان عوض نکن (هر سه باگ واقعی بودند):
 *   ۱) قفسه‌های دیوار راست از z≈-۰.۴۵ شروع می‌شوند، نه نزدیک‌تر به دیوار پشت؛
 *      هالهٔ مانعِ آن‌ها راهروی جلوی قفسه‌های دیوار پشت را می‌بست و نقطهٔ خرید
 *      مشتری میان دو مانع گیر می‌کرد.
 *   ۲) جایگاهِ اضافهٔ نزدیک لابی (z≈۱.۶۵) حذف شد: هیچ محصولی رویش نبود، ولی
 *      مانع و «نقطهٔ خرید» می‌ساخت و آن نقطه میان موانعِ سبد و گلدان یک خانهٔ
 *      جداافتاده می‌شد؛ مشتریِ منصوب به آن هیچ‌وقت مسیری پیدا نمی‌کرد.
 *   ۳) تعداد جایگاه‌ها دقیقاً به اندازهٔ محصول‌هاست (تستِ nav همین را می‌سنجد).
 */
export const SHELF_SLOTS = [
  { x: -1.72, z: -1.76, rot: 0 }, // ۰ — دیوار پشت، چپ
  { x: 0.0, z: -1.76, rot: 0 }, // ۱ — دیوار پشت، وسط
  { x: 1.72, z: -1.76, rot: 0 }, // ۲ — دیوار پشت، راست
  { x: 2.25, z: -0.45, rot: -Math.PI / 2 }, // ۳ — دیوار راست
  { x: 2.25, z: 0.6, rot: -Math.PI / 2 }, // ۴ — دیوار راست
];

/**
 * صندوق: میز صندوق روبه‌روی دیوار جلو در سمت چپ در است.
 * مشتری از سمت لابی (+z) می‌ایستد، متصدی آن‌سوی میز (سمت داخل فروشگاه).
 */
export const REGISTER = {
  counter: { x: -1.62, z: 1.46, w: 1.3, d: 0.44 }, // میز + نوار اسکن (کنار دیوار جلو)
  cashier: { x: -1.62, z: 1.82, rot: Math.PI }, // متصدی پشت میز، رو به مشتری
  pay: { x: -1.62, z: 0.9, rot: 0 }, // جای پرداخت مشتری، رو به میز
  /**
   * صف از جای پرداخت به داخل فروشگاه کشیده می‌شود (نه در راهروی تنگ).
   * پس مشتری تازه‌وارد از سمت فروشگاه به «ته صف» می‌رسد و هیچ‌وقت
   * لازم نیست از بین بقیهٔ صف رد شود؛ بعد یکی‌یکی جلو می‌روند.
   */
  queue: [
    { x: -1.62, z: 0.9 },
    { x: -1.4, z: 0.28 },
    { x: -1.28, z: -0.34 },
    { x: -1.15, z: -0.96 },
  ],
  // اگر بیشتر از ۴ نفر هم‌زمان در فروشگاه باشند، بقیه این‌جا منتظر می‌مانند
  spill: [
    { x: -0.75, z: -1.02 },
    { x: -0.15, z: -1.15 },
  ],
};

/** مسیر ورود/خروج: مشتری بیرون از در ظاهر می‌شود، از در رد می‌شود، خرید می‌کند، برمی‌گردد */
export const ENTRANCE = {
  spawn: { x: DOOR.x, z: 4.3 },
  doorOutside: { x: DOOR.x, z: 2.6 },
  doorInside: { x: DOOR.x, z: 1.3 },
  exitHint: { x: -0.5, z: 1.28 }, // راهروی خروج، پشت سر صف
  leave: { x: DOOR.x, z: 5.4 },
};

/** درخت‌ها و تیر چراغ بیرون — مانع مسیر محسوب می‌شوند */
export const TREES = [
  { x: -3.1, z: 3.5 },
  { x: 4.6, z: 2.9 },
  { x: -5.0, z: 0.6 },
];

export const LAMP_POST = { x: 3.2, z: 4.6 };

/** محدودهٔ شبکهٔ مسیریابی (بیرون + داخل) و اندازهٔ هر خانه */
/**
 * محدودهٔ شبکهٔ مسیریابی (بیرون + داخل) و اندازهٔ هر خانه.
 * خانه‌ها ۱۰ سانتی‌متری‌اند: با خانه‌های درشت‌تر، راهروهای باریکِ کنار
 * قفسه‌ها در شبکه «یک‌خانه‌ای» می‌شدند و مشتری گیر می‌کرد.
 */
export const NAV = { minX: -6.4, maxX: 6.4, minZ: -3.6, maxZ: 7.6, cell: 0.1 };

/** شعاع بدنهٔ مشتری — برای فاصله‌گرفتن از دیوار/قفسه */
export const AGENT_RADIUS = 0.22;

/** فاصله‌ای که مشتری روبه‌روی قفسه می‌ایستد */
export const SHOP_DISTANCE = 0.5;

// ---------------------------------------------------------------
//  کمکی‌ها: تبدیل جایگاه قفسه به جعبه/نقطهٔ ایستادن
// ---------------------------------------------------------------

/** جعبهٔ اشغال‌شدهٔ یک قفسه در مختصات جهانی */
export function shelfAABB(slot, w = SHELF.w, d = SHELF.d) {
  const rot = slot.rot || 0;
  const swap = Math.abs(Math.sin(rot)) > 0.5;
  const halfX = (swap ? d : w) / 2;
  const halfZ = (swap ? w : d) / 2;
  return { x0: slot.x - halfX, x1: slot.x + halfX, z0: slot.z - halfZ, z1: slot.z + halfZ };
}

/** بردار روبه‌روی قفسه (جهتی که کالا از آن برداشته می‌شود) */
export function shelfForward(slot) {
  const rot = slot.rot || 0;
  return { x: Math.sin(rot), z: Math.cos(rot) };
}

/**
 * دو نقطهٔ ایستادن جلوی هر قفسه (چپ/راست) — این‌طور دو مشتری
 * هم‌زمان می‌توانند از یک قفسه خرید کنند و به هم تنه نزنند.
 */
export function shelfShopSpots(index) {
  const slot = SHELF_SLOTS[index % SHELF_SLOTS.length];
  const f = shelfForward(slot);
  const side = { x: Math.cos(slot.rot || 0), z: -Math.sin(slot.rot || 0) };
  return [-0.24, 0.24].map((o) => ({
    x: slot.x + f.x * SHOP_DISTANCE + side.x * o,
    z: slot.z + f.z * SHOP_DISTANCE + side.z * o,
  }));
}

// ---------------------------------------------------------------
//  موانع مسیر (جهان برای مسیریابی) — از همان اعداد بالا ساخته می‌شود
// ---------------------------------------------------------------

/** موانع ثابت: دیوارها (با در باز)، قفسه‌ها، میز صندوق، درخت‌ها، تیر چراغ */
export function buildObstacles() {
  const { w, d } = ROOM;
  const halfW = w / 2;
  const halfD = d / 2;
  const doorL = DOOR.x - DOOR.w / 2;
  const doorR = DOOR.x + DOOR.w / 2;
  const outer = 1.2; // ضخامت محافظ دور اتاق تا کسی از بیرون به داخل نفوذ نکند
  const list = [
    // دیوار پشت
    { x0: -halfW - outer, x1: halfW + outer, z0: -halfD - outer, z1: -halfD },
    // دیوار چپ
    { x0: -halfW - outer, x1: -halfW, z0: -halfD - outer, z1: halfD + outer },
    // دیوار راست
    { x0: halfW, x1: halfW + outer, z0: -halfD - outer, z1: halfD + outer },
    // دیوار جلو — دو تکه، بین‌شان لابی در باز است
    { x0: -halfW - outer, x1: doorL, z0: halfD, z1: halfD + outer },
    { x0: doorR, x1: halfW + outer, z0: halfD, z1: halfD + outer },
  ];
  for (const slot of SHELF_SLOTS) list.push(shelfAABB(slot, SHELF.w + 0.04, SHELF.d + 0.04));
  const c = REGISTER.counter;
  list.push({
    x0: c.x - c.w / 2 - 0.03,
    x1: c.x + c.w / 2 + 0.03,
    z0: c.z - c.d / 2 - 0.03,
    z1: c.z + c.d / 2 + 0.03,
  });
  // دکورهای داخل فروشگاه که مشتری نباید از تویشان رد شود
  list.push({ x0: -2.45, x1: -2.1, z0: 0.68, z1: 1.22 }); // مجله‌فروشی روی دیوار چپ
  list.push({ x0: 1.74, x1: 2.1, z0: 1.62, z1: 2.0 }); // سبدهای ورودی کنار در
  list.push({ x0: -2.45, x1: -2.18, z0: 0.22, z1: 0.5 }); // گلدان چپ
  list.push({ x0: 2.18, x1: 2.45, z0: 1.42, z1: 1.7 }); // گلدان راست
  for (const t of TREES) list.push({ x0: t.x - 0.16, x1: t.x + 0.16, z0: t.z - 0.16, z1: t.z + 0.16 });
  list.push({ x0: LAMP_POST.x - 0.09, x1: LAMP_POST.x + 0.09, z0: LAMP_POST.z - 0.09, z1: LAMP_POST.z + 0.09 });
  return list;
}

/** نقاطی که همیشه باید قابل‌دسترس باشند (اگر هالهٔ موانع رویشان افتاد آزادشان می‌کنیم) */
export function walkableSpots() {
  const spots = [ENTRANCE.spawn, ENTRANCE.doorOutside, ENTRANCE.doorInside, ENTRANCE.exitHint, ENTRANCE.leave];
  spots.push(REGISTER.pay, ...REGISTER.queue, ...REGISTER.spill);
  for (let i = 0; i < SHELF_SLOTS.length; i++) spots.push(...shelfShopSpots(i));
  return spots;
}

export const REGISTER_POS = { x: REGISTER.counter.x, y: 0, z: REGISTER.counter.z };
export const REGISTER_SPOT = { x: REGISTER.pay.x, y: 0, z: REGISTER.pay.z };
export const SPAWN_POS = { x: ENTRANCE.spawn.x, y: 0, z: ENTRANCE.spawn.z };
export const DOOR_POS = { x: DOOR.x, y: 0, z: 2.15 };
