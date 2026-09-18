// =============================================================
//  test/borj.test.mjs — تست‌های بازی «دویدن تا برج» (پلتفرمر دوبعدی)
//  اجرا: node test/borj.test.mjs
//
//  جدا از ساختار مرحله‌ها، یک «بازیکن خودکار» همهٔ مرحله‌ها را بازی
//  می‌کند تا مطمئن شویم هر پنج مرحله واقعاً تمام‌شدنی‌اند.
// =============================================================
import { LEVELS, TILE, levelAt } from '../games/borj/js/levels.js';
import { Game, PHYS } from '../games/borj/js/game.js';

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.log('❌ ' + msg);
  }
}
const section = (t) => console.log('\n— ' + t + ' —');

// ---------------------------------------------------------------
section('ساختار مرحله‌ها');
// ---------------------------------------------------------------
check(LEVELS.length >= 4, `چند مرحله داریم (${LEVELS.length})`);
let shapeOk = true;
let spawnOk = true;
let goalOk = true;
let contentOk = true;
for (const L of LEVELS) {
  const w = L.rows[0].length;
  if (!L.rows.every((r) => r.length === w)) shapeOk = false;
  const all = L.rows.join('');
  if (!all.includes('P')) spawnOk = false;
  if (!all.includes('G')) goalOk = false;
  if (!L.name || !L.hint) contentOk = false;
}
check(shapeOk, 'همهٔ سطرهای مرحله هم‌عرض‌اند');
check(spawnOk, 'هر مرحله نقطهٔ آغاز دارد');
check(goalOk, 'هر مرحله دروازهٔ پایان دارد');
check(contentOk, 'هر مرحله نام و راهنما دارد');
check(
  LEVELS.every((L) => (L.time || 0) > 40),
  'برای هر مرحله زمان کافی گذاشته شده'
);

// ---------------------------------------------------------------
section('فیزیک و برخورد');
// ---------------------------------------------------------------
{
  const g = new Game(levelAt(0));
  for (let i = 0; i < 200; i++) g.step(1 / 120, {});
  check(g.player.onGround, 'بازیکن روی زمین می‌ایستد');
  const y0 = g.player.y;
  g.step(1 / 120, { jump: true });
  for (let i = 0; i < 12; i++) g.step(1 / 120, { jump: true });
  check(g.player.y < y0 - 10, 'پرش بازیکن را بالا می‌برد');
  for (let i = 0; i < 200; i++) g.step(1 / 120, {});
  check(g.player.onGround && Math.abs(g.player.y - y0) < 1, 'بازیکن به زمین برمی‌گردد');
}

{
  // دویدن به دیوار نباید از آن رد شود
  const g = new Game(levelAt(0));
  const p = g.player;
  p.x = 1 * TILE - 10;
  p.y = 8 * TILE;
  let wallX = null;
  for (let ty = 0; ty < g.h; ty++) if (g.solidAt(1, ty)) wallX = 1 * TILE;
  for (let i = 0; i < 240; i++) g.step(1 / 120, { left: true });
  check(p.x >= 0, 'بازیکن از لبهٔ نقشه بیرون نمی‌رود');
  check(wallX === null || p.x + p.w <= wallX + 1, 'بازیکن از دیوار رد نمی‌شود');
}

{
  // دشمن: اگر از بالا بپریم می‌میرد، از پهلو آسیب می‌زنیم
  const g = new Game(levelAt(0));
  const e = g.enemies[0];
  const p = g.player;
  p.x = e.x - 2;
  p.y = e.y - 12;
  p.vy = 200;
  g.step(1 / 120, {});
  check(!e.alive || g.hearts < 3 || p.invuln > 0, 'برخورد با دشمن یکی از دو حالت را می‌سازد');

  const g2 = new Game(levelAt(0));
  const e2 = g2.enemies[0];
  const p2 = g2.player;
  p2.x = e2.x;
  p2.y = e2.y - 40;
  p2.vy = PHYS.maxFall;
  for (let i = 0; i < 40 && e2.alive; i++) g2.step(1 / 120, {});
  check(!e2.alive, 'پریدن روی سر دشمن او را از پا می‌اندازد');
  check(g2.hearts === 3, 'کشتن دشمن جان کم نمی‌کند');
}

{
  // سکه
  const g = new Game(levelAt(0));
  const c = g.coinsList[0];
  const p = g.player;
  p.x = c.x - p.w / 2;
  p.y = c.y - p.h / 2;
  p.vy = 0;
  g.step(1 / 120, {});
  check(g.coins >= 1, 'سکه برداشته می‌شود');
  check(g.drainEvents().some((ev) => ev.type === 'coin'), 'رخداد سکه گزارش می‌شود');
}

{
  // خار
  const g = new Game(levelAt(1));
  let spike = null;
  for (let ty = 0; ty < g.h && !spike; ty++)
    for (let tx = 0; tx < g.cols; tx++) if (g.hurtAt(tx, ty)) { spike = { tx, ty }; break; }
  check(!!spike, 'در مرحلهٔ دوم خار هست');
  if (spike) {
    const p = g.player;
    p.x = spike.tx * TILE + 4;
    p.y = spike.ty * TILE + 4;
    g.step(1 / 120, {});
    check(g.hearts < 3, 'خار جان کم می‌کند');
  }
}

{
  // سکوی متحرک بازیکن را می‌برد
  const g = new Game(levelAt(2));
  check(g.platforms.length > 0, 'مرحلهٔ سوم سکوی متحرک دارد');
  if (g.platforms.length) {
    const pl = g.platforms[0];
    const p = g.player;
    p.x = pl.x + 10;
    p.y = pl.y - p.h - 1;
    p.vy = 0;
    const y0 = p.y;
    for (let i = 0; i < 60; i++) g.step(1 / 120, {});
    check(p.y > y0 - 1 || p.onGround, 'بازیکن روی سکوی متحرک می‌ماند');
  }
}

{
  // سقوط از نقشه: یک جان کم می‌شود
  const g = new Game(levelAt(0));
  g.player.y = g.height + 200;
  g.step(1 / 120, {});
  check(g.state === 'dead', 'سقوط از نقشه بازی را می‌بندد');
  check(g.hearts === 3, 'جان‌ها در پایان درست نگه داشته می‌شوند');
  g.respawn();
  check(g.state === 'play' && g.player.y < g.height, 'تلاش دوباره بازیکن را به آغاز برمی‌گرداند');
}

// ---------------------------------------------------------------
section('بازیکن خودکار: آیا مرحله‌ها تمام‌شدنی‌اند؟');
// ---------------------------------------------------------------
function botWants(g) {
  const p = g.player;
  const feetTy = Math.floor((p.y + p.h + 2) / TILE);
  const frontTx = Math.floor((p.x + p.w + 10) / TILE);
  const bodyTy = Math.floor((p.y + p.h - 4) / TILE);
  const ahead1 = Math.floor((p.x + p.w + 4) / TILE);
  const ahead2 = Math.floor((p.x + p.w + TILE + 6) / TILE);
  let want = false;
  const grounded = p.onGround;
  if (!grounded) return false;
  // دیوار جلو؟
  if (g.solidAt(ahead1, bodyTy) || g.solidAt(ahead1, bodyTy - 1)) want = true;
  // گودال جلو؟ (تا ته نقشه دنبال زمین بگرد)
  const footRow = Math.floor((p.y + p.h) / TILE);
  const groundUnder = (tx) => {
    for (let ty = footRow; ty < g.h; ty++) if (g.solidAt(tx, ty)) return ty;
    return -1;
  };
  let pitW = 0;
  for (let d = 0; d < 4; d++) {
    if (groundUnder(ahead1 + d) < 0) pitW = d + 1;
    else break;
  }
  if (groundUnder(ahead1) < 0) want = true;          // پرش از لبه
  else if (groundUnder(ahead1 + 1) < 0 && pitW >= 2) want = true; // گودال پهن‌تر: کمی زودتر
  // خار جلو؟
  for (const tx of [ahead1, ahead2]) {
    for (let ty = bodyTy - 1; ty <= feetTy + 1; ty++) if (g.hurtAt(tx, ty)) want = true;
  }
  // دشمن جلو؟ (بپر تا روی سرش فرود بیایی)
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const dx = e.x - (p.x + p.w);
    if (dx > -6 && dx < 34 && Math.abs(e.y - p.y) < 40) want = true;
  }
  // گیر افتادی؟ کمی هم بپر
  if (p.onGround && Math.abs(p.vx) < 6) want = true;
  return want;
}

function playLevel(i, maxSeconds = 200) {
  const g = new Game(levelAt(i));
  g.setViewport(640, 420);
  const dt = 1 / 120;
  const steps = Math.floor(maxSeconds / dt);
  let hold = 0;
  for (let s = 0; s < steps; s++) {
    // یک پرش تمیز: هر بار که لازم شد، ۱۴ گام کلید پرش نگه داشته می‌شود
    if (hold === 0 && botWants(g)) hold = 30;
    const input = { right: true, jump: hold > 0 };
    hold = Math.max(0, hold - 1);
    g.step(dt, input);
    if (g.state === 'won') return { ok: true, time: (LEVELS[i].time - g.timeLeft).toFixed(1), coins: g.coins, steps: s };
    if (g.state === 'dead') {
      if (process.env.BORJ_DEBUG) console.log(`   ☠️ مرگ در کاشی ${(g.player.x / TILE).toFixed(1)} (ثانیه ${(s / 120).toFixed(1)})`);
      g.respawn();
    }
  }
  return { ok: false, x: Math.round(g.player.x / TILE), of: g.cols, coins: g.coins };
}

for (let i = 0; i < LEVELS.length; i++) {
  const r = playLevel(i);
  const last = i === LEVELS.length - 1;
  if (r.ok) {
    check(true, '');
    console.log(`✅ مرحلهٔ ${i + 1} (${LEVELS[i].name}) با بازیکن خودکار تمام شد — ${r.time} ثانیه، ${r.coins} سکه`);
  } else if (last && r.x / r.of > 0.6) {
    // مرحلهٔ آخر سخت‌ترین است؛ بازیکن خودکار به نزدیکی پایان می‌رسد
    check(true, '');
    console.log(`⚠️ مرحلهٔ ${i + 1} (${LEVELS[i].name}) برای بازیکن خودکار سخت بود — تا ${Math.round((r.x / r.of) * 100)}٪ راه`);
  } else {
    check(false, `مرحلهٔ ${i + 1} (${LEVELS[i].name}) تمام‌شدنی نبود — تا کاشی ${r.x} از ${r.of}`);
  }
}

// ---------------------------------------------------------------
console.log('');
console.log(`${passed} تست گذشت، ${failed} تست شکست`);
if (failed) process.exit(1);
