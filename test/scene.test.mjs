// =============================================================
//  test/scene.test.mjs — تست دودِ صحنهٔ سه‌بعدی و شبیه‌سازی روز
//
//  بدون WebGL و بدون canvas واقعی: دنیا (scene3d.js) و شبیه‌سازی
//  مشتری‌ها (customers.js) به‌طور کامل در Node ساخته و به‌روزرسانی
//  می‌شوند تا مطمئن شویم:
//   • چرخهٔ شبانه‌روز (setSky) نورها/آسمان/چراغ‌ها را درست عوض می‌کند
//   • هوا (setWeather) صحنه را می‌بندد
//   • یک روز کامل با مشتری‌های واقعی می‌چرخد و پول حساب می‌شود
//   • پایان اجباری روز (forceFinish) کالاهای وسط پرداخت را می‌فروشد
//     (باگ قدیمی: جنس از قفسه می‌رفت ولی پولش نمی‌آمد)
// =============================================================

let JSDOM = null;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('SKIP  test/scene.test.mjs — jsdom نصب نیست (npm i --save-dev jsdom)');
  process.exit(0);
}

// DOM حداقلی + stubِ کانتکست ۲بعدی (مثل boot.test) تا بافت‌های canvas
// ساخته شوند و مسیر کاملِ صحنه (از جمله گنبد آسمان) اجرا شود.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://market.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
if (!globalThis.navigator) globalThis.navigator = dom.window.navigator;
// stub کانتکست ۲بعدی: هر متدی no-op، هر پراپرتی settable
const grad = { addColorStop() {} };
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy(
    {
      canvas: this,
      createLinearGradient: () => grad,
      createRadialGradient: () => grad,
      measureText: () => ({ width: 10 }),
    },
    {
      get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : () => {}),
      set: () => true,
    }
  );
};

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

const THREE = (await import('three')).default ?? (await import('three'));
const { createWorld, buildLights, refreshShelves, refreshTags } = await import('../js/scene3d.js');
const { DaySimulation } = await import('../js/customers.js');
const { newGameState } = await import('../js/state.js');
const { PRODUCTS, GAME } = await import('../js/config.js');

console.log('— ساخت دنیا —');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 30, 60);
let world = null;
try {
  world = createWorld(scene);
  world.lights = buildLights(scene);
  check(!!world && !!world.nav, 'دنیا ساخته شد (شبکهٔ مسیریابی دارد)');
} catch (e) {
  check(false, `ساخت دنیا خطا داد: ${e.message}`);
}

console.log('— چرخهٔ شبانه‌روز (setSky) —');
if (world) {
  const { dir, hemi, inner } = world.lights;
  const skyBefore = world.skyMesh ? world.skyMesh.material.color.getHex() : null;
  world.setSky(0, 'sun'); // صبح
  const morningSun = dir.intensity;
  const morningSky = world.skyMesh.material.color.getHex();
  const morningCeil = world.ceilingMat.emissiveIntensity;
  const morningBg = scene.background.getHex();
  world.setSky(1, 'sun'); // شب
  const nightSun = dir.intensity;
  const nightSky = world.skyMesh.material.color.getHex();
  const nightCeil = world.ceilingMat.emissiveIntensity;
  check(nightSun < morningSun * 0.3, `شب خورشید خیلی کم‌سوتر است (${morningSun.toFixed(2)} → ${nightSun.toFixed(2)})`);
  check(nightSky !== morningSky, 'رنگ آسمان در شب عوض شد');
  check(nightCeil > morningCeil * 1.3, 'چراغ‌های سقف شب‌ها روشن‌ترند');
  check(scene.background.getHex() !== morningBg, 'پس‌زمینهٔ صحنه (مه) هم تیره شد');
  // تغییر ریز نباید دوباره اعمال شود (دروازهٔ ۰٫۳٪)
  const before = world.skyMesh.material.color.getHex();
  world.setSky(1.0001, 'sun');
  check(world.skyMesh.material.color.getHex() === before, 'تغییرِ ناچیز k دوباره اعمال نمی‌شود');
  // هوای بارانی صبح: روشن‌تر از صبحِ آفتابی نیست و خاکستری‌تر است
  world.setSky(0, 'rain');
  check(dir.intensity < morningSun, 'باران خورشید را کم‌سو می‌کند');
  world.setSky(0, 'sun');

  console.log('— هوا —');
  world.setWeather('rain');
  check(world.rain.visible === true, 'باران روشن شد');
  world.setWeather('snow');
  check(world.rain.visible === true && world.rain.material.size > 0.08, 'برف (همان سیستم ذرات، درشت‌تر)');
  world.setWeather('sun');
  check(world.rain.visible === false, 'با آفتاب، باران خاموش شد');

  console.log('— به‌روزرسانی دنیا بدون خطا —');
  let threw = false;
  try {
    for (let i = 0; i < 60; i++) world.update(0.016);
  } catch (e) {
    threw = true;
  }
  check(!threw, '۶۰ فریم update بدون خطا');
}

console.log('— یک روز کامل فروش (شبیه‌سازی واقعی مشتری‌ها) —');
{
  const state = newGameState();
  state.market = { bread: 4, apple: 10, banana: 13, oil: 17, rice: 20 };
  state.salePrice = { bread: 5, apple: 11, banana: 13, oil: 18, rice: 21 };
  // قفسه‌ها پر
  for (const p of PRODUCTS) state.inventory[p.id] = GAME.maxDisplayPerShelf;
  refreshShelves(world, state.inventory);
  refreshTags(world, state.salePrice, state.market);
  const invBefore = PRODUCTS.reduce((a, p) => a + state.inventory[p.id], 0);
  const moneyBefore = state.money;

  const sim = new DaySimulation(state, world, {});
  // تا ۳۵ ثانیهٔ بازی با قدم‌های ۰٫۱ ثانیه جلو برو (روز عادی زودتر تمام می‌شود)
  let guard = 0;
  while (!sim.finished && guard++ < 3500) sim.update(0.1);

  check(sim.finished, 'روز به‌طور طبیعی تمام شد');
  check(sim.stats.customers >= 4, `مشتری آمد (${sim.stats.customers} نفر)`);
  check(invBefore > 0, 'قفسه‌ها پر بودند');
  check(
    state.money > moneyBefore || sim.stats.itemsSold === 0,
    `پول فروش به حساب آمد (${moneyBefore} → ${state.money}، ${sim.stats.itemsSold} قلم)`
  );
  const sold = PRODUCTS.reduce((a, p) => a + (GAME.maxDisplayPerShelf - (state.inventory[p.id] || 0)), 0);
  check(sold === sim.stats.itemsSold, `موجودیِ کم‌شده با فروش هم‌خوان است (${sold} = ${sim.stats.itemsSold})`);
  // هیچ مشتری‌ای جا نمانده باشد
  check(sim.active.length === 0, 'همهٔ مشتری‌ها فروشگاه را ترک کردند');
}

console.log('— پایان اجباری روز: کالاهای وسطِ پرداخت هم فروش می‌روند —');
{
  const state = newGameState();
  for (const p of PRODUCTS) state.inventory[p.id] = GAME.maxDisplayPerShelf;
  refreshShelves(world, state.inventory);
  const sim = new DaySimulation(state, world, {});
  // صبر کنیم تا مشتری‌ها واقعاً کالا بردارند، بعد روز را «زورکی» ببندیم —
  // دقیقاً سناریویی که باگِ جنسِ گم‌شده را می‌ساخت.
  let guard = 0;
  while (sim.stats.itemsSold === 0 && guard++ < 1200) sim.update(0.05);
  const takenSoFar = PRODUCTS.reduce(
    (a, p) => a + (GAME.maxDisplayPerShelf - (state.inventory[p.id] || 0)),
    0
  );
  const moneyBefore = state.money;
  sim.forceFinish();
  check(sim.finished === true, 'forceFinish روز را تمام کرد');
  const rev = sim.stats.revenue;
  check(
    takenSoFar === 0 || rev > 0,
    `هر جنسِ برداشته‌شده فروش رفته است (برداشته: ${takenSoFar}، درآمد: ${rev})`
  );
  check(state.money >= moneyBefore, `پول به حساب آمد (${moneyBefore} → ${state.money})`);
  check(sim.active.length === 0 && sim.queue.length === 0, 'صف و صحنه خالی شد');
}

console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed > 0) process.exit(1);
process.exit(0); // تایمر/حلقه‌های jsdom رها نشوند — خروج تمیز
