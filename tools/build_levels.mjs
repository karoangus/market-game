// =============================================================
//  سازندهٔ نقشهٔ «دویدن تا برج» — سطرهای مرحله را تولید می‌کند
//  اجرا: node tools/build_levels.mjs
//  خروجی (سطرهای مرحله) را داخل games/borj/js/levels.js بچسبان.
//  چرا تولید می‌شود؟ چون سطرهای نقشه باید دقیقاً هم‌عرض باشند؛ دستی‌نوشتنشان
//  یعنی یک کاراکتر کم/زیاد و نقشهٔ خراب.
// =============================================================
function build(W, spec) {
  const H = 12;
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (x, y, ch) => { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = ch; };
  const ground = (x0, x1) => { for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) { put(x, 10, '#'); put(x, 11, '#'); } };

  // زمین با گودال‌های دو کاشی
  let cur = 0;
  spec.segments.forEach((seg, i) => {
    ground(cur, cur + seg - 1);
    cur += seg;
    if (i < spec.segments.length - 1) cur += (spec.pits || [])[i] ?? 2;
  });

  for (const s of spec.plat || []) for (let i = 0; i < s.w; i++) put(s.x + i, s.y, '=');
  // خارها روی زمین
  for (const s of spec.spikes || []) for (let i = 0; i < s.n; i++) put(s.x + i, 9, '^');
  const solid = (x, y) => y >= H || ['#', '=', 'm'].includes(g[y]?.[x]);
  const warn = [];
  for (const e of spec.enemies || []) {
    if (!solid(e.x, e.y + 1)) { warn.push(`دشمن (${e.x},${e.y}) روی هوا بود و ساخته نشد`); continue; }
    if (g[e.y][e.x] !== '.') { warn.push(`دشمن (${e.x},${e.y}) روی خار/سکه بود و ساخته نشد`); continue; }
    put(e.x, e.y, e.big ? 'b' : 'e');
  }
  if (spec.power) put(spec.power.x, spec.power.y, '*');
  for (const c of spec.coins || []) {
    for (let i = 0; i < (c.n || 1); i++) {
      if (g[c.y][c.x + i] !== '.') { warn.push(`سکه (${c.x + i},${c.y}) جا نبود`); continue; }
      put(c.x + i, c.y, 'o');
    }
  }
  for (const m of spec.moves || []) for (let i = 0; i < m.w; i++) put(m.x + i, m.y, 'm');
  put(spec.spawn.x, spec.spawn.y, 'P');
  put(spec.goal.x, spec.goal.y, 'G');
  if (warn.length) console.error('⚠️ ' + warn.join(' | '));
  return g.map((r) => r.join(''));
}

const out = {};
out[1] = build(48, {
  segments: [15, 26, 5],
  pits: [1, 1, 1, 1, 1],
  plat: [{ x: 7, y: 8, w: 4 }, { x: 20, y: 7, w: 5 }, { x: 33, y: 8, w: 4 }],
  coins: [{ x: 8, y: 7, n: 3 }, { x: 21, y: 6, n: 3 }, { x: 34, y: 7, n: 3 }, { x: 11, y: 9 }, { x: 29, y: 9 }],
  enemies: [{ x: 12, y: 9 }, { x: 29, y: 6 }],
  spikes: [{ x: 23, n: 2 }],
  spawn: { x: 2, y: 9 },
  goal: { x: 45, y: 9 },
});
out[2] = build(56, {
  segments: [12, 14, 16, 11],
  pits: [1, 1, 1, 1, 1],
  plat: [{ x: 6, y: 5, w: 3 }, { x: 17, y: 7, w: 5 }, { x: 30, y: 6, w: 5 }, { x: 40, y: 8, w: 5 }],
  coins: [{ x: 6, y: 4, n: 3 }, { x: 18, y: 6, n: 3 }, { x: 31, y: 5, n: 3 }, { x: 41, y: 7, n: 3 }, { x: 26, y: 9 }, { x: 38, y: 9 }],
  enemies: [{ x: 9, y: 9 }, { x: 24, y: 9 }, { x: 34, y: 5 }, { x: 47, y: 9 }],
  spikes: [{ x: 20, n: 2 }],
  spawn: { x: 2, y: 9 },
  goal: { x: 52, y: 9 },
});

out[3] = build(64, {
  segments: [10, 12, 12, 14, 8],
  pits: [1, 1, 1, 1, 1],
  plat: [{ x: 12, y: 8, w: 3 }, { x: 26, y: 7, w: 5 }, { x: 41, y: 6, w: 5 }, { x: 50, y: 8, w: 4 }],
  moves: [{ x: 34, y: 8, w: 3 }],
  coins: [{ x: 12, y: 7, n: 3 }, { x: 27, y: 6, n: 3 }, { x: 42, y: 5, n: 3 }, { x: 51, y: 7, n: 3 }, { x: 6, y: 9 }, { x: 20, y: 9 }],
  enemies: [{ x: 16, y: 9 }, { x: 26, y: 6 }, { x: 44, y: 9 }, { x: 52, y: 9 }],
  spikes: [{ x: 18, n: 2 }, { x: 46, n: 2 }],
  spawn: { x: 2, y: 9 },
  goal: { x: 60, y: 9 },
});

out[4] = build(72, {
  segments: [12, 14, 10, 16, 12],
  pits: [1, 1, 1, 1, 1],
  plat: [{ x: 20, y: 8, w: 4 }, { x: 33, y: 7, w: 5 }, { x: 45, y: 6, w: 5 }, { x: 52, y: 8, w: 4 }],
  coins: [{ x: 21, y: 7, n: 3 }, { x: 34, y: 6, n: 3 }, { x: 46, y: 5, n: 3 }, { x: 53, y: 7, n: 3 }, { x: 8, y: 9 }, { x: 25, y: 9 }],
  enemies: [{ x: 6, y: 9 }, { x: 16, y: 9 }, { x: 35, y: 6, big: true }, { x: 42, y: 9 }, { x: 55, y: 9 }],
  spikes: [{ x: 23, n: 2 }, { x: 48, n: 2 }],
  power: { x: 37, y: 4 },
  spawn: { x: 2, y: 9 },
  goal: { x: 68, y: 9 },
});

out[5] = build(80, {
  segments: [10, 12, 10, 12, 14, 8],
  pits: [1, 1, 1, 1, 1],
  plat: [{ x: 4, y: 6, w: 4 }, { x: 17, y: 8, w: 4 }, { x: 31, y: 6, w: 5 }, { x: 39, y: 7, w: 4 }, { x: 64, y: 6, w: 5 }],
  moves: [{ x: 30, y: 9, w: 3 }, { x: 58, y: 9, w: 3 }],
  coins: [{ x: 4, y: 5, n: 3 }, { x: 18, y: 7, n: 3 }, { x: 32, y: 5, n: 3 }, { x: 40, y: 6, n: 3 }, { x: 65, y: 5, n: 3 }, { x: 14, y: 9 }, { x: 46, y: 9 }, { x: 72, y: 9 }],
  enemies: [{ x: 14, y: 9 }, { x: 28, y: 9 }, { x: 33, y: 5, big: true }, { x: 47, y: 9 }, { x: 56, y: 9 }, { x: 72, y: 9 }],
  spikes: [{ x: 23, n: 2 }, { x: 43, n: 2 }],
  power: { x: 42, y: 4 },
  spawn: { x: 2, y: 9 },
  goal: { x: 76, y: 9 },
});

for (const [n, rows] of Object.entries(out)) {
  console.log(`// ---- مرحله ${n} ----`);
  rows.forEach((r) => console.log(`      '${r}',`));
  console.log('');
}
