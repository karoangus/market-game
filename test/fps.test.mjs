// =============================================================
//  test/fps.test.mjs — منطق کنترل اول‌شخص (بدون مرورگر)
//
//  اجرا:  npm run test:fps
//
//  چی چک می‌شود؟
//   • زاویه‌ها و محدودهٔ نگاه (pitch/yaw)
//   • حرکت با برخورد: بازیکن از دیوار رد نشود ولی کنارش «بلغزد»
//   • نقطهٔ شروع بازی جایی آزاد روی نقشه باشد (رگرسیون رایج!)
//   • کراس‌هیر: قفسه/صندوق فقط وقتی فعال شود که جلوی صورتت و نزدیک باشد
// =============================================================
import { NavGrid } from '../js/nav.js';
import {
  FirstPerson,
  clampPitch,
  normalizeAngle,
  yawPitchToward,
  slideMove,
  pickAimTarget,
  PLAYER_SPAWN,
  EYE_HEIGHT,
  WALK_SPEED,
  RUN_SPEED,
  PLAYER_RADIUS,
} from '../js/fps.js';
import { ROOM, SHELF_SLOTS, REGISTER, NAV } from '../js/layout.js';

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
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

// ---------- ۱) زاویه‌ها ----------
console.log('۱) زاویه‌ها و محدودهٔ نگاه');
{
  check(clampPitch(0.5) === 0.5, 'pitch داخل محدوده همان می‌ماند');
  check(near(clampPitch(3), 1.45), 'pitch زیادی بالا، به سقف می‌خورد');
  check(near(clampPitch(-3), -1.45), 'pitch زیادی پایین، به کف می‌خورد');
  check(near(normalizeAngle(Math.PI * 3), Math.PI), 'زاویهٔ ۳π همان π است');
  check(near(normalizeAngle(Math.PI / 2), Math.PI / 2), 'زاویهٔ کوچک دست‌نخورده');
  check(near(normalizeAngle(-Math.PI * 2.5), -Math.PI / 2), 'زاویهٔ منفی هم می‌چرخد');
}

// ---------- ۲) yawPitchToward ----------
console.log('۲) yawPitchToward — چرخش درست به سمت هدف');
{
  // نگاه به -z : yaw باید ۰ باشد
  const a = yawPitchToward({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 1.6, z: -2 });
  check(near(a.yaw, 0, 1e-6), `نگاه به ‎-z‎ یعنی yaw=۰ (بود ${a.yaw.toFixed(3)})`);
  check(near(a.pitch, 0, 1e-6), 'هدف هم‌سطح یعنی pitch=۰');
  // نگاه به +x : yaw باید -π/2 باشد
  const b = yawPitchToward({ x: 0, y: 1.6, z: 0 }, { x: 2, y: 1.6, z: 0 });
  check(near(b.yaw, -Math.PI / 2, 1e-6), `نگاه به ‎+x‎ یعنی yaw=‎-π/2 (بود ${b.yaw.toFixed(3)})`);
  // هدف پایین‌تر: pitch منفی
  const c = yawPitchToward({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0.4, z: -2 });
  check(c.pitch < -0.3 && c.pitch > -1.2, `نگاه به پایین: pitch منفی (${c.pitch.toFixed(2)})`);
}

// ---------- ۳) حرکت با برخورد ----------
console.log('۳) حرکت با برخورد روی شبکهٔ واقعی نقشه');
{
  const nav = new NavGrid();

  // نقطهٔ شروع بازیکن باید آزاد باشد — وگرنه بازی اول‌شخص داخل دیوار اسپاون می‌شود!
  check(nav.isFree(PLAYER_SPAWN.x, PLAYER_SPAWN.z), 'نقطهٔ شروع بازیکن آزاد است (داخل دیوار نیست)');

  // حرکت آزاد در راهرو: هر دو محور جابه‌جا می‌شوند
  {
    const pos = { x: 0.3, z: 0.9 };
    const r = slideMove(nav, pos, 0.1, -0.1);
    check(r.movedX !== 0 && r.movedZ !== 0, 'در فضای باز حرکت قطری کامل انجام می‌شود');
    check(near(pos.x, 0.4) && near(pos.z, 0.8), `جای جدید درست است (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
  }

  // فشار به دیوار جلو: نباید عبور کنی، ولی باید بتوانی کنارش بلغزی
  {
    const pos = { x: 0.0, z: 1.7 };
    slideMove(nav, pos, 0, 0.3);
    check(near(pos.z, 1.7), 'دیوار جلو را سوراخ نمی‌کنی');
    const r2 = slideMove(nav, pos, 0.12, 0.2);
    check(r2.movedX !== 0 && r2.movedZ === 0, 'همان لحظه می‌توانی امتداد دیوار بلغزی (سر خوردن)');
    check(near(pos.z, 1.7), '…ولی باز هم داخل دیوار نمی‌روی');
  }

  // نه حرکت به درون قفسهٔ دیوار پشت
  {
    const pos = { x: -1.7, z: -1.3 };
    slideMove(nav, pos, 0, -0.3);
    check(pos.z > -1.45, 'قفسه‌ها هم مانعند — از داخلشان رد نمی‌شوی');
  }

  // بیرون از مغازه آزاد است: روی پیاده‌رو می‌شود قدم زد
  {
    const pos = { x: 1.2, z: 3.0 };
    const r = slideMove(nav, pos, 0.2, 0.2);
    check(r.movedX !== 0 || r.movedZ !== 0, 'روی پیاده‌روِ بیرون هم راه می‌روی');
  }

  // ولی از مرز نقشه بیرون نمی‌روی (محدودهٔ سخت داخل کلاس کنترل)
  {
    const { fp } = makeFakeFirstPerson(nav);
    fp.attract = false;
    fp.yaw = Math.PI; // رو به +z — یعنی بیرون مغازه
    fp.pos.set(1.2, 0, NAV.maxZ - 0.24);
    fp.keys.KeyW = true;
    for (let i = 0; i < 90; i++) fp.update(1 / 60, false);
    check(fp.pos.z <= NAV.maxZ - 0.2 + 1e-6, `از انتهای نقشه بیرون نمی‌پری (z = ${fp.pos.z.toFixed(2)})`);
    check(fp.pos.z > NAV.maxZ - 0.6, '…ولی تا لبهٔ نقشه هم رفتی — نه اینکه گیر کرده باشی');
  }
}

// ---------- ۴) کراس‌هیر و انتخاب هدف ----------
console.log('۴) pickAimTarget — تعامل فقط وقتی جلوی صورتت و نزدیک است');
{
  const shelves = SHELF_SLOTS.map((s, i) => ({ id: `shelf${i}`, x: s.x, z: s.z }));

  // روبه‌روی قفسهٔ دیوار پشت ایستاده‌ای و به آن نگاه می‌کنی (نگاه به -z → yaw=0)
  {
    const aim = pickAimTarget({
      pos: { x: -1.72, z: -1.1 },
      yaw: 0,
      shelves,
      register: REGISTER.counter,
    });
    check(aim && aim.type === 'shelf' && aim.id === 'shelf0', 'قفسهٔ جلوی صورتت انتخاب می‌شود');
  }

  // پشت به همان قفسه → هیچ هدفی (صندوق هم دور است)
  {
    const aim = pickAimTarget({
      pos: { x: -1.72, z: -1.1 },
      yaw: Math.PI,
      shelves,
      register: REGISTER.counter,
    });
    check(aim === null || aim.type !== 'shelf' || aim.id !== 'shelf0', 'وقتی پشتت به قفسه است انتخاب نمی‌شود');
  }

  // کنار صندوق ایستاده‌ای و به میز نگاه می‌کنی (صندوق سمت -z توست → yaw=0)
  {
    const aim = pickAimTarget({
      pos: { x: REGISTER.counter.x, z: REGISTER.counter.z + 0.9 },
      yaw: 0,
      shelves,
      register: REGISTER.counter,
    });
    check(aim && aim.type === 'register', 'صندوق از فاصلهٔ نزدیک انتخاب می‌شود');
  }

  // روی پیاده‌رو، پشت به فروشگاه → هیچ هدفی در دید نیست
  {
    const aim = pickAimTarget({
      pos: { x: 1.2, z: 3.4 },
      yaw: Math.PI, // نگاه به +z یعنی دور از فروشگاه
      shelves,
      register: REGISTER.counter,
    });
    check(aim === null, 'به فضای خالی نگاه می‌کنی → هیچ هدفی انتخاب نمی‌شود');
  }

  // از راه دور: حتی روبه‌رو هم باشد شمرده نمی‌شود
  {
    const aim = pickAimTarget({
      pos: { x: REGISTER.counter.x, z: REGISTER.counter.z + 5.0 },
      yaw: 0,
      shelves,
      register: REGISTER.counter,
    });
    check(aim === null || aim.type !== 'register', 'از پنج‌متری نمی‌شود با صندوق تعامل کرد');
  }
}

// ---------- ۵) ثابت‌های بازیکن سالم‌اند ----------
console.log('۵) ثابت‌های بازیکن');
{
  check(EYE_HEIGHT > 1.3 && EYE_HEIGHT < ROOM.h - 0.4, `ارتفاع چشم منطقی است (${EYE_HEIGHT})`);
  check(RUN_SPEED > WALK_SPEED, 'تندروی از راه‌رفتن تندتر است');
  check(PLAYER_RADIUS > 0.1 && PLAYER_RADIUS < 0.5, 'شعاع بدن بازیکن معقول است');
  const sp = PLAYER_SPAWN;
  check(Math.abs(sp.x) < ROOM.w / 2 && Math.abs(sp.z) < ROOM.d / 2, 'نقطهٔ شروع داخل فروشگاه است');
}

// ---------- ۶) کنترل‌کنندهٔ کامل (بدون DOM) ----------
console.log('۶) کنترل‌کنندهٔ FirstPerson در محیط بدون مرورگر کار می‌کند');

/**
 * بدون هیچ DOM/WebGL یک FirstPerson واقعی می‌سازد (کلاس طوری نوشته شده
 * که بدون سند کار کند — برای تست). دوربین و سه‌بعدی جعلی‌اند.
 */
function makeFakeFirstPerson(nav) {
  const calls = { camPos: [], camRot: [] };
  const camera = {
    position: { set(x, y, z) { calls.camPos.push([x, y, z]); } },
    rotation: { order: '', set(x, y, z) { calls.camRot.push([x, y, z]); } },
    aspect: 1,
  };
  const canvas = { addEventListener() {}, style: {} };
  const world = { shelves: {}, nav, setDoor() {}, headless: false };
  const fp = new FirstPerson({ camera, canvas, world, isBlocked: () => false });
  return { fp, calls };
}

{
  const nav = new NavGrid();
  const { fp, calls } = makeFakeFirstPerson(nav);

  // قبل از شروع بازی: attract روشن است و دوربین آرام می‌چرخد
  check(fp.attract === true, 'در ابتدا حالت attract فعال است (دوربین نمایشی)');
  fp.update(0.016, false);
  fp.update(0.016, false);
  check(calls.camPos.length > 0, 'دوربین هر فریم به‌روزرسانی می‌شود');

  // خواندن ورودی و حرکت
  fp.attract = false;
  fp.keys.KeyW = true;
  const z0 = fp.pos.z;
  for (let i = 0; i < 60; i++) fp.update(1 / 60, false);
  const dz = Math.abs(fp.pos.z - z0) + Math.abs(fp.pos.x - PLAYER_SPAWN.x);
  check(dz > 0.15, `با نگه‌داشتن W حرکت می‌کنی (${dz.toFixed(2)} متر)`);

  // وقتی رابط باز است (blocked)، ورودی نمی‌خوانَد
  const px = fp.pos.x;
  const pz = fp.pos.z;
  for (let i = 0; i < 30; i++) fp.update(1 / 60, true);
  check(
    Math.abs(fp.pos.x - px) + Math.abs(fp.pos.z - pz) < 0.06,
    'با باز بودن پنل، ورودی حرکت خوانده نمی‌شود'
  );

  // ریست نرم به نقطهٔ شروع (کلید را رها کرده‌ایم)
  fp.keys = Object.create(null);
  fp.resetToSpawn();
  for (let i = 0; i < 60; i++) fp.update(1 / 60, false);
  check(
    near(fp.pos.x, PLAYER_SPAWN.x, 1e-6) && near(fp.pos.z, PLAYER_SPAWN.z, 1e-6),
    'دکمهٔ «برگشت» بازیکن را نرم به نقطهٔ شروع برمی‌گرداند'
  );
  check(fp.mode === 'play', 'بعد از ریست، حالت بازی برمی‌گردد');

  // اینترو در را باز و در پایان بسته می‌کند؛ حالت به play برمی‌گردد
  let doorLog = [];
  const world2 = { shelves: {}, nav, setDoor: (o) => doorLog.push(o), headless: false };
  const fp2 = new FirstPerson({
    camera: { position: { set() {} }, rotation: { order: '', set() {} } },
    canvas: { addEventListener() {}, style: {} },
    world: world2,
    isBlocked: () => false,
  });
  fp2.playIntro();
  for (let i = 0; i < 260; i++) fp2.update(1 / 60, false);
  check(fp2.mode === 'play', 'اینترو تمام می‌شود و کنترل آزاد می‌شود');
  check(doorLog.includes(true), 'در حین اینترو در باز شد');
  check(doorLog[doorLog.length - 1] === false, 'بعد از ورود، در بسته شد');
  check(near(fp2.pos.x, PLAYER_SPAWN.x, 1e-6) && near(fp2.pos.z, PLAYER_SPAWN.z, 1e-6),
    'اینترو دقیقاً روی نقطهٔ شروع بازیکن تمام می‌شود');
}

console.log('');
console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed) process.exit(1);
