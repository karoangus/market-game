// =============================================================
//  scene3d.js — ساخت دنیای سه‌بعدی (بدون منطق بازی):
//  اتاق ۲۰ متری، دیوارها، قفسه‌ها، محصولات، تگ‌های قیمت،
//  صندوق، متصدی، تابلوی ورودی و فضای بیرون.
//
//  ➕ محصول جدید: نیاز به تغییر این فایل ندارد — قفسه‌ها از
//     PRODUCTS در config.js ساخته می‌شوند و محصول ششم به بعد
//     خودکار جایگاه آزاد بعدی (SLOTS) را می‌گیرد. مدل سه‌بعدی
//     جدید را (اختیاری) به BUILDERS اضافه کنید، در غیر این
//     صورت یک مدل جعبه‌ای پیش‌فرض ساخته می‌شود.
// =============================================================
import * as THREE from 'three';
import { PRODUCTS, GAME } from './config.js';
import { fa } from './util.js';

export const ROOM = { w: 5, d: 4, h: 2.8, doorW: 1.4 }; // ۵×۴ = ۲۰ m²
export const SPAWN_POS = new THREE.Vector3(0, 0, 3.9); // جایشابی مشتری‌ها (بیرون)
export const DOOR_POS = new THREE.Vector3(0, 0, 2.15); // لابی در
export const REGISTER_POS = new THREE.Vector3(-1.55, 0, 1.0);
export const REGISTER_SPOT = new THREE.Vector3(-1.55, 0, 0.45); // جایی که مشتری برای پرداخت می‌ایستد

// ۶ جایگاه قفسه: ۳ تا دیوار پشت + ۲ تا دیوارهای کناری + ۱ جایگاه برای محصول آینده
const SLOTS = [
  { x: -1.7, z: -1.78, rot: 0 },
  { x: 0, z: -1.78, rot: 0 },
  { x: 1.7, z: -1.78, rot: 0 },
  { x: -2.28, z: -0.35, rot: Math.PI / 2 },
  { x: 2.28, z: -0.35, rot: -Math.PI / 2 },
  { x: -2.28, z: 0.95, rot: Math.PI / 2 },
];

const ITEM_X = [-0.32, -0.11, 0.11, 0.32];
const ITEM_Y = [0.34, 0.8, 1.26];

// ---------- کمکی‌های هندسه ----------
function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0.0 }, extra));
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

// ---------- کف کاشی‌ای (canvas) ----------
function floorTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#e9e3d3';
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#d2c9b3';
  x.lineWidth = 5;
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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- ساخت شخص (مشتری/متصدی) ----------
const SKINS = [0xf0c8a0, 0xe0b088, 0xc98d5f, 0x8d5a3b];
const SHIRTS = [0xe25555, 0x4f8ee2, 0x8e6ae2, 0xe2a23f, 0x53b06a, 0xd76fa6, 0x59c2c9];

export function buildPerson({ shirt, skin } = {}) {
  const g = new THREE.Group();
  const s = shirt ?? SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
  const k = skin ?? SKINS[Math.floor(Math.random() * SKINS.length)];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.38, 4, 12), mat(s));
  body.position.y = 0.5;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), mat(k, { roughness: 0.7 }));
  head.position.y = 0.92;
  head.castShadow = true;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.119, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.1),
    mat(0x3a2e26)
  );
  hair.position.y = 0.94;
  const legL = box(0.07, 0.24, 0.09, mat(0x39424e), -0.055, 0.12, 0);
  const legR = box(0.07, 0.24, 0.09, mat(0x39424e), 0.055, 0.12, 0);
  // کیسه خرید (بعد از خرید ظاهر می‌شود)
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.09, 3, 8), mat(0xe8e2d4));
  bag.name = 'bag';
  bag.position.set(0.17, 0.55, 0.02);
  bag.visible = false;
  g.add(body, head, hair, legL, legR, bag);
  return { group: g, bag };
}

// ---------- مدل‌های محصولات ----------
function buildBread() {
  const g = new THREE.Group();
  const body = box(0.22, 0.12, 0.16, mat(0xd9a066), 0, 0.06, 0);
  const top = box(0.19, 0.07, 0.13, mat(0xe7b87f), 0, 0.15, 0);
  g.add(body, top);
  return g;
}
function buildApple() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), mat(0xd94f3d, { roughness: 0.5 }));
  m.position.y = 0.09;
  m.scale.y = 0.92;
  m.castShadow = true;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.05, 6), mat(0x6b4a2b));
  stem.position.y = 0.19;
  stem.rotation.z = 0.2;
  g.add(m, stem);
  return g;
}
function buildBanana() {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.1, 0.02, 0),
    new THREE.Vector3(0, 0.14, 0),
    new THREE.Vector3(0.1, 0.02, 0)
  );
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.028, 8), mat(0xf2c94c, { roughness: 0.6 }));
  m.castShadow = true;
  g.add(m);
  return g;
}
function buildOil() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.2, 12), mat(0x7fb069, { transparent: true, opacity: 0.92, roughness: 0.4 }));
  body.position.y = 0.1;
  body.castShadow = true;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.08, 12), mat(0xf4efe6));
  label.position.y = 0.09;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.045, 8), mat(0x2b5d3a));
  cap.position.y = 0.22;
  g.add(body, label, cap);
  return g;
}
function buildRice() {
  const g = new THREE.Group();
  const bag = box(0.14, 0.2, 0.1, mat(0xf3ead7, { roughness: 0.8 }), 0, 0.1, 0);
  const stripe = box(0.144, 0.05, 0.104, mat(0x2f7d4f), 0, 0.1, 0);
  g.add(bag, stripe);
  return g;
}
function buildGeneric(color) {
  const g = new THREE.Group();
  g.add(box(0.16, 0.18, 0.12, mat(color ?? 0xcccccc), 0, 0.09, 0));
  return g;
}
const BUILDERS = { bread: buildBread, apple: buildApple, banana: buildBanana, oil: buildOil, rice: buildRice };
export function buildProduct(id, color) {
  const f = BUILDERS[id];
  return f ? f() : buildGeneric(color);
}

// ---------- قفسه ----------
function buildShelfUnit() {
  const g = new THREE.Group();
  const W = 0.95, D = 0.45, H = 1.6;
  const frame = mat(0x8a5a33, { roughness: 0.95 });
  const board = mat(0xf4efe6, { roughness: 0.7 });
  g.add(box(0.05, H, D, frame, -W / 2 + 0.025, H / 2, 0));
  g.add(box(0.05, H, D, frame, W / 2 - 0.025, H / 2, 0));
  g.add(box(W, H, 0.04, frame, 0, H / 2, -D / 2 + 0.02));
  g.add(box(W, 0.09, D, frame, 0, 0.045, 0));
  for (const y of [0.32, 0.78, 1.24, 1.56]) g.add(box(W - 0.07, 0.035, D - 0.05, board, 0, y, 0));
  return g;
}

// ---------- تگ قیمت روی قفسه (canvas، متن فارسی) ----------
function makeTag(product) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const meshTag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.25),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  const group = new THREE.Group();
  group.add(meshTag);
  function draw(price) {
    const x = c.getContext('2d');
    x.clearRect(0, 0, 256, 96);
    x.fillStyle = '#ffffff';
    roundRectPath(x, 6, 6, 244, 84, 16);
    x.fill();
    x.strokeStyle = '#17a05b';
    x.lineWidth = 4;
    roundRectPath(x, 6, 6, 244, 84, 16);
    x.stroke();
    x.textBaseline = 'middle';
    x.fillStyle = '#22313f';
    x.font = '700 38px Vazirmatn, Tahoma, sans-serif';
    x.textAlign = 'right';
    x.fillText(`${product.emoji} ${product.name}`, 240, 50);
    x.fillStyle = '#0e7a44';
    x.font = '900 42px Vazirmatn, Tahoma, sans-serif';
    x.textAlign = 'left';
    x.fillText(`${fa(price)} $`, 18, 50);
    tex.needsUpdate = true;
  }
  return { group, draw };
}

// ---------- بخش‌های صحنه ----------
function buildRoom(world) {
  const s = world.scene;
  const { w, d, h, doorW } = ROOM;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  s.add(floor);

  const wallMat = mat(0xe9eef3);
  const paint = mat(0xdfe7ee);
  s.add(box(w + 0.24, h, 0.12, paint, 0, h / 2, -d / 2 - 0.06)); // پشت
  s.add(box(0.12, h, d, wallMat, -w / 2 - 0.06, h / 2, 0)); // چپ
  s.add(box(0.12, h, d, wallMat, w / 2 + 0.06, h / 2, 0)); // راست
  const seg = (w - doorW) / 2; // جلو با لابی در
  s.add(box(seg, h, 0.12, wallMat, -(doorW / 2 + seg / 2), h / 2, d / 2 + 0.06));
  s.add(box(seg, h, 0.12, wallMat, doorW / 2 + seg / 2, h / 2, d / 2 + 0.06));

  const frameMat = mat(0x6b7683, { metalness: 0.4, roughness: 0.5 });
  s.add(box(0.1, 2.3, 0.14, frameMat, -doorW / 2, 1.15, d / 2 + 0.02));
  s.add(box(0.1, 2.3, 0.14, frameMat, doorW / 2, 1.15, d / 2 + 0.02));
  s.add(box(doorW + 0.1, 0.12, 0.14, frameMat, 0, 2.26, d / 2 + 0.02));

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW, 2.2),
    new THREE.MeshStandardMaterial({
      color: 0xcfe8ff,
      transparent: true,
      opacity: 0.08,
      roughness: 0.1,
      side: THREE.DoubleSide,
    })
  );
  glass.position.set(0, 1.1, d / 2 + 0.06);
  s.add(glass);
}

function buildShelves(world) {
  const s = world.scene;
  PRODUCTS.forEach((p, i) => {
    const slot = SLOTS[i % SLOTS.length];
    const g = buildShelfUnit();
    g.position.set(slot.x, 0, slot.z);
    g.rotation.y = slot.rot;
    s.add(g);
    const items = [];
    for (const y of ITEM_Y)
      for (const x of ITEM_X) {
        const it = buildProduct(p.id, p.color);
        it.position.set(x, y, 0.03);
        it.traverse((o) => {
          if (o.isMesh) o.castShadow = true;
        });
        it.visible = false;
        g.add(it);
        items.push(it);
      }
    const tag = makeTag(p);
    tag.group.position.set(0, 1.42, 0.24);
    g.add(tag.group);
    const shopSpot = new THREE.Vector3(slot.x, 0, slot.z).add(
      new THREE.Vector3(0, 0, 0.42).applyAxisAngle(new THREE.Vector3(0, 1, 0), slot.rot)
    );
    world.shelves[p.id] = { group: g, items, tag, shopSpot, product: p };
  });
}

function buildRegister(world) {
  const s = world.scene;
  const counterMat = mat(0xf2f2f2, { roughness: 0.6 });
  const wood = mat(0x8a5a33);
  s.add(box(1.25, 0.5, 0.55, counterMat, REGISTER_POS.x, 0.25, REGISTER_POS.z));
  s.add(box(1.25, 0.05, 0.6, wood, REGISTER_POS.x, 0.525, REGISTER_POS.z));
  s.add(box(0.28, 0.16, 0.26, mat(0x39424e, { roughness: 0.5 }), REGISTER_POS.x + 0.3, 0.63, REGISTER_POS.z));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.13),
    new THREE.MeshBasicMaterial({ color: 0x9fd8ff, toneMapped: false })
  );
  screen.position.set(REGISTER_POS.x + 0.3, 0.66, REGISTER_POS.z - 0.131);
  screen.rotation.x = -0.35;
  s.add(screen);
  // متصدی پشت صندوق
  const cashier = buildPerson({ shirt: 0x1f8a4c });
  cashier.group.position.set(REGISTER_POS.x - 0.1, 0, REGISTER_POS.z + 0.42);
  cashier.group.rotation.y = Math.PI;
  s.add(cashier.group);
  world.cashier = cashier.group;
}

function buildOutside(world) {
  const s = world.scene;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(26, 40), mat(0xa3c193, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  s.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.2), mat(0xb7bcc2, { roughness: 1 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, -0.02, 3.9);
  path.receiveShadow = true;
  s.add(path);
  for (const sx of [-1, 1]) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.7, 8), mat(0x7a5230));
    trunk.position.y = 0.3;
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.3, 10), mat(0x4f8f4a));
    leaves.position.y = 1.2;
    leaves.castShadow = true;
    tree.add(trunk, leaves);
    tree.position.set(sx * 3.1, 0, 3.1);
    s.add(tree);
  }
}

function buildSign(world) {
  const s = world.scene;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 208;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, 0, 208);
    grad.addColorStop(0, '#0f6b3c');
    grad.addColorStop(1, '#0a4a2a');
    x.fillStyle = grad;
    x.fillRect(0, 0, 1024, 208);
    x.fillStyle = '#ffffff';
    x.font = '900 104px Vazirmatn, Tahoma, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('🛒 سوپرمارکت من', 512, 112);
    tex.needsUpdate = true;
  };
  draw();
  world.redrawSign = draw;
  const board = box(2.5, 0.56, 0.08, mat(0x0b3d22), 0, 2.45, 2.05);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.42, 0.48),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  face.position.set(0, 2.45, 2.095);
  s.add(board, face);
}

export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x8f8574, 1.15);
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
  dir.shadow.bias = -0.0006;
  scene.add(dir);
  // نور گرم داخل فروشگاه
  const inner = new THREE.PointLight(0xfff2d8, 12, 9, 2);
  inner.position.set(0, 2.6, 0);
  scene.add(inner);
}

// ---------- حلقهٔ به‌روزرسانی دنیای سه‌بعدی ----------
function updateWorld(world, dt) {
  world.t += dt;
  // انیمیشن چیدن کالا روی قفسه
  for (let i = world.scaleAnims.length - 1; i >= 0; i--) {
    const a = world.scaleAnims[i];
    a.t = Math.min(1, a.t + dt / 0.22);
    const e = 1 - Math.pow(1 - a.t, 3);
    a.obj.scale.setScalar(Math.max(0.01, 0.01 + 0.99 * e));
    if (a.t >= 1) world.scaleAnims.splice(i, 1);
  }
  // متن‌های شناور (+$)
  for (let i = world.floats.length - 1; i >= 0; i--) {
    const f = world.floats[i];
    f.t += dt;
    f.spr.position.y += dt * 0.5;
    f.spr.material.opacity = Math.max(0, 1 - f.t / 1.4);
    if (f.t >= 1.4) {
      world.scene.remove(f.spr);
      f.spr.material.map.dispose();
      f.spr.material.dispose();
      world.floats.splice(i, 1);
    }
  }
  // متصدی آرام نفس می‌کشد
  if (world.cashier) world.cashier.position.y = Math.sin(world.t * 2.4) * 0.012;
}

/**
 * ساخت دنیای سه‌بعدی.
 * @returns {{shelves: Object, update: Function, redrawText: Function, ...}}
 */
export function createWorld(scene) {
  const world = { scene, shelves: {}, scaleAnims: [], floats: [], cashier: null, t: 0, redrawSign: null };
  buildRoom(world);
  buildShelves(world);
  buildRegister(world);
  buildOutside(world);
  buildSign(world);
  const redrawAll = () => {
    for (const id of Object.keys(world.shelves)) {
      const sh = world.shelves[id];
      if (sh.lastPrice != null) sh.tag.draw(sh.lastPrice);
    }
    if (world.redrawSign) world.redrawSign();
  };
  world.redrawText = redrawAll;
  // بعد از آماده‌شدن فونت فارسی، دوباره متن‌ها را بکش
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => world.redrawText()).catch(() => {});
  world.update = (dt) => updateWorld(world, dt);
  return world;
}

/**
 * همگام‌سازی قفسه‌ها با موجودی — هنگام خرید، کالاها با انیمیشن
 * «چیده» می‌شوند و هنگام فروش کم می‌شوند.
 */
export function refreshShelves(world, inventory) {
  for (const p of PRODUCTS) {
    const sh = world.shelves[p.id];
    if (!sh) continue;
    const n = Math.min(inventory[p.id] || 0, GAME.maxDisplayPerShelf);
    sh.items.forEach((it, j) => {
      const want = j < n;
      if (want && !it.visible) {
        it.scale.setScalar(0.01);
        it.visible = true;
        world.scaleAnims.push({ obj: it, t: 0 });
      } else if (!want && it.visible) {
        it.visible = false;
      }
    });
  }
}

/** به‌روزرسانی تگ‌های قیمت فروش روی قفسه‌ها */
export function refreshTags(world, salePrices) {
  for (const p of PRODUCTS) {
    const sh = world.shelves[p.id];
    if (!sh) continue;
    sh.tag.draw(salePrices[p.id]);
    sh.lastPrice = salePrices[p.id];
  }
}

/** متن شناور بالای صحنه (مثلاً «+۱۲ $») */
export function floatText(world, text, pos) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.font = '900 64px Vazirmatn, Tahoma, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 10;
  x.strokeStyle = 'rgba(0,0,0,0.45)';
  x.strokeText(text, 128, 64);
  x.fillStyle = '#ffe066';
  x.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(0.85, 0.42, 1);
  spr.renderOrder = 10;
  spr.position.copy(pos).add(new THREE.Vector3(0, 1.15, 0));
  world.scene.add(spr);
  world.floats.push({ spr, t: 0 });
}
