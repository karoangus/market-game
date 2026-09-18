// =============================================================
//  game.js — منطق بازی «دویدن تا برج» (بدون DOM، قابل تست در نود)
//  فیزیک، برخورد با نقشه، دشمن‌ها، سکه‌ها، دروازه و دوربین
// =============================================================
export const TILE = 28;

export const PHYS = {
  gravity: 1500,
  maxFall: 780,
  runSpeed: 190,
  accel: 1300,
  friction: 1500,
  jump: 520,
  doubleJump: 450,
  jumpCut: 0.42,
  coyote: 0.09,
  jumpBuffer: 0.12,
  stompBounce: 330,
  hurtKnock: 170,
  invuln: 1.15,
};

const SOLID = new Set(['#', '=']);
const HURT = new Set(['^']);

export class Game {
  constructor(level, opts = {}) {
    this.level = level;
    this.rows = level.rows.slice();
    this.cols = Math.max(...this.rows.map((r) => r.length));
    this.h = this.rows.length;
    this.w = this.cols;
    this.width = this.cols * TILE;
    this.height = this.h * TILE;
    this.events = [];
    this.state = 'play';
    this.timeLeft = level.time || 150;
    this.coins = 0;
    this.coinTotal = 0;
    this.hearts = opts.hearts ?? 3;
    this.deaths = 0;
    this.steps = 0;
    this.doubleJumpUnlocked = false;

    this.enemies = [];
    this.coinsList = [];
    this.platforms = [];
    this.spawn = { x: TILE * 2, y: TILE * 2 };

    for (let ty = 0; ty < this.h; ty++) {
      const row = this.rows[ty];
      for (let tx = 0; tx < this.cols; tx++) {
        const c = row[tx] || '.';
        const px = tx * TILE;
        const py = ty * TILE;
        if (c === 'P') this.spawn = { x: px + 4, y: py + 4 };
        else if (c === 'o') {
          this.coinsList.push({ x: px + TILE / 2, y: py + TILE / 2, r: 7, taken: false, ph: (tx * 7 + ty * 3) % 10 });
          this.coinTotal++;
        } else if (c === 'e') this.enemies.push(this.mkEnemy(px, py, 'walk'));
        else if (c === 'b') this.enemies.push(this.mkEnemy(px, py, 'big'));
        else if (c === 'G') this.goal = { x: px, y: py - 2 * TILE, w: TILE, h: 3 * TILE };
        else if (c === '*') this.power = { x: px, y: py, w: TILE, h: TILE, taken: false };
      }
    }
    if (!this.goal) this.goal = { x: (this.cols - 1) * TILE, y: (this.h - 2) * TILE, w: TILE, h: TILE };
    for (const m of level.moves || []) {
      this.platforms.push({
        x: m.x * TILE,
        y: m.y * TILE,
        x0: m.x * TILE,
        y0: m.y * TILE,
        x1: m.toX * TILE,
        y1: m.toY * TILE,
        w: (m.w || 3) * TILE,
        h: (m.h || 1) * TILE,
        speed: (m.speed || 1) * 40,
        t: 0,
        dir: 1,
        dx: 0,
        dy: 0,
      });
    }

    this.player = {
      x: this.spawn.x,
      y: this.spawn.y,
      w: 18,
      h: 24,
      vx: 0,
      vy: 0,
      onGround: false,
      coyote: 0,
      jumpBuf: 0,
      jumps: 0,
      facing: 1,
      invuln: 0,
      anim: 0,
    };
    this.camera = { x: 0, y: 0 };
    this.aimCamera(true);
  }

  mkEnemy(px, py, kind) {
    const big = kind === 'big';
    return {
      x: px + (big ? 0 : 3),
      y: py + (big ? -6 : 6),
      w: big ? 26 : 20,
      h: big ? 30 : 18,
      vx: 0,
      dir: -1,
      speed: big ? 52 : 74,
      alive: true,
      kind,
      anim: 0,
    };
  }

  // ---------------- نقشه ----------------
  tileAt(tx, ty) {
    if (tx < 0 || tx >= this.cols) return '#';
    if (ty < 0) return '.';
    if (ty >= this.h) return '.';
    return this.rows[ty][tx] || '.';
  }
  solidAt(tx, ty) {
    return SOLID.has(this.tileAt(tx, ty));
  }
  hurtAt(tx, ty) {
    return HURT.has(this.tileAt(tx, ty));
  }
  /** برخورد یک جعبه با کاشی‌های جامد/خار (فهرست کاشی‌ها) */
  tilesIn(x, y, w, h) {
    const out = [];
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) out.push({ tx, ty });
    return out;
  }
  hitsSolid(x, y, w, h) {
    for (const { tx, ty } of this.tilesIn(x, y, w, h)) if (this.solidAt(tx, ty)) return true;
    return false;
  }

  /** سکوی متحرک زیر پای بازیکن (برای سوار شدن) */
  platformUnder(p) {
    for (const pl of this.platforms) {
      if (
        p.x + p.w > pl.x &&
        p.x < pl.x + pl.w &&
        Math.abs(p.y + p.h - pl.y) < 6 &&
        p.vy >= -1
      ) {
        return pl;
      }
    }
    return null;
  }

  // ---------------- گام فیزیک ----------------
  step(dt, input = {}) {
    if (this.state !== 'play') return;
    this.steps++;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.die();
      return;
    }
    const P = PHYS;
    const p = this.player;

    // ۱) ورودی افقی
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      p.vx += dir * P.accel * dt;
      p.vx = Math.max(-P.runSpeed, Math.min(P.runSpeed, p.vx));
      p.facing = dir;
    } else {
      const f = P.friction * dt;
      if (Math.abs(p.vx) <= f) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * f;
    }

    // ۲) پرش (با زمانِ بخشش و بافر)
    p.coyote = p.onGround ? P.coyote : Math.max(0, p.coyote - dt);
    p.jumpBuf = input.jump ? P.jumpBuffer : Math.max(0, p.jumpBuf - dt);
    if (p.jumpBuf > 0) {
      if (p.onGround || p.coyote > 0) {
        p.vy = -P.jump;
        p.jumps = 1;
        p.jumpBuf = 0;
        p.coyote = 0;
        p.onGround = false;
        this.events.push({ type: 'jump' });
      } else if (this.doubleJumpUnlocked && p.jumps < 2) {
        p.vy = -P.doubleJump;
        p.jumps = 2;
        p.jumpBuf = 0;
        this.events.push({ type: 'jump2' });
      }
    }
    if (!input.jump && p.vy < 0) p.vy *= 1 - (1 - P.jumpCut) * Math.min(1, dt * 18);

    // ۳) گرانش
    p.vy = Math.min(P.maxFall, p.vy + P.gravity * dt);

    // ۴) سکوهای متحرک
    for (const pl of this.platforms) {
      pl.t += dt * pl.dir;
      if (pl.t >= 1) {
        pl.t = 1;
        pl.dir = -1;
      }
      if (pl.t <= 0) {
        pl.t = 0;
        pl.dir = 1;
      }
      const nx = pl.x0 + (pl.x1 - pl.x0) * pl.t;
      const ny = pl.y0 + (pl.y1 - pl.y0) * pl.t;
      pl.dx = nx - pl.x;
      pl.dy = ny - pl.y;
      pl.x = nx;
      pl.y = ny;
    }
    const riding = this.platformUnder(p);
    if (riding) {
      p.x += riding.dx;
      p.y += riding.dy;
    }

    // ۵) حرکت و برخورد (محور جدا)
    p.x += p.vx * dt;
    this.resolveX(p);
    p.y += p.vy * dt;
    this.resolveY(p, riding);

    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    p.anim += dt * (p.onGround ? Math.abs(p.vx) / 60 : 6);

    // ۶) خار
    for (const { tx, ty } of this.tilesIn(p.x, p.y, p.w, p.h)) {
      if (!this.hurtAt(tx, ty)) continue;
      if (ty * TILE + TILE - p.y < 12) continue; // روی نوک خار راه رفتن سخت نیست، ولی آسیب دارد
      this.hurt(-1);
      break;
    }

    // ۷) سکه‌ها
    for (const c of this.coinsList) {
      if (c.taken) continue;
      if (Math.abs(c.x - (p.x + p.w / 2)) < c.r + p.w / 2 && Math.abs(c.y - (p.y + p.h / 2)) < c.r + p.h / 2) {
        c.taken = true;
        this.coins++;
        this.events.push({ type: 'coin', x: c.x, y: c.y });
      }
    }

    // ۸) پرش دوگانه
    if (this.power && !this.power.taken) {
      const pw = this.power;
      if (p.x + p.w > pw.x && p.x < pw.x + pw.w && p.y + p.h > pw.y && p.y < pw.y + pw.h) {
        pw.taken = true;
        this.doubleJumpUnlocked = true;
        this.events.push({ type: 'power', x: pw.x, y: pw.y });
      }
    }

    // ۹) دشمن‌ها
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.anim += dt;
      e.x += e.dir * e.speed * dt;
      const aheadX = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
      const footY = e.y + e.h + 2;
      const dirTile = e.dir > 0 ? Math.floor((e.x + e.w + 1) / TILE) : Math.floor((e.x - 1) / TILE);
      const wallAhead = this.solidAt(dirTile, Math.floor((e.y + e.h / 2) / TILE));
      const floorAhead = this.solidAt(dirTile, Math.floor(footY / TILE));
      if (wallAhead || !floorAhead) {
        e.dir *= -1;
        e.x += e.dir * 2;
      }
      // برخورد با بازیکن
      if (p.x + p.w > e.x && p.x < e.x + e.w && p.y + p.h > e.y && p.y < e.y + e.h) {
        const fromTop = p.vy > 60 && p.y + p.h - e.y < 16;
        if (fromTop) {
          e.alive = false;
          p.vy = -PHYS.stompBounce;
          p.jumps = 1;
          this.events.push({ type: 'stomp', x: e.x + e.w / 2, y: e.y });
        } else {
          this.hurt(e.dir);
        }
      }
    }

    // ۱۰) دروازه
    const g = this.goal;
    if (p.x + p.w > g.x && p.x < g.x + g.w && p.y + p.h > g.y && p.y < g.y + g.h) {
      this.state = 'won';
      this.events.push({ type: 'goal' });
    }

    // ۱۱) سقوط از نقشه
    if (p.y > this.height + 120) {
      this.events.push({ type: 'fall' });
      this.die();
    }

    this.aimCamera();
  }

  resolveX(p) {
    for (const { tx, ty } of this.tilesIn(p.x, p.y, p.w, p.h)) {
      if (!this.solidAt(tx, ty)) continue;
      if (p.vx > 0) p.x = tx * TILE - p.w - 0.01;
      else if (p.vx < 0) p.x = (tx + 1) * TILE + 0.01;
      p.vx = 0;
    }
    // سکوهای متحرک هم دیوارند
    for (const pl of this.platforms) {
      if (p.x + p.w > pl.x && p.x < pl.x + pl.w && p.y + p.h > pl.y + 4 && p.y < pl.y + pl.h) {
        if (p.vx > 0 && p.x + p.w - pl.x < 20) p.x = pl.x - p.w - 0.01;
        else if (p.vx < 0 && pl.x + pl.w - p.x < 20) p.x = pl.x + pl.w + 0.01;
        p.vx = 0;
      }
    }
    if (p.x < 0) {
      p.x = 0;
      p.vx = 0;
    }
    if (p.x + p.w > this.width) {
      p.x = this.width - p.w;
      p.vx = 0;
    }
  }

  resolveY(p, riding) {
    p.onGround = false;
    for (const { tx, ty } of this.tilesIn(p.x, p.y, p.w, p.h)) {
      if (!this.solidAt(tx, ty)) continue;
      if (p.vy > 0) {
        p.y = ty * TILE - p.h - 0.01;
        p.vy = 0;
        p.onGround = true;
        p.jumps = 0;
      } else if (p.vy < 0) {
        p.y = (ty + 1) * TILE + 0.01;
        p.vy = 0;
      }
    }
    for (const pl of this.platforms) {
      if (!(p.x + p.w > pl.x && p.x < pl.x + pl.w)) continue;
      if (p.vy >= 0 && p.y + p.h > pl.y && p.y + p.h < pl.y + pl.h + 12) {
        p.y = pl.y - p.h - 0.01;
        p.vy = 0;
        p.onGround = true;
        p.jumps = 0;
      }
    }
    if (p.onGround && riding !== this.platformUnder(p)) p.y += 0;
  }

  hurt(fromDir = -1) {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'play') return;
    this.hearts -= 1;
    p.invuln = PHYS.invuln;
    p.vx = (fromDir >= 0 ? -1 : 1) * PHYS.hurtKnock;
    p.vy = -230;
    this.events.push({ type: 'hurt', x: p.x + p.w / 2, y: p.y });
    if (this.hearts <= 0) this.die();
  }

  die() {
    this.state = 'dead';
    this.deaths++;
    this.events.push({ type: 'dead' });
  }

  /** بازگشت به نقطهٔ آغاز پس از باخت یک جان (برای «تلاش دوباره») */
  respawn() {
    const p = this.player;
    this.hearts = this.hearts > 0 ? this.hearts : 3;
    p.x = this.spawn.x;
    p.y = this.spawn.y;
    p.vx = 0;
    p.vy = 0;
    p.invuln = 1.5;
    this.state = 'play';
    this.timeLeft = this.level.time || 150;
    this.events.push({ type: 'respawn' });
    this.aimCamera(true);
  }

  aimCamera(snap = false) {
    const p = this.player;
    const target = p.x + p.w / 2 - (this.viewW || 640) / 2;
    const clamped = Math.max(0, Math.min(this.width - (this.viewW || 640), target));
    this.camera.x += (clamped - this.camera.x) * (snap ? 1 : 0.12);
    const ty = Math.max(0, Math.min(this.height - (this.viewH || 420), p.y - (this.viewH || 420) * 0.6));
    this.camera.y += (ty - this.camera.y) * (snap ? 1 : 0.08);
  }

  setViewport(w, h) {
    this.viewW = w;
    this.viewH = h;
    this.aimCamera(true);
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
