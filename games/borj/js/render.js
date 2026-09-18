// =============================================================
//  render.js — نقاشِ دوبعدی بازی «دویدن تا برج» (Canvas 2D)
//  هیچ تصویر بیرونی لازم نیست؛ همه‌چیز با شکل و رنگ کشیده می‌شود.
// =============================================================
import { TILE } from './levels.js';

/** رنگ‌بندی هر مرحله: آسمان، تپه‌ها، زمین */
export const THEMES = [
  { sky: ['#f7c873', '#f2a05b'], hill: ['#8d6e4b', '#6b5236'], ground: '#7b5a3a', top: '#69a84f', night: false },
  { sky: ['#5b6ea8', '#2f3a63'], hill: ['#3b4470', '#2a3154'], ground: '#4a4a63', top: '#8d7fb5', night: true },
  { sky: ['#7cc6e8', '#d8f0b4'], hill: ['#2f6b45', '#1d4730'], ground: '#5a4632', top: '#4f9c47', night: false },
  { sky: ['#bfe3f5', '#f6dda6'], hill: ['#cbb17c', '#b39a63'], ground: '#c9ab74', top: '#f7ecc9', night: false },
  { sky: ['#7a2b2b', '#2b1120'], hill: ['#5a1f22', '#3a1519'], ground: '#4a2a2a', top: '#8a3a3a', night: true },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.t = 0;
  }

  /** بالاترین کاشیِ جامدِ هر ستون (برای تشخیص چاله‌ها) */
  columnTops(g) {
    if (this._topsFor === g && this._tops) return this._tops;
    const tops = new Array(g.cols).fill(-1);
    for (let tx = 0; tx < g.cols; tx++) {
      for (let ty = 0; ty < g.h; ty++)
        if (g.solidAt(tx, ty)) {
          tops[tx] = ty;
          break;
        }
    }
    this._topsFor = g;
    this._tops = tops;
    return tops;
  }

  /** زیرِ خطِ زمین، چاله‌ها تاریک می‌شوند تا عمق داشته باشند */
  pits(ctx, g, camX, camY) {
    const tops = this.columnTops(g);
    const x0 = clamp(Math.floor(camX / TILE) - 1, 0, g.cols - 1);
    const x1 = clamp(Math.ceil((camX + this.w) / TILE) + 1, 0, g.cols - 1);
    for (let tx = x0; tx <= x1; tx++) {
      const top = tops[tx];
      if (top < 0) continue;
      let gap = top;
      while (gap < g.h && !g.solidAt(tx, gap)) gap++;
      if (gap >= g.h) continue; // ستونِ کاملِ توپر
      const yTop = gap * TILE;
      const yBot = g.height + TILE;
      const gr = ctx.createLinearGradient(0, yTop, 0, yBot);
      gr.addColorStop(0, 'rgba(6,8,14,.55)');
      gr.addColorStop(0.5, 'rgba(6,8,14,.8)');
      gr.addColorStop(1, 'rgba(6,8,14,.95)');
      ctx.fillStyle = gr;
      ctx.fillRect(tx * TILE, yTop, TILE, yBot - yTop);
    }
  }

  /** اندازهٔ واقعیِ بوم را با پنجره هم‌آهنگ می‌کند (با تراکم پیکسل دستگاه) */
  resize(cssW, cssH) {
    const dpr = Math.min(2, (HAS_DPR && window.devicePixelRatio) || 1);
    this.w = Math.round(cssW);
    this.h = Math.round(cssH);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.dpr = dpr;
  }

  // ---------------- سازنده‌های رخداد ----------------
  poke(kind, x, y) {
    const n = kind === 'stomp' ? 12 : kind === 'coin' ? 8 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 120;
      const col = kind === 'coin' ? '#ffd75e' : kind === 'stomp' ? '#cfd8e3' : kind === 'power' ? '#8be9fd' : '#ff7a7a';
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.5 + Math.random() * 0.35, max: 0.85, col, r: 2 + Math.random() * 2 });
    }
    if (kind === 'hurt') this.shake = 0.32;
    if (kind === 'dead') this.shake = 0.5;
  }
  label(text, x, y, col = '#ffe9a8') {
    this.texts.push({ text, x, y, life: 1.1, col });
  }

  update(dt) {
    this.t += dt;
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += 620 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 34 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  }

  // ---------------- نقاشی اصلی ----------------
  draw(g, levelIndex) {
    const ctx = this.ctx;
    const th = THEMES[levelIndex % THEMES.length];
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    const sh = this.shake > 0 ? (Math.random() - 0.5) * 10 * (this.shake / 0.5) : 0;
    const camX = Math.round(g.camera.x + sh);
    const camY = Math.round(g.camera.y);

    this.sky(ctx, th, camX, camY);
    ctx.save();
    ctx.translate(-camX, -camY);
    this.hills(ctx, th, camX, camY);
    this.pits(ctx, g, camX, camY);
    this.tiles(ctx, g, camX, camY, th);
    this.levelObjects(ctx, g);
    this.enemies(ctx, g);
    if (g.player.anim !== undefined) this.player(ctx, g);
    this.particlesAndTexts(ctx);
    ctx.restore();
    this.vignette(ctx, th);
  }

  sky(ctx, th, camX, camY) {
    const gr = ctx.createLinearGradient(0, 0, 0, this.h);
    gr.addColorStop(0, th.sky[0]);
    gr.addColorStop(1, th.sky[1]);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, this.w, this.h);
    if (th.night) {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (let i = 0; i < 40; i++) {
        const x = (i * 137.5 - camX * 0.06) % (this.w + 40);
        const y = ((i * 79.3) % (this.h * 0.6)) - camY * 0.04;
        const r = i % 7 === 0 ? 1.7 : 1;
        ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(this.t * 0.8 + i));
        ctx.beginPath();
        ctx.arc(x < 0 ? x + this.w + 40 : x, Math.max(6, y), r, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // ماه
      const mx = this.w - 90 - ((camX * 0.03) % 60);
      ctx.fillStyle = '#f6f1d5';
      ctx.beginPath();
      ctx.arc(mx, 70, 26, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.beginPath();
      ctx.arc(mx - 8, 64, 5, 0, 7);
      ctx.arc(mx + 6, 78, 3.5, 0, 7);
      ctx.fill();
    } else {
      const sx = this.w - 110 - ((camX * 0.02) % 40);
      ctx.fillStyle = 'rgba(255,246,200,.9)';
      ctx.beginPath();
      ctx.arc(sx, 72, 34, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(sx, 72, 54, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  hills(ctx, th, camX, camY) {
    for (let layer = 0; layer < 2; layer++) {
      const par = 0.18 + layer * 0.22;
      const baseY = this.h * 0.62 + layer * 60 - camY * (0.2 + layer * 0.2);
      const ox = -camX * par;
      ctx.fillStyle = th.hill[layer];
      ctx.beginPath();
      ctx.moveTo(0, this.h + 40);
      for (let x = -60; x <= this.w + 60; x += 20) {
        const wx = x - ox;
        const y = baseY - Math.sin(wx / (170 - layer * 40)) * (26 - layer * 8) - Math.sin(wx / 57) * 6;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(this.w, this.h + 40);
      ctx.closePath();
      ctx.fill();
    }
  }

  tiles(ctx, g, camX, camY, th) {
    const x0 = clamp(Math.floor(camX / TILE) - 1, 0, g.cols - 1);
    const x1 = clamp(Math.ceil((camX + this.w) / TILE) + 1, 0, g.cols - 1);
    const y0 = clamp(Math.floor(camY / TILE) - 1, 0, g.h - 1);
    const y1 = clamp(Math.ceil((camY + this.h) / TILE) + 1, 0, g.h - 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = g.tileAt(tx, ty);
        const px = tx * TILE;
        const py = ty * TILE;
        if (c === '#') {
          const open = !g.solidAt(tx, ty - 1);
          ctx.fillStyle = th.ground;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,.14)';
          ctx.fillRect(px, py + TILE - 5, TILE, 5);
          if (open) {
            ctx.fillStyle = th.top;
            ctx.fillRect(px, py, TILE, 8);
            ctx.fillStyle = 'rgba(255,255,255,.16)';
            ctx.fillRect(px, py, TILE, 3);
          }
          // بافتِ سنگ
          ctx.fillStyle = 'rgba(0,0,0,.09)';
          if ((tx + ty) % 3 === 0) ctx.fillRect(px + 5, py + 14, 6, 4);
          if ((tx * 2 + ty) % 4 === 0) ctx.fillRect(px + 16, py + 20, 7, 4);
        } else if (c === '=') {
          // سکو: تخته‌چوب
          ctx.fillStyle = '#a9743f';
          ctx.fillRect(px, py + 6, TILE, TILE - 10);
          ctx.fillStyle = '#c98f52';
          ctx.fillRect(px, py + 6, TILE, 5);
          ctx.fillStyle = 'rgba(0,0,0,.2)';
          ctx.fillRect(px + TILE - 3, py + 6, 3, TILE - 10);
          ctx.fillStyle = 'rgba(255,255,255,.12)';
          ctx.fillRect(px + 4, py + 16, TILE - 10, 2);
        } else if (c === '^') {
          ctx.fillStyle = '#c9d1dc';
          for (let s = 0; s < 3; s++) {
            const sx = px + s * (TILE / 3);
            ctx.beginPath();
            ctx.moveTo(sx, py + TILE);
            ctx.lineTo(sx + TILE / 6, py + 6);
            ctx.lineTo(sx + TILE / 3, py + TILE);
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,.5)';
          ctx.fillRect(px + 4, py + TILE - 4, TILE - 8, 2);
        }
      }
    }
  }

  levelObjects(ctx, g) {
    const t = this.t;
    for (const c of g.coinsList) {
      if (c.taken) continue;
      const bob = Math.sin(t * 3 + c.ph) * 3;
      const w = Math.abs(Math.cos(t * 2.6 + c.ph)) * 9 + 2.5;
      ctx.fillStyle = '#8a6a12';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + bob, w, 9, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + bob, Math.max(1.5, w - 2), 7, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath();
      ctx.ellipse(c.x - 1.5, c.y + bob - 2.5, Math.max(0.6, (w - 2) * 0.28), 2, 0, 0, 7);
      ctx.fill();
    }
    if (g.power && !g.power.taken) {
      const cx = g.power.x + TILE / 2;
      const cy = g.power.y + TILE / 2 + Math.sin(t * 2.4) * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 1.2);
      ctx.fillStyle = 'rgba(139,233,253,.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#8be9fd';
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(9, 0);
      ctx.lineTo(0, 11);
      ctx.lineTo(-9, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (g.goal) {
      const gx = g.goal.x + TILE / 2;
      const gy = g.goal.y + g.goal.h;
      const pulse = 1 + Math.sin(t * 2.2) * 0.05;
      // پرتوی نور از دروازه به آسمان
      const beam = ctx.createLinearGradient(gx, gy - g.goal.h * 2.4, gx, gy);
      beam.addColorStop(0, 'rgba(255,236,150,0)');
      beam.addColorStop(1, 'rgba(255,236,150,.42)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(gx - 4, gy);
      ctx.lineTo(gx + 4, gy);
      ctx.lineTo(gx + TILE * 1.5, gy - g.goal.h * 2.4);
      ctx.lineTo(gx - TILE * 1.5, gy - g.goal.h * 2.4);
      ctx.closePath();
      ctx.fill();
      // هالهٔ گرد
      const g2 = ctx.createRadialGradient(gx, gy - TILE, 2, gx, gy - TILE, TILE * 1.7 * pulse);
      g2.addColorStop(0, 'rgba(255,244,180,.7)');
      g2.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(gx, gy - TILE, TILE * 1.7 * pulse, 0, 7);
      ctx.fill();
      // دو پایه و طاقِ دروازه
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(g.goal.x - 3, gy - TILE * 1.5, 6, TILE * 1.5);
      ctx.fillRect(g.goal.x + TILE - 3, gy - TILE * 1.5, 6, TILE * 1.5);
      ctx.strokeStyle = 'rgba(255,236,150,.95)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(gx, gy - TILE * 0.9, TILE * 0.62, Math.PI, 2 * Math.PI);
      ctx.stroke();
      // ذره‌های بالارونده
      for (let i = 0; i < 5; i++) {
        const ph = (t * 0.55 + i / 5) % 1;
        ctx.globalAlpha = (1 - ph) * 0.8;
        ctx.fillStyle = '#fff3bd';
        ctx.beginPath();
        ctx.arc(gx + Math.sin((ph + i) * 6.3) * 14, gy - ph * g.goal.h * 1.5, 2.2, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // پرچم
      ctx.fillStyle = '#ffd75e';
      const fy = gy - TILE * 1.6 + Math.sin(t * 3) * 2;
      ctx.beginPath();
      ctx.moveTo(gx, fy);
      ctx.lineTo(gx + 18, fy + 7);
      ctx.lineTo(gx, fy + 14);
      ctx.closePath();
      ctx.fill();
    }
  }

  enemies(ctx, g) {
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const big = e.kind === 'big';
      const bob = Math.sin(e.anim * 8) * 1.6;
      const cx = e.x + e.w / 2;
      const by = e.y + e.h + bob;
      // سایه
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(cx, by - 1, e.w * 0.5, 3, 0, 0, 7);
      ctx.fill();
      // بدن
      ctx.fillStyle = big ? '#7d3b52' : '#6b4f8f';
      ctx.beginPath();
      ctx.moveTo(e.x, by - e.h * 0.25);
      ctx.quadraticCurveTo(e.x, e.y + bob, cx, e.y + bob);
      ctx.quadraticCurveTo(e.x + e.w, e.y + bob, e.x + e.w, by - e.h * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = big ? '#a4506a' : '#8f6bbd';
      ctx.beginPath();
      ctx.ellipse(cx - e.w * 0.12, e.y + e.h * 0.35 + bob, e.w * 0.32, e.h * 0.26, 0, 0, 7);
      ctx.fill();
      // پاها
      ctx.fillStyle = '#2b2333';
      const sw = Math.sin(e.anim * 12) * 3;
      ctx.fillRect(e.x + 3, by - 4, 5, 5 + sw * 0.4);
      ctx.fillRect(e.x + e.w - 8, by - 4, 5, 5 - sw * 0.4);
      // چشم‌ها
      const dir = e.dir >= 0 ? 1 : -1;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx + dir * 3 - 4, e.y + e.h * 0.34 + bob, big ? 5 : 4, 0, 7);
      ctx.arc(cx + dir * 3 + 4, e.y + e.h * 0.34 + bob, big ? 5 : 4, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#1b1524';
      ctx.beginPath();
      ctx.arc(cx + dir * 4.5 - 4, e.y + e.h * 0.34 + bob, 2.2, 0, 7);
      ctx.arc(cx + dir * 4.5 + 4, e.y + e.h * 0.34 + bob, 2.2, 0, 7);
      ctx.fill();
      if (big) {
        ctx.fillStyle = '#f2dede';
        ctx.fillRect(cx - 6, by - e.h * 0.42, 3, 5);
        ctx.fillRect(cx + 3, by - e.h * 0.42, 3, 5);
      }
    }
  }

  player(ctx, g) {
    const p = g.player;
    const t = this.t;
    const onAir = !p.onGround;
    const running = Math.abs(p.vx) > 12 && !onAir;
    const speedK = clamp(Math.abs(p.vx) / 190, 0, 1);
    const blink = p.invuln > 0 && Math.floor(t * 18) % 2 === 0;
    const squash = onAir ? (p.vy < 0 ? 1.06 : 0.94) : 1;

    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h);
    ctx.scale(p.facing, 1);
    if (blink) ctx.globalAlpha = 0.45;
    ctx.scale(squash, 2 - squash);

    // سایه
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 10, 3, 0, 0, 7);
    ctx.fill();
    ctx.globalAlpha /= 0.9;

    // پاها
    const legPh = running ? Math.sin(p.anim * 14) * 6 * speedK : Math.sin(t * 2) * 0.6;
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(-7, -9, 5, 9 + legPh * 0.4);
    ctx.fillRect(2, -9, 5, 9 - legPh * 0.4);
    ctx.fillStyle = '#1b2733';
    ctx.fillRect(-8, -2, 7, 3);
    ctx.fillRect(1, -2, 7, 3);

    // تنه و کوله
    ctx.fillStyle = '#2f7d5d';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-9, -24, 18, 16, 4) : ctx.rect(-9, -24, 18, 16);
    ctx.fill();
    ctx.fillStyle = '#c9702f';
    ctx.fillRect(-12, -22, 5, 11);
    ctx.fillStyle = '#e08b3e';
    ctx.fillRect(-12, -22, 5, 3);

    // دستِ پشت و جلو
    const armPh = running ? Math.sin(p.anim * 14 + 1.4) * 5 * speedK : 0;
    ctx.fillStyle = '#e8b78c';
    ctx.fillRect(5, -22 + armPh * 0.3, 4.5, 10);
    ctx.fillStyle = '#f0c69c';
    ctx.fillRect(-8, -21 - armPh * 0.4, 4.5, 9);

    // سر
    ctx.fillStyle = '#f0c69c';
    ctx.beginPath();
    ctx.arc(0, -31, 8.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#3b2a1d';
    ctx.beginPath();
    ctx.arc(0, -33, 8.7, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.fillRect(-8.7, -34, 17.4, 3);
    // چشم و لبخند
    ctx.fillStyle = '#22303c';
    ctx.beginPath();
    ctx.arc(3.4, -30.5, 1.6, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#22303c';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(2, -27, 3, 0.1, Math.PI - 0.4);
    ctx.stroke();
    ctx.restore();
  }

  particlesAndTexts(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.col;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  vignette(ctx, th) {
    const g2 = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, th.night ? 'rgba(0,0,0,.45)' : 'rgba(40,20,0,.22)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}

const HAS_DPR = typeof window !== 'undefined';
