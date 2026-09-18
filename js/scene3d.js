// =============================================================
//  scene3d.js — دنیای سه‌بعدی فروشگاه
//
//  شامل: اتاق و دیوارها، در شیشه‌ای کشویی، قفسه‌ها، مدل کالاها،
//  میز صندوق (نوار اسکن، صندوق، کارت‌خوان، کیسه‌ها)، تزئینات
//  (گیاه، پوستر، سبدهای ورودی، تیر چراغ)، فضای بیرون (پیاده‌رو،
//  درخت، ماشین، خیابان، آسمان)، هوا (آفتاب/باران/برف) و افکت‌ها
//  (متن شناور، جرقه، حباب احساس مشتری).
//
//  ➕ محصول جدید: نیازی به تغییر این فایل نیست — قفسه‌ها از
//     PRODUCTS در config.js ساخته می‌شوند و جایگاه ششم آزاد است.
// =============================================================
import * as THREE from 'three';
import { PRODUCTS, GAME } from './config.js';
import { fa, money } from './util.js';
import {
  ROOM,
  DOOR,
  SHELF,
  SHELF_SLOTS,
  REGISTER,
  ENTRANCE,
  TREES,
  LAMP_POST,
  shelfAABB,
  shelfShopSpots,
  buildObstacles,
} from './layout.js';
import { NavGrid } from './nav.js';
import { buildPerson, BASKET_SLOTS } from './person.js';
import { Tweens, easeOutCubic, easeOutBack, clamp01, arcLerp, lerp } from './anim.js';

// سازگاری با کدهای قبلی (main.js و customers.js این‌ها را می‌خواستند)
export { ROOM, DOOR, buildPerson };
export const SPAWN_POS = new THREE.Vector3(ENTRANCE.spawn.x, 0, ENTRANCE.spawn.z);
export const DOOR_POS = new THREE.Vector3(DOOR.x, 0, 2.15);
export const REGISTER_POS = new THREE.Vector3(REGISTER.counter.x, 0, REGISTER.counter.z);
export const REGISTER_SPOT = new THREE.Vector3(REGISTER.pay.x, 0, REGISTER.pay.z);

/** آیا DOM/Canvas داریم؟ (در تست‌های بدون مرورگر نه) */
const HAS_DOM = typeof document !== 'undefined' && !!document.createElement;

const ITEM_X = [-0.32, -0.11, 0.11, 0.32];
const ITEM_Y = [0.36, 0.82, 1.28];

// ---------- کمکی‌های هندسه و جنس ----------
const matCache = new Map();
function mat(color, extra = {}) {
  const key = `${color}-${JSON.stringify(extra)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.88, metalness: 0 }, extra));
    matCache.set(key, m);
  }
  return m;
}
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function roundRectPath(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}
/** بافت از روی canvas — اگر مرورگر canvas 2d نداشت null برمی‌گرداند */
function canvasTex(w, h, draw, { repeat = null } = {}) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) return null;
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// =============================================================
//  کف و دیوار
// =============================================================
function floorTexture() {
  return canvasTex(
    512,
    512,
    (x) => {
      x.fillStyle = '#efe9dc';
      x.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          const t = ((i + j) % 2) * 6;
          x.fillStyle = `rgb(${236 - t},${230 - t},${217 - t})`;
          x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
        }
      x.strokeStyle = 'rgba(160,150,130,0.55)';
      x.lineWidth = 4;
      for (let i = 0; i <= 8; i++) {
        x.beginPath();
        x.moveTo(i * 64, 0);
        x.lineTo(i * 64, 512);
        x.stroke();
        x.beginPath();
        x.moveTo(0, i * 64);
        x.lineTo(512, i * 64);
        x.stroke();
      }
    },
    { repeat: [3, 2.4] }
  );
}

function wallTexture() {
  return canvasTex(
    256,
    256,
    (x) => {
      x.fillStyle = '#eaeff4';
      x.fillRect(0, 0, 256, 256);
      x.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 200; i++) {
        const px = Math.random() * 256;
        const py = Math.random() * 256;
        x.fillRect(px, py, 2, 2);
      }
      x.fillStyle = 'rgba(190,200,210,0.35)';
      x.fillRect(0, 232, 256, 24);
    },
    { repeat: [3, 2] }
  );
}

function grassTexture() {
  return canvasTex(
    256,
    256,
    (x) => {
      x.fillStyle = '#9dbd86';
      x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        x.fillStyle = `rgba(${110 + Math.random() * 50},${150 + Math.random() * 50},${90 + Math.random() * 40},0.7)`;
        x.fillRect(Math.random() * 256, Math.random() * 256, 3, 2);
      }
    },
    { repeat: [14, 14] }
  );
}

function asphaltTexture() {
  return canvasTex(
    128,
    128,
    (x) => {
      x.fillStyle = '#6a6f75';
      x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 400; i++)
        x.fillStyle = `rgba(${90 + Math.random() * 40},${94 + Math.random() * 40},${100 + Math.random() * 40},0.6)`;
      for (let i = 0; i < 400; i++)
        x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    },
    { repeat: [8, 3] }
  );
}

function buildRoom(world) {
  const s = world.scene;
  const { w, d, h } = ROOM;
  const halfW = w / 2;
  const halfD = d / 2;

  // ---- کف ----
  const tiles = floorTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial(tiles ? { map: tiles, roughness: 0.55 } : { color: 0xe9e3d3, roughness: 0.8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  s.add(floor);

  // ---- نورهای سقفی ----
  // ⚠️ عمداً «سقفِ صفحه‌ای» نمی‌گذاریم: دوربین از بالای دیوار به داخل
  //    نگاه می‌کند و یک صفحهٔ سقف کل فروشگاه را می‌پوشاند.
  //    فقط پانل‌های نور و تیرها می‌مانند.
  for (const [lx, lz] of [
    [-1.2, -0.9],
    [1.2, -0.9],
    [-1.2, 0.9],
    [1.2, 0.9],
  ]) {
    const panel = box(1.1, 0.05, 0.5, mat(0xffffff, { emissive: 0xfff3d6, emissiveIntensity: 1.1, roughness: 0.4 }), lx, h - 0.03, lz);
    panel.castShadow = false;
    s.add(panel);
  }
  for (const bz of [-1.2, 0.4]) s.add(box(w, 0.12, 0.1, mat(0xd8dee4), 0, h - 0.08, bz));

  // ---- دیوارها ----
  const wallTex = wallTexture();
  const wallMat = new THREE.MeshStandardMaterial(
    wallTex ? { map: wallTex, roughness: 0.95 } : { color: 0xeaeff4, roughness: 0.95 }
  );
  const paint = mat(0xdfe7ee);
  const baseboard = mat(0x8b949c, { roughness: 0.6 });

  const back = box(w + 0.3, h, 0.14, wallMat, 0, h / 2, -halfD - 0.07);
  const left = box(0.14, h, d, wallMat, -halfW - 0.07, h / 2, 0);
  const right = box(0.14, h, d, wallMat, halfW + 0.07, h / 2, 0);
  s.add(back, left, right);
  // قرنیز
  s.add(box(w + 0.3, 0.09, 0.16, baseboard, 0, 0.045, -halfD - 0.06));
  s.add(box(0.16, 0.09, d, baseboard, -halfW - 0.06, 0.045, 0));
  s.add(box(0.16, 0.09, d, baseboard, halfW + 0.06, 0.045, 0));

  // ---- دیوار جلو: دو تکه + پنجره + لابی در ----
  const doorL = DOOR.x - DOOR.w / 2;
  const doorR = DOOR.x + DOOR.w / 2;
  const segL = doorL + halfW; // عرض تکهٔ چپ
  const segR = halfW - doorR;
  s.add(box(segL, h, 0.14, wallMat, -halfW + segL / 2, h / 2, halfD + 0.07));
  s.add(box(segR, h, 0.14, wallMat, doorR + segR / 2, h / 2, halfD + 0.07));
  s.add(box(segL, 0.09, 0.16, baseboard, -halfW + segL / 2, 0.045, halfD + 0.06));
  s.add(box(segR, 0.09, 0.16, baseboard, doorR + segR / 2, 0.045, halfD + 0.06));

  // پنجرهٔ شیشه‌ای روی دیوار جلو (دو طرف در)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xcfe8ff,
    transparent: true,
    opacity: 0.28,
    roughness: 0.05,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  for (const [cx, cw] of [
    [-halfW + segL / 2, Math.max(0.5, segL - 0.3)],
    [doorR + segR / 2, Math.max(0.3, segR - 0.3)],
  ]) {
    const win = box(cw, 1.25, 0.04, glassMat, cx, 1.55, halfD + 0.03);
    win.castShadow = false;
    s.add(win);
    s.add(box(cw + 0.08, 0.06, 0.08, mat(0xf4f7fa), cx, 2.2, halfD + 0.03));
  }

  // ---- چارچوب در + در کشویی شیشه‌ای ----
  const frameMat = mat(0x6b7683, { metalness: 0.45, roughness: 0.4 });
  s.add(box(0.09, DOOR.h + 0.1, 0.16, frameMat, doorL - 0.02, (DOOR.h + 0.1) / 2, halfD + 0.02));
  s.add(box(0.09, DOOR.h + 0.1, 0.16, frameMat, doorR + 0.02, (DOOR.h + 0.1) / 2, halfD + 0.02));
  s.add(box(DOOR.w + 0.18, 0.12, 0.16, frameMat, DOOR.x, DOOR.h + 0.06, halfD + 0.02));
  const doors = [];
  const w2 = DOOR.w / 2;
  for (const side of [-1, 1]) {
    const panel = new THREE.Group();
    const glass = box(w2, DOOR.h, 0.045, glassMat, 0, DOOR.h / 2, 0);
    glass.castShadow = false;
    panel.add(glass);
    panel.add(box(0.05, DOOR.h, 0.06, frameMat, side * (w2 / 2 - 0.03), DOOR.h / 2, 0));
    panel.add(box(w2, 0.05, 0.07, frameMat, 0, DOOR.h, 0));
    panel.add(box(w2, 0.05, 0.07, frameMat, 0, 0.04, 0));
    panel.add(box(0.04, 0.22, 0.08, frameMat, -side * 0.1, 1.05, 0)); // دستگیره
    panel.position.set(DOOR.x + side * (w2 / 2), 0, halfD + 0.03);
    panel.userData.side = side;
    panel.userData.restX = DOOR.x + side * (w2 / 2);
    s.add(panel);
    doors.push(panel);
  }
  world.doors = doors;

  // حصیر ورودی
  const mat_ = box(DOOR.w + 0.3, 0.02, 0.5, mat(0x5b6470, { roughness: 1 }), DOOR.x, 0.012, halfD - 0.4);
  mat_.castShadow = false;
  s.add(mat_);

  // ---- تابلوی «خوش آمدید» بالای در + تابلوی OPEN ----
  buildSign(world);
  return { floor, walls: [back, left, right] };
}

function buildSign(world) {
  const s = world.scene;
  const halfD = ROOM.d / 2;
  const tex = canvasTex(1024, 200, (x) => {
    const grad = x.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, '#127d4a');
    grad.addColorStop(1, '#0a4a2a');
    x.fillStyle = grad;
    x.fillRect(0, 0, 1024, 200);
    x.fillStyle = '#ffffff';
    x.font = '900 104px Vazirmatn, Tahoma, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('🛒 سوپرمارکت من', 512, 106);
  });
  const board = box(2.6, 0.6, 0.09, mat(0x0b3d22), DOOR.x, 2.62, halfD + 0.1);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.52, 0.52),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  face.position.set(DOOR.x, 2.62, halfD + 0.152);
  s.add(board, face);
  world.signFace = face;

  // تابلوی کوچک باز/بسته
  if (!HAS_DOM) {
    world.drawOpenSign = () => {};
    return;
  }
  const openCanvas = document.createElement('canvas');
  openCanvas.width = 256;
  openCanvas.height = 128;
  const openTex = new THREE.CanvasTexture(openCanvas);
  openTex.colorSpace = THREE.SRGBColorSpace;
  const openMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.21),
    new THREE.MeshBasicMaterial({ map: openTex, toneMapped: false, transparent: true })
  );
  openMesh.position.set(DOOR.x + 0.62, 1.72, halfD + 0.16);
  s.add(openMesh);
  world.drawOpenSign = (isOpen) => {
    const x = openCanvas.getContext('2d');
    if (!x) return;
    x.clearRect(0, 0, 256, 128);
    x.fillStyle = isOpen ? '#12794a' : '#8b2f2f';
    roundRectPath(x, 4, 4, 248, 120, 18);
    x.fill();
    x.fillStyle = '#fff';
    x.font = '900 62px Vazirmatn, Tahoma, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(isOpen ? 'باز است' : 'بسته', 128, 68);
    openTex.needsUpdate = true;
  };
  world.drawOpenSign(true);
}

// =============================================================
//  مدل کالاها (کمی جزئی‌تر از قبل)
// =============================================================
function buildBread() {
  const g = new THREE.Group();
  const body = box(0.22, 0.13, 0.17, mat(0xd9a066), 0, 0.065, 0);
  const top = box(0.19, 0.08, 0.14, mat(0xe7b87f), 0, 0.16, 0);
  for (const z of [-0.045, 0.045]) g.add(box(0.2, 0.012, 0.01, mat(0xc4884c), 0, 0.2, z));
  g.add(body, top);
  return g;
}
function buildApple() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), mat(0xd94f3d, { roughness: 0.45 }));
  m.position.y = 0.09;
  m.scale.y = 0.92;
  m.castShadow = true;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.05, 6), mat(0x6b4a2b));
  stem.position.y = 0.19;
  stem.rotation.z = 0.2;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(0x4c9a4a));
  leaf.position.set(0.03, 0.185, 0);
  leaf.scale.set(1, 0.4, 0.7);
  g.add(m, stem, leaf);
  return g;
}
function buildBanana() {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.1, 0.02, 0),
    new THREE.Vector3(0, 0.15, 0),
    new THREE.Vector3(0.1, 0.02, 0)
  );
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.029, 8), mat(0xf2c94c, { roughness: 0.55 }));
  m.castShadow = true;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat(0x7a5a2a));
  tip.position.set(-0.1, 0.02, 0);
  const tip2 = tip.clone();
  tip2.position.set(0.1, 0.02, 0);
  g.add(m, tip, tip2);
  return g;
}
function buildOil() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.055, 0.21, 14),
    mat(0x9dc27a, { transparent: true, opacity: 0.94, roughness: 0.35 })
  );
  body.position.y = 0.105;
  body.castShadow = true;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.09, 14), mat(0xf6f1e7));
  label.position.y = 0.1;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.05, 8), mat(0x2b5d3a));
  cap.position.y = 0.23;
  g.add(body, label, cap);
  return g;
}
function buildRice() {
  const g = new THREE.Group();
  const bag = box(0.15, 0.21, 0.1, mat(0xf3ead7, { roughness: 0.85 }), 0, 0.105, 0);
  const stripe = box(0.154, 0.055, 0.104, mat(0x2f7d4f), 0, 0.105, 0);
  const top = box(0.11, 0.03, 0.08, mat(0xe4d8bd), 0, 0.225, 0);
  g.add(bag, stripe, top);
  return g;
}
function buildGeneric(color) {
  const g = new THREE.Group();
  g.add(box(0.16, 0.19, 0.13, mat(color ?? 0xcccccc), 0, 0.095, 0));
  return g;
}
const BUILDERS = { bread: buildBread, apple: buildApple, banana: buildBanana, oil: buildOil, rice: buildRice };
export function buildProduct(id, color) {
  const f = BUILDERS[id];
  const g = f ? f() : buildGeneric(color);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// =============================================================
//  قفسه + تگ قیمت
// =============================================================
function buildShelfUnit() {
  const g = new THREE.Group();
  const W = SHELF.w;
  const D = SHELF.d;
  const H = SHELF.h;
  const frame = mat(0x8a5a33, { roughness: 0.95 });
  const board = mat(0xf7f3ea, { roughness: 0.7 });
  const metal = mat(0xb9c1c8, { roughness: 0.5, metalness: 0.3 });
  g.add(box(0.05, H, D, frame, -W / 2 + 0.025, H / 2, 0));
  g.add(box(0.05, H, D, frame, W / 2 - 0.025, H / 2, 0));
  g.add(box(W, H, 0.035, frame, 0, H / 2, -D / 2 + 0.018));
  g.add(box(W, 0.1, D, frame, 0, 0.05, 0));
  for (const y of [0.32, 0.78, 1.24, 1.58]) g.add(box(W - 0.06, 0.035, D - 0.04, board, 0, y, 0));
  // نوار نور پشت قفسه (زیبایی + برجسته‌شدن کالاها)
  const strip = box(W - 0.1, 0.02, 0.02, mat(0xffffff, { emissive: 0xffe9c0, emissiveIntensity: 0.9 }), 0, 1.5, -D / 2 + 0.05);
  strip.castShadow = false;
  g.add(strip);
  // لبهٔ فلزی جلوی طبقه‌ها
  for (const y of [0.3, 0.76, 1.22]) g.add(box(W - 0.06, 0.02, 0.03, metal, 0, y, D / 2 - 0.03));
  return g;
}

function makeTag(product) {
  if (!HAS_DOM) return { group: new THREE.Group(), draw() {}, tick() {} };
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.27),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  const group = new THREE.Group();
  group.add(mesh);
  let anim = 0;
  function draw(price, market) {
    const x = canvas.getContext('2d');
    if (!x) return;
    x.clearRect(0, 0, 256, 112);
    x.fillStyle = '#ffffff';
    roundRectPath(x, 4, 4, 248, 104, 16);
    x.fill();
    const cheap = market != null && price <= market;
    x.strokeStyle = cheap ? '#17a05b' : '#e08b2c';
    x.lineWidth = 6;
    roundRectPath(x, 4, 4, 248, 104, 16);
    x.stroke();
    x.textBaseline = 'middle';
    x.textAlign = 'right';
    x.fillStyle = '#22313f';
    x.font = '700 40px Vazirmatn, Tahoma, sans-serif';
    x.fillText(`${product.emoji} ${product.name}`, 244, 38);
    x.textAlign = 'left';
    x.fillStyle = cheap ? '#0e7a44' : '#b96a10';
    x.font = '900 46px Vazirmatn, Tahoma, sans-serif';
    x.fillText(`${fa(price)} $`, 18, 44);
    x.fillStyle = '#7a8794';
    x.font = '500 26px Vazirmatn, Tahoma, sans-serif';
    x.textAlign = 'right';
    x.fillText(market != null ? `بازار: ${fa(market)} $` : '', 244, 84);
    tex.needsUpdate = true;
    anim = 1;
  }
  return {
    group,
    draw,
    tick(dt) {
      if (anim <= 0) return;
      anim = Math.max(0, anim - dt * 2.4);
      mesh.scale.setScalar(1 + Math.sin(anim * Math.PI) * 0.12);
    },
  };
}

function buildShelves(world) {
  const s = world.scene;
  PRODUCTS.forEach((p, i) => {
    const slot = SHELF_SLOTS[i % SHELF_SLOTS.length];
    const g = buildShelfUnit();
    g.position.set(slot.x, 0, slot.z);
    g.rotation.y = slot.rot;
    s.add(g);
    const items = [];
    for (const y of ITEM_Y)
      for (const x of ITEM_X) {
        const it = buildProduct(p.id, p.color);
        it.position.set(x, y, 0.02);
        it.visible = false;
        it.scale.setScalar(0.01);
        g.add(it);
        items.push(it);
      }
    const tag = makeTag(p);
    tag.group.position.set(0, 1.47, SHELF.d / 2 + 0.01);
    g.add(tag.group);
    // تابلوی ردهٔ کالا بالای قفسه
    const label = canvasTex(256, 64, (x) => {
      x.fillStyle = 'rgba(30,60,45,0.92)';
      roundRectPath(x, 2, 2, 252, 60, 12);
      x.fill();
      x.fillStyle = '#fff';
      x.font = '700 34px Vazirmatn, Tahoma, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(`${p.emoji} ${p.name}`, 128, 34);
    });
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.13),
      new THREE.MeshBasicMaterial({ map: label, toneMapped: false, transparent: true })
    );
    labelMesh.position.set(0, SHELF.h + 0.09, SHELF.d / 2 - 0.04);
    labelMesh.castShadow = false;
    g.add(labelMesh);

    world.shelves[p.id] = {
      group: g,
      items,
      tag,
      product: p,
      shopSpots: shelfShopSpots(i).map((sp) => new THREE.Vector3(sp.x, 0, sp.z)),
      aabb: shelfAABB(slot, SHELF.w, SHELF.d),
      slot,
      lastPrice: null,
      lastMarket: null,
    };
  });
}

// =============================================================
//  میز صندوق
// =============================================================
function buildRegister(world) {
  const s = world.scene;
  const c = REGISTER.counter;
  const wood = mat(0xa06a3c, { roughness: 0.7 });
  const top = mat(0xf1efe9, { roughness: 0.5 });
  const metal = mat(0x9aa3ab, { roughness: 0.4, metalness: 0.5 });

  s.add(box(c.w, 0.86, c.d, mat(0xe3e7ea, { roughness: 0.7 }), c.x, 0.43, c.z));
  s.add(box(c.w + 0.06, 0.06, c.d + 0.06, top, c.x, 0.89, c.z));
  s.add(box(c.w + 0.02, 0.05, 0.03, wood, c.x, 0.62, c.z - c.d / 2 - 0.005));
  // نوار اسکن (نوار سیاه سمت مشتری)
  const belt = box(c.w * 0.62, 0.03, c.d * 0.7, mat(0x2b3138, { roughness: 0.95 }), c.x - c.w * 0.12, 0.93, c.z);
  belt.castShadow = false;
  s.add(belt);
  for (let i = 0; i < 5; i++)
    s.add(box(0.02, 0.035, c.d * 0.7, metal, c.x - c.w * 0.36 + i * 0.12, 0.935, c.z));

  // صندوق + نمایشگر
  const regBody = box(0.3, 0.22, 0.28, mat(0x39424e, { roughness: 0.4 }), c.x + 0.34, 1.03, c.z);
  s.add(regBody);
  if (!HAS_DOM) {
    world.drawRegister = () => {};
    return;
  }
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 256;
  screenCanvas.height = 160;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.14),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  );
  screen.position.set(c.x + 0.34, 1.13, c.z + 0.142);
  screen.rotation.x = -0.42;
  s.add(screen);
  world.drawRegister = (lines) => {
    const x = screenCanvas.getContext('2d');
    if (!x) return;
    x.fillStyle = '#0d2a22';
    x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#7ef0c0';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '700 34px Vazirmatn, Tahoma, sans-serif';
    (lines && lines.length ? lines : ['صندوق', 'خوش آمدید']).slice(0, 3).forEach((t, i) => {
      x.font = i === 0 ? '900 40px Vazirmatn, Tahoma, sans-serif' : '500 30px Vazirmatn, Tahoma, sans-serif';
      x.fillText(t, 128, 44 + i * 42);
    });
    screenTex.needsUpdate = true;
  };
  world.drawRegister(['صندوق', 'آمادهٔ فروش']);

  // اسکنر بارکد
  const scanner = box(0.1, 0.05, 0.12, mat(0x22282e, { roughness: 0.4 }), c.x + 0.05, 0.95, c.z + 0.12);
  scanner.rotation.x = -0.25;
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(0.08, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.5, toneMapped: false })
  );
  beam.rotation.x = -Math.PI / 2 + 0.2;
  beam.position.set(c.x + 0.05, 0.975, c.z + 0.12);
  s.add(scanner, beam);

  // کارت‌خوان و چاپگر رسید
  const cardReader = box(0.1, 0.14, 0.06, mat(0x2f3640, { roughness: 0.4 }), c.x - 0.42, 1.0, c.z - 0.1);
  s.add(cardReader);
  s.add(box(0.14, 0.09, 0.13, mat(0xe8ebee), c.x - 0.3, 0.97, c.z - 0.12));
  // جای کیسه
  const stand = box(0.14, 0.5, 0.14, metal, c.x + 0.52, 0.65, c.z + 0.02);
  s.add(stand);
  for (let i = 0; i < 3; i++) {
    const bagMat = mat(0xefe6d2, { roughness: 0.9 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.22, 8, 1, true), bagMat);
    b.position.set(c.x + 0.52, 0.72 + i * 0.001, c.z + 0.02);
    b.scale.setScalar(1 - i * 0.08);
    s.add(b);
  }
  // جداکنندهٔ کالا
  s.add(box(0.02, 0.1, 0.2, mat(0xd8623c), c.x - 0.1, 0.97, c.z + 0.02));

  // متصدی پشت صندوق
  const cashier = buildPerson({ shirt: 0x1f8a4c, pants: 0x2c3540, hair: 0x14110f, scale: 1 });
  cashier.group.position.set(REGISTER.cashier.x, 0, REGISTER.cashier.z);
  cashier.group.rotation.y = REGISTER.cashier.rot;
  s.add(cashier.group);
  world.cashier = cashier.group;
  world.cashierApi = cashier;

  // تابلوی «صندوق» روی میله
  const signTex = canvasTex(256, 96, (x) => {
    x.fillStyle = '#123c63';
    roundRectPath(x, 3, 3, 250, 90, 14);
    x.fill();
    x.fillStyle = '#fff';
    x.font = '900 52px Vazirmatn, Tahoma, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('🛒 صندوق', 128, 50);
  });
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.19),
    new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false, transparent: true, side: THREE.DoubleSide })
  );
  signMesh.position.set(c.x + 0.1, 1.75, c.z);
  signMesh.rotation.y = 0;
  s.add(signMesh);
  const pole = box(0.03, 0.9, 0.03, metal, c.x + 0.1, 1.36, c.z);
  s.add(pole);
}

// =============================================================
//  تزئینات داخل فروشگاه
// =============================================================
function buildDecor(world) {
  const s = world.scene;
  const halfW = ROOM.w / 2;
  const halfD = ROOM.d / 2;

  // گلدان‌ها
  for (const [px, pz] of [
    [halfW - 0.19, halfD - 0.45],
    [-halfW + 0.18, 0.35],
  ]) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.22, 10), mat(0xb5714f, { roughness: 0.9 }));
    pot.position.y = 0.11;
    pot.castShadow = true;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 10), mat(0x4b3627));
    soil.position.y = 0.22;
    g.add(pot, soil);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0x3f8f4a, { roughness: 0.8 }));
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.09, 0.34 + (i % 2) * 0.08, Math.sin(a) * 0.09);
      leaf.scale.set(0.55, 0.9, 0.55);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(px, 0, pz);
    s.add(g);
    world.plants = world.plants || [];
    world.plants.push(g);
  }

  // سبدهای ورودی (روی هم چیده‌شده) کنار در
  const stack = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.028, 6, 14), mat(0xc25a34));
    b.rotation.x = Math.PI / 2;
    b.position.y = 0.035 + i * 0.055;
    b.castShadow = true;
    stack.add(b);
  }
  stack.position.set(DOOR.x + 0.72, 0, halfD - 0.22);
  s.add(stack);

  // پوسترهای تبلیغاتی روی دیوار چپ
  const posterColors = [
    ['#e94f37', 'پیشنهاد ویژه', 'تخفیف روی میوه'],
    ['#2b8a6b', 'تازه رسید', 'سبزی و صیفی'],
    ['#3f6fb5', 'روزانه', 'لبنیات خنک'],
  ];
  posterColors.forEach(([bg, t1, t2], i) => {
    const tex = canvasTex(256, 340, (x) => {
      x.fillStyle = bg;
      x.fillRect(0, 0, 256, 340);
      x.fillStyle = 'rgba(255,255,255,0.16)';
      x.beginPath();
      x.arc(200, 60, 90, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#fff';
      x.textAlign = 'center';
      x.font = '900 44px Vazirmatn, Tahoma, sans-serif';
      x.fillText(t1, 128, 120);
      x.font = '600 30px Vazirmatn, Tahoma, sans-serif';
      x.fillText(t2, 128, 168);
      x.font = '900 90px Vazirmatn, Tahoma, sans-serif';
      x.fillText(['🍎', '🥬', '🥛'][i], 128, 268);
    });
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.56),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
    );
    board.position.set(-halfW + 0.02, 1.55 - i * 0.0, -1.55 + i * 0.68);
    board.rotation.y = Math.PI / 2;
    s.add(board);
  });

  // برچسب کف: «سبد بردارید» + فلش‌ها
  const arrowTex = canvasTex(256, 256, (x) => {
    x.clearRect(0, 0, 256, 256);
    x.fillStyle = 'rgba(35,90,60,0.5)';
    x.beginPath();
    x.moveTo(128, 30);
    x.lineTo(206, 130);
    x.lineTo(160, 130);
    x.lineTo(160, 226);
    x.lineTo(96, 226);
    x.lineTo(96, 130);
    x.lineTo(50, 130);
    x.closePath();
    x.fill();
  });
  for (const [ax, az] of [
    [DOOR.x - 0.1, 1.1],
    [0.4, -0.1],
  ]) {
    const arrow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, toneMapped: false, depthWrite: false })
    );
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = ax > 0.5 ? Math.PI : Math.PI * 0.85;
    arrow.position.set(ax, 0.012, az);
    s.add(arrow);
  }

  // مجله/آبمیوه کنار در
  const rack = new THREE.Group();
  rack.add(box(0.5, 0.9, 0.3, mat(0x8a5a33), 0, 0.45, 0));
  for (let i = 0; i < 3; i++) {
    rack.add(box(0.44, 0.04, 0.26, mat(0xd8c9a8), 0, 0.24 + i * 0.26, 0.02));
    for (let j = 0; j < 3; j++) {
      const item = box(0.09, 0.16, 0.03, mat([0xe25555, 0x4f8ee2, 0x53b06a][(i + j) % 3]), -0.15 + j * 0.15, 0.34 + i * 0.26, 0.03);
      rack.add(item);
    }
  }
  rack.position.set(-halfW + 0.2, 0, 0.95);
  rack.rotation.y = Math.PI / 2;
  s.add(rack);
}

// =============================================================
//  بیرون فروشگاه: پیاده‌رو، خیابان، درخت، چراغ، ماشین، آسمان
// =============================================================
function buildOutside(world) {
  const s = world.scene;
  const halfD = ROOM.d / 2;

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(26, 44),
    new THREE.MeshStandardMaterial(grassTexture() ? { map: grassTexture(), roughness: 1 } : { color: 0x9dbd86 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.06;
  grass.receiveShadow = true;
  s.add(grass);

  // پیاده‌رو
  const walkTex = canvasTex(
    128,
    128,
    (x) => {
      x.fillStyle = '#cfd2d2';
      x.fillRect(0, 0, 128, 128);
      x.strokeStyle = '#b3b7b7';
      x.lineWidth = 4;
      x.strokeRect(0, 0, 128, 128);
    },
    { repeat: [6, 2] }
  );
  const pavement = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.4),
    new THREE.MeshStandardMaterial(walkTex ? { map: walkTex, roughness: 1 } : { color: 0xcfd2d2 })
  );
  pavement.rotation.x = -Math.PI / 2;
  pavement.position.set(DOOR.x, -0.01, halfD + 1.5);
  pavement.receiveShadow = true;
  s.add(pavement);
  s.add(box(9, 0.14, 0.16, mat(0xa9acac), DOOR.x, 0.06, halfD + 2.72));
  s.add(box(9, 0.14, 0.16, mat(0xa9acac), DOOR.x, 0.06, halfD + 0.3));

  // مسیر تا لابی در
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.4), mat(0xb9b2a4, { roughness: 1 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(DOOR.x, 0.0, halfD + 0.9);
  path.receiveShadow = true;
  s.add(path);

  // خیابان
  const street = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 4),
    new THREE.MeshStandardMaterial(asphaltTexture() ? { map: asphaltTexture(), roughness: 1 } : { color: 0x6a6f75 })
  );
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, -0.03, halfD + 4.9);
  street.receiveShadow = true;
  s.add(street);
  for (let i = -5; i <= 5; i++)
    s.add(box(1.1, 0.01, 0.12, mat(0xf0e9c0), i * 2.1, 0.0, halfD + 4.9));

  // درخت‌ها
  world.trees = [];
  for (const t of TREES) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 8), mat(0x7a5230));
    trunk.position.y = 0.45;
    trunk.castShadow = true;
    tree.add(trunk);
    for (let i = 0; i < 3; i++) {
      const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(0.55 - i * 0.1, 10, 8),
        mat(0x4f8f4a, { roughness: 0.95 })
      );
      leaves.position.set((i - 1) * 0.16, 1.0 + i * 0.38, (i % 2) * 0.12);
      leaves.castShadow = true;
      tree.add(leaves);
    }
    tree.position.set(t.x, 0, t.z);
    tree.rotation.y = t.x;
    s.add(tree);
    world.trees.push(tree);
  }

  // تیر چراغ
  const lamp = new THREE.Group();
  lamp.add(box(0.09, 3.4, 0.09, mat(0x4d545c, { metalness: 0.4, roughness: 0.5 }), 0, 1.7, 0));
  lamp.add(box(0.7, 0.07, 0.09, mat(0x4d545c), -0.3, 3.35, 0));
  const lampHead = box(0.24, 0.1, 0.18, mat(0xfff0c0, { emissive: 0xffe9a0, emissiveIntensity: 0.7 }), -0.62, 3.28, 0);
  lampHead.castShadow = false;
  lamp.add(lampHead);
  lamp.position.set(LAMP_POST.x, 0, LAMP_POST.z);
  s.add(lamp);

  // ماشین پارک‌شده
  const car = new THREE.Group();
  const body = box(1.7, 0.5, 3.1, mat(0x3f6fb5, { metalness: 0.35, roughness: 0.4 }), 0, 0.55, 0);
  const roof = box(1.5, 0.45, 1.6, mat(0xdfe6ee, { metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.85 }), 0, 1.0, -0.1);
  car.add(body, roof);
  for (const [wx, wz] of [
    [-0.85, 1.0],
    [0.85, 1.0],
    [-0.85, -1.0],
    [0.85, -1.0],
  ]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), mat(0x1d2126, { roughness: 0.9 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.3, wz);
    wheel.castShadow = true;
    car.add(wheel);
  }
  for (const lx of [-0.55, 0.55])
    car.add(box(0.3, 0.16, 0.06, mat(0xfff3c4, { emissive: 0xffe066, emissiveIntensity: 0.4 }), lx, 0.6, 1.56));
  car.position.set(-4.4, 0, halfD + 5.2);
  car.rotation.y = 0.06;
  s.add(car);

  // جدول/نیمکت کوچک
  const bench = new THREE.Group();
  bench.add(box(1.2, 0.07, 0.4, mat(0xa8763f), 0, 0.45, 0));
  for (const bx of [-0.5, 0.5]) bench.add(box(0.08, 0.45, 0.36, mat(0x6b7683), bx, 0.22, 0));
  bench.position.set(DOOR.x + 2.6, 0, ROOM.d / 2 + 1.05);
  s.add(bench);

  // آسمان (گرادیان)
  const skyTex = canvasTex(4, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5fa8dd');
    g.addColorStop(0.55, '#a8d3ee');
    g.addColorStop(1, '#e8f2f7');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  if (skyTex) {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(60, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, toneMapped: false })
    );
    sky.position.y = 6;
    s.add(sky);
  }
  // ساختمان‌های دور
  for (let i = 0; i < 7; i++) {
    const bw = 2 + (i % 3);
    const bh = 2.4 + ((i * 7) % 5) * 0.7;
    const b = box(bw, bh, 2, mat(0x9fb2c4, { roughness: 0.95 }), -12 + i * 4.2, bh / 2, ROOM.d / 2 + 12);
    s.add(b);
  }
}

// =============================================================
//  هوا: آفتاب، باران، برف، ابر، پرنده، غبار
// =============================================================
function buildWeather(world) {
  const s = world.scene;
  const count = 420;
  const pos = new Float32Array(count * 3);
  // فقط بیرون از ساختمان می‌بارد (وگرنه داخل فروشگاه هم باران می‌دیدیم!)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 8;
    pos[i * 3 + 1] = Math.random() * 7;
    pos[i * 3 + 2] = 2.6 + Math.random() * 8.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rainMat = new THREE.PointsMaterial({ color: 0xbcd8f0, size: 0.07, transparent: true, opacity: 0.75, sizeAttenuation: true });
  const rain = new THREE.Points(geo, rainMat);
  rain.visible = false;
  s.add(rain);
  world.rain = rain;
  world.rainData = { count, pos, speed: 9 };

  // ابرها
  const clouds = new THREE.Group();
  clouds.visible = false;
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.6, 8, 6), mat(0xffffff, { roughness: 1 }));
      puff.position.set((j - 1.5) * 0.8, Math.random() * 0.3, Math.random() * 0.6);
      puff.scale.y = 0.6;
      cloud.add(puff);
    }
    cloud.position.set(-14 + i * 5.4, 8 + Math.random() * 2.5, -6 + (i % 3) * 5);
    clouds.add(cloud);
  }
  s.add(clouds);
  world.clouds = clouds;

  // پرنده‌ها (هوای آفتابی)
  const birds = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const bird = new THREE.Group();
    const wingGeo = new THREE.BoxGeometry(0.5, 0.03, 0.12);
    const w1 = new THREE.Mesh(wingGeo, mat(0x30363c));
    const w2 = new THREE.Mesh(wingGeo, mat(0x30363c));
    w1.position.x = -0.25;
    w2.position.x = 0.25;
    bird.add(w1, w2, box(0.14, 0.1, 0.1, mat(0x30363c), 0, 0, 0));
    bird.position.set(-5 + i * 3, 5.5 + i * 0.6, -5 - i * 2);
    bird.userData = { phase: i * 2, w1, w2 };
    birds.add(bird);
  }
  birds.visible = true;
  s.add(birds);
  world.birds = birds;

  // غبار داخل فروشگاه (خیلی ملایم)
  const dCount = 60;
  const dPos = new Float32Array(dCount * 3);
  for (let i = 0; i < dCount; i++) {
    dPos[i * 3] = (Math.random() * 2 - 1) * 2.4;
    dPos[i * 3 + 1] = 0.4 + Math.random() * 2.2;
    dPos[i * 3 + 2] = (Math.random() * 2 - 1) * 1.8;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(
    dGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.025, transparent: true, opacity: 0.35 })
  );
  s.add(dust);
  world.dust = dust;
  world.dustData = dPos;
}

export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x8f8574, 1.1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 2.0);
  dir.position.set(6, 9, 5);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  const cam = dir.shadow.camera;
  cam.left = -8;
  cam.right = 8;
  cam.top = 8;
  cam.bottom = -8;
  cam.near = 1;
  cam.far = 30;
  dir.shadow.bias = -0.0008;
  scene.add(dir);
  const inner = new THREE.PointLight(0xfff2d8, 12, 9, 2);
  inner.position.set(0, 2.6, 0);
  scene.add(inner);
  return { hemi, dir, inner };
}

// =============================================================
//  افکت‌ها
// =============================================================
const _v = new THREE.Vector3();
let sparkleGeo = null;

/** متن شناور (مثلاً «+۱۲ $») */
export function floatText(world, text, pos, opts = {}) {
  if (!world) return;
  const color = opts.color || '#ffe066';
  const size = opts.size || 1;
  const tex = canvasTex(256, 128, (x) => {
    x.font = '900 62px Vazirmatn, Tahoma, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 10;
    x.strokeStyle = 'rgba(0,0,0,0.5)';
    x.strokeText(text, 128, 64);
    x.fillStyle = color;
    x.fillText(text, 128, 64);
  });
  if (!tex) return;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(0.85 * size, 0.42 * size, 1);
  spr.renderOrder = 10;
  if (pos && pos.isObject3D) pos.getWorldPosition(_v);
  else _v.set(pos.x, pos.y || 0, pos.z);
  spr.position.copy(_v).add(new THREE.Vector3(0, 1.15, 0));
  world.scene.add(spr);
  world.floats.push({ spr, t: 0, rise: opts.rise ?? 0.5, life: opts.life ?? 1.4 });
}

/** جرقه‌های رنگی (لحظهٔ برداشتن کالا، پرداخت…) */
export function sparkle(world, pos, color = 0xffe066, count = 8, spread = 0.35) {
  if (!world || world.headless) return;
  if (!sparkleGeo) sparkleGeo = new THREE.SphereGeometry(0.022, 6, 5);
  const m = mat(color, { emissive: color, emissiveIntensity: 0.8 });
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(sparkleGeo, m);
    if (pos && pos.isObject3D) pos.getWorldPosition(_v);
    else _v.set(pos.x, pos.y || 0, pos.z);
    p.position.copy(_v);
    p.castShadow = false;
    world.scene.add(p);
    world.sparks.push({
      mesh: p,
      t: 0,
      life: 0.55 + Math.random() * 0.35,
      v: new THREE.Vector3(
        (Math.random() * 2 - 1) * spread,
        0.5 + Math.random() * 0.9,
        (Math.random() * 2 - 1) * spread
      ),
    });
  }
}

/** حباب احساس بالای سر مشتری (🙂 😐 😡 🤩) */
const moodTexCache = new Map();
function moodTexture(emoji) {
  if (!HAS_DOM) return null;
  if (moodTexCache.has(emoji)) return moodTexCache.get(emoji);
  const tex = canvasTex(128, 128, (x) => {
    x.clearRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(255,255,255,0.92)';
    x.beginPath();
    x.arc(64, 60, 46, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(46, 96);
    x.lineTo(64, 122);
    x.lineTo(78, 96);
    x.closePath();
    x.fill();
    x.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(emoji, 64, 62);
  });
  moodTexCache.set(emoji, tex);
  return tex;
}
export function moodBubble(world, target, emoji = '🙂', life = 1.3) {
  if (!world || !target) return;
  const tex = moodTexture(emoji);
  if (!tex) return;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(0.36, 0.36, 1);
  spr.renderOrder = 12;
  spr.position.set(0, 1.55, 0);
  target.add(spr);
  world.bubbles.push({ spr, target, t: 0, life });
}

// =============================================================
//  برداشتن کالا از قفسه (برای مشتری)
// =============================================================
/**
 * بالاترین کالای موجود روی قفسه را «برمی‌دارد»:
 * یک کپی از مدل را در موقعیت جهانی همان کالا در صحنه می‌گذارد و
 * کالای اصلی را پنهان می‌کند (refreshShelves بعداً با موجودی هم‌گام می‌شود).
 */
export function takeShelfItem(world, productId) {
  const sh = world && world.shelves[productId];
  if (!sh) return null;
  const visible = sh.items.filter((it) => it.visible);
  const src = visible.length ? visible[visible.length - 1] : null;
  const from = new THREE.Vector3();
  if (src && src.parent) {
    src.updateWorldMatrix(true, false);
    from.setFromMatrixPosition(src.matrixWorld);
  }
  const mesh = src ? src.clone(true) : buildProduct(sh.product.id, sh.product.color);
  mesh.visible = true;
  mesh.userData.product = productId; // برچسب: این جسم «کالای در دستِ مشتری» است
  mesh.userData.carried = true;
  mesh.scale.setScalar(1);
  mesh.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  if (src && src.parent) {
    src.updateWorldMatrix(true, false);
    mesh.quaternion.setFromRotationMatrix(src.matrixWorld); // چرخش قفسه را نگه دار
  }
  mesh.position.copy(from);
  world.scene.add(mesh);
  if (src) src.visible = false;
  return { mesh, from: from.clone() };
}

// =============================================================
//  حلقهٔ به‌روزرسانی دنیا
// =============================================================
function updateWorld(world, dt) {
  world.t += dt;
  const t = world.t;
  if (world.tweens) world.tweens.update(dt);

  // انیمیشن چیدن کالا روی قفسه
  for (let i = world.scaleAnims.length - 1; i >= 0; i--) {
    const a = world.scaleAnims[i];
    a.t = Math.min(1, a.t + dt / 0.26);
    const e = easeOutBack(a.t);
    a.obj.scale.setScalar(Math.max(0.01, 0.02 + 0.98 * e));
    if (a.t >= 1) world.scaleAnims.splice(i, 1);
  }
  // تگ‌ها
  for (const id of Object.keys(world.shelves)) world.shelves[id].tag.tick(dt);

  // متن‌های شناور
  for (let i = world.floats.length - 1; i >= 0; i--) {
    const f = world.floats[i];
    f.t += dt;
    f.spr.position.y += dt * f.rise;
    f.spr.material.opacity = Math.max(0, 1 - f.t / f.life);
    if (f.t >= f.life) {
      world.scene.remove(f.spr);
      f.spr.material.map && f.spr.material.map.dispose();
      f.spr.material.dispose();
      world.floats.splice(i, 1);
    }
  }
  // جرقه‌ها
  for (let i = world.sparks.length - 1; i >= 0; i--) {
    const s = world.sparks[i];
    s.t += dt;
    s.v.y -= 2.2 * dt;
    s.mesh.position.addScaledVector(s.v, dt);
    s.mesh.scale.setScalar(Math.max(0.01, 1 - s.t / s.life));
    if (s.t >= s.life) {
      world.scene.remove(s.mesh);
      world.sparks.splice(i, 1);
    }
  }
  // حباب احساس‌ها
  for (let i = world.bubbles.length - 1; i >= 0; i--) {
    const b = world.bubbles[i];
    b.t += dt;
    const k = Math.min(1, b.t / 0.18);
    b.spr.scale.setScalar(0.3 + easeOutBack(k) * 0.12);
    b.spr.position.y = 1.42 + Math.sin(b.t * 4) * 0.03;
    if (b.t > b.life) {
      b.spr.material.opacity = Math.max(0, 1 - (b.t - b.life) / 0.3);
      if (b.t > b.life + 0.32) {
        if (b.spr.parent) b.spr.parent.remove(b.spr);
        b.spr.material.dispose();
        world.bubbles.splice(i, 1);
      }
    }
  }

  // در کشویی: با نزدیک‌شدن مشتری باز می‌شود
  const want = world.doorTarget || 0;
  world.doorOpen = lerp(world.doorOpen ?? 0, want, Math.min(1, dt * 7));
  if (world.doors)
    for (const panel of world.doors) {
      panel.position.x = panel.userData.restX + panel.userData.side * world.doorOpen * (DOOR.w / 2 - 0.07);
    }
  // صدای در فقط یک‌بار
  if (world.onDoorChange && Math.abs(world.doorOpen - (world._lastDoor ?? 0)) > 0.02) {
    world.onDoorChange(world.doorOpen > 0.25);
    world._lastDoor = world.doorOpen;
  }

  // هوا
  if (world.rain && world.rain.visible) {
    const d = world.rainData;
    const fall = (world.weather === 'snow' ? 1.6 : d.speed) * dt;
    for (let i = 0; i < d.count; i++) {
      d.pos[i * 3 + 1] -= fall * (world.weather === 'snow' ? 0.6 + (i % 5) * 0.1 : 1);
      if (d.pos[i * 3 + 1] < -0.2) {
        d.pos[i * 3 + 1] = 6.5 + Math.random();
        d.pos[i * 3] = (Math.random() * 2 - 1) * 8;
        d.pos[i * 3 + 2] = 2.6 + Math.random() * 8.5;
      }
    }
    world.rain.geometry.attributes.position.needsUpdate = true;
  }
  if (world.clouds && world.clouds.visible)
    for (let i = 0; i < world.clouds.children.length; i++) {
      const c = world.clouds.children[i];
      c.position.x += dt * (0.25 + i * 0.05);
      if (c.position.x > 16) c.position.x = -16;
    }
  if (world.birds && world.birds.visible)
    for (let i = 0; i < world.birds.children.length; i++) {
      const b = world.birds.children[i];
      const ph = t * 0.32 + i * 2.1;
      b.position.x = Math.cos(ph) * (6 + i);
      b.position.z = ROOM.d / 2 + 3 + Math.sin(ph) * (4 + i);
      b.position.y = 5 + Math.sin(t * 1.1 + i) * 0.35;
      b.rotation.y = -ph + Math.PI / 2;
      const flap = Math.sin(t * 9 + i) * 0.5;
      b.userData.w1.rotation.z = flap;
      b.userData.w2.rotation.z = -flap;
    }
  if (world.dust) {
    const d = world.dustData;
    for (let i = 0; i < d.length / 3; i++) {
      d[i * 3] += Math.sin(t * 0.4 + i) * dt * 0.06;
      d[i * 3 + 1] += Math.cos(t * 0.3 + i * 1.7) * dt * 0.05;
    }
    world.dust.geometry.attributes.position.needsUpdate = true;
  }
  if (world.plants)
    for (let i = 0; i < world.plants.length; i++)
      world.plants[i].rotation.z = Math.sin(t * 1.1 + i) * 0.012;

  // متصدی: نفس‌کشیدن + انیمیشن اسکن
  if (world.cashierApi) {
    const scan = world.cashierScan || 0;
    world.cashierApi.pose({
      t,
      walk: 0,
      holdBasket: 0,
      lean: 0.06 + scan * 0.16,
      lookYaw: Math.sin(t * 0.5) * 0.18,
      reach: world.cashierReach
        ? {
            side: 'R',
            k: world.cashierReach.k,
            target: world.cashierReach.target,
            l1: 0.2,
            l2: 0.245,
          }
        : null,
      fingers: 0.3 + scan * 0.6,
    });
  }
}

// =============================================================
//  ساخت دنیا
// =============================================================
export function createWorld(scene, opts = {}) {
  const world = {
    scene,
    shelves: {},
    nav: null,
    floats: [],
    sparks: [],
    bubbles: [],
    scaleAnims: [],
    tweens: new Tweens(),
    cashier: null,
    cashierApi: null,
    cashierScan: 0,
    cashierReach: null,
    doorOpen: 0,
    doorTarget: 0,
    weather: 'sun',
    t: 0,
    headless: false,
    plants: [],
  };
  buildRoom(world);
  buildShelves(world);
  buildRegister(world);
  buildDecor(world);
  buildOutside(world);
  buildWeather(world);

  // شبکهٔ مسیریابی از همان نقشهٔ صحنه
  world.nav = opts.nav || new NavGrid();
  for (const sp of [ENTRANCE.spawn, ENTRANCE.doorOutside, ENTRANCE.doorInside, ENTRANCE.exitHint, ENTRANCE.leave])
    world.nav.carve(sp.x, sp.z);
  for (const p of [REGISTER.pay, ...REGISTER.queue, ...REGISTER.spill]) world.nav.carve(p.x, p.z);
  for (const id of Object.keys(world.shelves))
    for (const sp of world.shelves[id].shopSpots) world.nav.carve(sp.x, sp.z);

  const redrawAll = () => {
    for (const id of Object.keys(world.shelves)) {
      const sh = world.shelves[id];
      if (sh.lastPrice != null) sh.tag.draw(sh.lastPrice, sh.lastMarket);
    }
  };
  world.redrawText = redrawAll;
  world.setWeather = (kind) => setWeather(world, kind);
  world.setDoor = (open) => {
    world.doorTarget = open ? 1 : 0;
  };
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => world.redrawText()).catch(() => {});
  world.update = (dt) => updateWorld(world, dt);
  return world;
}

function setWeather(world, kind) {
  world.weather = kind;
  const rainy = kind === 'rain' || kind === 'snow';
  if (world.rain) {
    world.rain.visible = rainy;
    world.rain.material.color.set(kind === 'snow' ? 0xffffff : 0xbcd8f0);
    world.rain.material.size = kind === 'snow' ? 0.11 : 0.07;
    world.rain.material.opacity = kind === 'snow' ? 0.95 : 0.7;
  }
  if (world.clouds) world.clouds.visible = kind !== 'sun';
  if (world.birds) world.birds.visible = kind === 'sun';
}

/**
 * دنیای «بدون گرافیک» — وقتی WebGL در دسترس نیست.
 * همان interface را دارد تا منطق بازی کامل کار کند؛ فقط چیزی رندر نمی‌شود.
 */
export function createHeadlessWorld(opts = {}) {
  const world = {
    scene: new THREE.Scene(),
    shelves: {},
    nav: opts.nav || new NavGrid(),
    floats: [],
    sparks: [],
    bubbles: [],
    scaleAnims: [],
    tweens: new Tweens(),
    cashier: null,
    cashierApi: null,
    doorOpen: 0,
    doorTarget: 0,
    weather: 'sun',
    t: 0,
    headless: true,
  };
  PRODUCTS.forEach((p, i) => {
    world.shelves[p.id] = {
      group: null,
      items: [],
      tag: { draw() {}, tick() {} },
      shopSpots: shelfShopSpots(i).map((sp) => new THREE.Vector3(sp.x, 0, sp.z)),
      aabb: shelfAABB(SHELF_SLOTS[i % SHELF_SLOTS.length]),
      slot: SHELF_SLOTS[i % SHELF_SLOTS.length],
      product: p,
      lastPrice: null,
      lastMarket: null,
    };
  });
  world.update = () => {};
  world.redrawText = () => {};
  world.setWeather = () => {};
  world.setDoor = () => {};
  return world;
}

// =============================================================
//  هم‌گام‌سازی قفسه‌ها و تگ‌ها
// =============================================================
export function refreshShelves(world, inventory) {
  if (!world || !inventory) return;
  for (const p of PRODUCTS) {
    const sh = world.shelves[p.id];
    if (!sh) continue;
    const n = Math.min(inventory[p.id] || 0, GAME.maxDisplayPerShelf);
    sh.items.forEach((it, j) => {
      const want = j < n;
      if (want && !it.visible) {
        it.scale.setScalar(0.02);
        it.visible = true;
        world.scaleAnims.push({ obj: it, t: 0 });
      } else if (!want && it.visible) {
        it.visible = false;
      }
    });
  }
}

export function refreshTags(world, salePrices, marketPrices) {
  if (!world || !salePrices) return;
  for (const p of PRODUCTS) {
    const sh = world.shelves[p.id];
    if (!sh) continue;
    sh.lastPrice = salePrices[p.id];
    sh.lastMarket = marketPrices ? marketPrices[p.id] : sh.lastMarket;
    sh.tag.draw(sh.lastPrice, sh.lastMarket);
  }
}

/** برای سازگاری با کد قدیمی: REGISTER_POS را می‌شود به floatText داد */
export const counterPos = REGISTER_POS;
export const basketSlots = BASKET_SLOTS;
export const obstacles = buildObstacles;
export { money, floatText as floatTextCompat };
