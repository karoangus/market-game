// =============================================================
//  person.js — ساخت و انیمیشن آدم‌ها (مشتری و متصدی)
//
//  این فایل جوابِ خواستهٔ «مشتری‌ها دست داشته باشند» است:
//   • هر آدم یک اسکلت ساده دارد: لگن، تنه، سر، دو دست کامل
//     (بازو + آرنج + کف دست + انگشت‌ها + شست) و دو پا (ران + ساق + کفش).
//   • `solveArm` با IK دو-استخوانی دست را دقیقاً به سمت کالا می‌برد،
//     پس مشتری «واقعاً» کالا را با دست برمی‌دارد.
//   • سبد خرید به دست چپ بسته است و کالاها داخل خودِ سبد چیده می‌شوند.
// =============================================================
import * as THREE from 'three';
import { clamp01, lerp } from './anim.js';

const SKIN_TONES = [0xf3cba4, 0xe8b78b, 0xd49a63, 0xb87a4a, 0x8d5a34, 0x6b4227];
const SHIRT_COLORS = [
  0xe25555, 0x4f8ee2, 0x8e6ae2, 0xe2a23f, 0x53b06a, 0xd76fa6, 0x59c2c9, 0xf0f3f5, 0x3c4a5a,
  0xf28c28, 0x7bc043, 0xc0392b,
];
const PANTS_COLORS = [0x39424e, 0x2c3540, 0x5b4636, 0x30485c, 0x4a4a52, 0x6b6f76];
const HAIR_COLORS = [0x2f2a26, 0x14110f, 0x4a3220, 0x6b4a2b, 0x8f8f8f, 0xb5651d];

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
// بافرهای مشترک — هر فریم برای هر آدم وکتور جدید نمی‌سازیم
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _upArm = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _fore = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qIdle = new THREE.Quaternion();
const _qElbowIdle = new THREE.Quaternion();
const _local = new THREE.Vector3();
const _world = new THREE.Vector3();
const _poleR = new THREE.Vector3(0.35, -1, -0.25);
const _poleL = new THREE.Vector3(-0.35, -1, -0.25);
const _qTmpA = new THREE.Quaternion();
const _qTmpB = new THREE.Quaternion();

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial(
    Object.assign({ color, roughness: 0.82, metalness: 0.0 }, extra)
  );
}

function part(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

/** کف دست: کف + انگشت‌ها + شست (انگشت‌ها با `curl` بسته می‌شوند) */
function buildHand(skinMat, side = 1) {
  const g = new THREE.Group();
  const palm = part(new THREE.BoxGeometry(0.062, 0.075, 0.042), skinMat, 0, -0.036, 0);
  const fingers = new THREE.Group();
  fingers.position.set(0, -0.072, 0.004);
  const fingerGeo = new THREE.BoxGeometry(0.058, 0.05, 0.036);
  const fingerMesh = part(fingerGeo, skinMat, 0, -0.025, 0);
  fingers.add(fingerMesh);
  const thumb = part(new THREE.BoxGeometry(0.024, 0.042, 0.03), skinMat, side * -0.035, -0.045, 0.012);
  thumb.rotation.z = side * 0.5;
  g.add(palm, fingers, thumb);
  g.userData.fingers = fingers;
  return g;
}

function buildArm(side, shirtMat, skinMat) {
  const arm = new THREE.Group(); // مفصل شانه
  const upper = part(new THREE.CapsuleGeometry(0.045, 0.13, 3, 8), shirtMat, 0, -0.1, 0);
  const cuff = part(new THREE.CylinderGeometry(0.047, 0.043, 0.035, 8), shirtMat, 0, -0.19, 0);
  arm.add(upper, cuff);
  const elbow = new THREE.Group(); // مفصل آرنج
  elbow.position.set(0, -0.2, 0);
  const fore = part(new THREE.CapsuleGeometry(0.036, 0.12, 3, 8), skinMat, 0, -0.09, 0);
  elbow.add(fore);
  const hand = buildHand(skinMat, side);
  hand.position.set(0, -0.175, 0);
  elbow.add(hand);
  arm.add(elbow);
  return { arm, elbow, hand };
}

/**
 * ساخت یک آدم. مقیاس بدن بین ۰.۹۲ و ۱.۰۸ است تا مشتری‌ها شبیه هم نباشند.
 * @returns {{group: THREE.Group, parts: Object, pose: Function, updateWorld: Function}}
 */
export function buildPerson(opts = {}) {
  const rnd = opts.random || Math.random;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const shirt = opts.shirt ?? pick(SHIRT_COLORS);
  const skin = opts.skin ?? pick(SKIN_TONES);
  const pants = opts.pants ?? pick(PANTS_COLORS);
  const hair = opts.hair ?? pick(HAIR_COLORS);
  const scale = opts.scale ?? 0.92 + rnd() * 0.16;
  const fat = opts.fat ?? 0.92 + rnd() * 0.22;

  const shirtMat = material(shirt, { roughness: 0.9 });
  const skinMat = material(skin, { roughness: 0.7 });
  const pantsMat = material(pants, { roughness: 0.95 });
  const shoeMat = material(0x2a2f36, { roughness: 0.8 });
  const hairMat = material(hair, { roughness: 0.85 });

  const group = new THREE.Group(); // ریشه: پاها روی y=۰
  const body = new THREE.Group(); // برای بالا-پایین‌شدن و تاب‌خوردن
  group.add(body);

  // ---------- پاها ----------
  const legs = new THREE.Group();
  body.add(legs);
  const legRigs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.075, 0.6, 0);
    const thigh = part(new THREE.BoxGeometry(0.105 * fat, 0.3, 0.115), pantsMat, 0, -0.15, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -0.3, 0);
    const shin = part(new THREE.BoxGeometry(0.09 * fat, 0.27, 0.1), pantsMat, 0, -0.135, 0);
    const foot = part(new THREE.BoxGeometry(0.095, 0.065, 0.19), shoeMat, 0, -0.285, 0.035);
    knee.add(shin, foot);
    hip.add(thigh, knee);
    legs.add(hip);
    legRigs.push({ hip, knee, side });
  }

  // ---------- بالاتنه (لگن به بالا، یک گروه برای خم‌شدن) ----------
  const upper = new THREE.Group();
  upper.position.set(0, 0.62, 0);
  body.add(upper);

  const pelvis = part(new THREE.BoxGeometry(0.25 * fat, 0.16, 0.19), pantsMat, 0, 0.04, 0);
  const torso = part(new THREE.CapsuleGeometry(0.145 * fat, 0.26, 4, 12), shirtMat, 0, 0.27, 0);
  torso.scale.set(1, 1, 0.82);
  const collar = part(new THREE.CylinderGeometry(0.06, 0.07 * fat, 0.05, 10), shirtMat, 0, 0.455, 0);
  const neck = part(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 8), skinMat, 0, 0.485, 0);
  upper.add(pelvis, torso, collar, neck);

  // ---------- سر ----------
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0);
  const skull = part(new THREE.SphereGeometry(0.115, 16, 14), skinMat, 0, 0.02, 0);
  skull.scale.set(0.95, 1.05, 1);
  const hairMesh = part(
    new THREE.SphereGeometry(0.121, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.85),
    hairMat,
    0,
    0.022,
    -0.004
  );
  hairMesh.scale.set(0.98, 1.08, 1);
  head.add(skull, hairMesh);
  // چشم‌ها و دهان (سمت +z = رو به جلو)
  const eyeMat = material(0x24282e, { roughness: 0.4 });
  const eyeGeo = new THREE.SphereGeometry(0.017, 8, 8);
  const eyeL = part(eyeGeo, eyeMat, -0.042, 0.03, 0.1);
  const eyeR = part(eyeGeo, eyeMat, 0.042, 0.03, 0.1);
  const nose = part(new THREE.ConeGeometry(0.016, 0.032, 6), skinMat, 0, 0.006, 0.115);
  nose.rotation.x = Math.PI / 2;
  const mouth = part(new THREE.BoxGeometry(0.05, 0.012, 0.012), material(0x8a3b34), 0, -0.042, 0.104);
  head.add(eyeL, eyeR, nose, mouth);
  // کلاه / موی اضافه برای تنوع
  const style = rnd();
  if (style > 0.72) {
    const capMat = material(pick(SHIRT_COLORS), { roughness: 0.85 });
    const cap = part(
      new THREE.SphereGeometry(0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.1),
      capMat,
      0,
      0.035,
      0
    );
    const brim = part(new THREE.BoxGeometry(0.22, 0.018, 0.11), capMat, 0, 0.03, 0.11);
    head.add(cap, brim);
  } else if (style > 0.45) {
    const bun = part(new THREE.SphereGeometry(0.055, 10, 8), hairMat, 0, -0.045, -0.11);
    head.add(bun);
  } else if (style < 0.14) {
    const glasses = part(new THREE.BoxGeometry(0.15, 0.03, 0.02), material(0x22252a), 0, 0.03, 0.108);
    head.add(glasses);
  }
  upper.add(head);

  // ---------- دست‌ها ----------
  const armR = buildArm(1, shirtMat, skinMat);
  armR.arm.position.set(0.165 * fat, 0.4, 0);
  const armL = buildArm(-1, shirtMat, skinMat);
  armL.arm.position.set(-0.165 * fat, 0.4, 0);
  upper.add(armR.arm, armL.arm);

  // ---------- سبد خرید (دست چپ) ----------
  const basket = new THREE.Group();
  const basketMat = material(opts.basketColor ?? 0xd8623c, { roughness: 0.7 });
  const bw = 0.27;
  const bd = 0.21;
  const bh = 0.15;
  basket.add(part(new THREE.BoxGeometry(bw, 0.02, bd), basketMat, 0, 0, 0));
  for (const [x, z, w, d] of [
    [0, -bd / 2, bw, 0.016],
    [0, bd / 2, bw, 0.016],
    [-bw / 2, 0, 0.016, bd],
    [bw / 2, 0, 0.016, bd],
  ]) {
    basket.add(part(new THREE.BoxGeometry(w, bh, d), basketMat, x, bh / 2, z));
  }
  const handle = part(new THREE.TorusGeometry(0.09, 0.011, 6, 12, Math.PI), basketMat, 0, bh, -0.02);
  handle.rotation.set(0, Math.PI / 2, 0);
  basket.add(handle);
  const basketItems = new THREE.Group(); // کالاهای داخل سبد این‌جا می‌نشینند
  basketItems.position.y = 0.012;
  basket.add(basketItems);
  // سبد در دست چپ آویزان است
  basket.position.set(0, -0.1, 0.02);
  basket.rotation.set(0.12, 0, 0.05);
  armL.hand.add(basket);

  // ---------- کیسهٔ خرید (بعد از پرداخت در دست راست) ----------
  const bag = new THREE.Group();
  const bagMat = material(0xefe6d2, { roughness: 0.95 });
  const bagBody = part(new THREE.BoxGeometry(0.19, 0.24, 0.1), bagMat, 0, -0.12, 0);
  const bagTop = part(new THREE.BoxGeometry(0.2, 0.03, 0.11), material(0xd9cbb0), 0, 0.0, 0);
  const bagHandle = part(new THREE.TorusGeometry(0.05, 0.008, 6, 10, Math.PI), material(0xb9a888), 0, 0.01, 0);
  bag.add(bagBody, bagTop, bagHandle);
  bag.position.set(0, -0.04, 0.03);
  bag.visible = false;
  armR.hand.add(bag);

  const parts = {
    body,
    legs,
    upper,
    head,
    torso,
    armL: armL.arm,
    armR: armR.arm,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
    handL: armL.hand,
    handR: armR.hand,
    basket,
    basketItems,
    bag,
    legRigs,
    shirt,
    skin,
    scale,
  };

  const api = {
    group,
    parts,
    /** به‌روزرسانی ماتریس دنیا (لازم برای تبدیل مختصات کالا به فضای بدن) */
    sync() {
      group.updateMatrixWorld(true);
    },
    /** تبدیل یک نقطهٔ جهانی به مختصات محلیِ بالاتنه (برای IK دست) */
    toUpperLocal(worldPos, out = new THREE.Vector3()) {
      return out.copy(worldPos).sub(upper.getWorldPosition(_world)).applyQuaternion(
        upper.getWorldQuaternion(_q).invert()
      );
    },
    pose(state) {
      posePerson(parts, state);
    },
  };

  group.scale.setScalar(scale);
  return api;
}

/**
 * حالت‌دهی به بدن.
 * state = {
 *   t, phase, speed (۰..۱), lean (۰..۱), crouch, lookYaw, lookPitch,
 *   reach: { side:'R'|'L', k: ۰..۱, target: Vector3 (مختصات محلیِ بالاتنه) },
 *   idle: ۱ = ساکن، armSwing, holdBasket, greet (دست تکان‌دادن ۰..۱),
 *   fingers (۰ باز .. ۱ بسته)
 * }
 */
export function posePerson(p, s = {}) {
  const t = s.t || 0;
  const speed = s.speed ?? 0;
  const walk = clamp01(s.walk ?? speed);
  const phase = s.phase || 0;
  const crouch = clamp01(s.crouch || 0);

  // --- بالا-پایین‌رفتن بدن و تاب‌خوردن (قدم‌زدن) ---
  p.body.position.y = Math.abs(Math.sin(phase)) * 0.03 * walk;
  p.body.rotation.z = Math.sin(phase) * 0.025 * walk;
  p.body.rotation.y = Math.sin(phase) * 0.05 * walk;

  // --- پاها ---
  // وقتی مشتری کالای طبقهٔ پایین را برمی‌دارد، کمی زانو می‌خم‌کند (چمباتمه)
  if (crouch > 0.001) {
    p.body.position.y -= 0.58 * (1 - Math.cos(0.5 * crouch));
    for (const rig of p.legRigs) {
      rig.hip.rotation.x -= 0.5 * crouch;
      rig.knee.rotation.x += 1.0 * crouch;
    }
  }
  for (const rig of p.legRigs) {
    const dir = rig.side > 0 ? 0 : Math.PI;
    const swing = Math.sin(phase + dir) * 0.62 * walk;
    rig.hip.rotation.x = swing;
    const bend = Math.max(0, Math.sin(phase + dir + Math.PI * 0.62)) * 0.9 * walk;
    rig.knee.rotation.x = bend;
    // ایستاده: پاها کمی باز و سنگینی روی یک پا
    if (walk < 0.15) {
      rig.hip.rotation.x = Math.sin(t * 1.1 + dir) * 0.015;
      rig.hip.rotation.z = rig.side * 0.02;
    } else {
      rig.hip.rotation.z = 0;
    }
  }

  // --- خم‌شدن/کج‌شدن بالاتنه ---
  const lean = clamp01(s.lean || 0);
  p.upper.rotation.x = lean * 0.42 + crouch * 0.3;
  p.upper.position.y = 0.62 - crouch * 0.06;
  p.upper.rotation.z = Math.sin(t * 0.9) * 0.012;

  // --- نفس‌کشیدن آرام ---
  const breathe = 1 + Math.sin(t * 2.1) * 0.012;
  p.torso.scale.set(1, breathe, 0.82);

  // --- سر: نگاه‌کردن ---
  const yaw = s.lookYaw || 0;
  const pitch = s.lookPitch || 0;
  p.head.rotation.y = lerp(p.head.rotation.y, yaw, 0.16);
  p.head.rotation.x = lerp(p.head.rotation.x, pitch, 0.16);
  p.head.rotation.z = Math.sin(t * 1.3) * 0.02;

  // --- دست چپ: نگه‌داشتن سبد ---
  const hold = s.holdBasket ?? 1;
  const leftSwing = -Math.sin(phase) * 0.28 * walk * (1 - hold * 0.8);
  p.armL.rotation.x = lerp(-Math.sin(phase) * 0.42 * walk, -0.5, hold) + leftSwing * 0.2;
  p.armL.rotation.z = lerp(0.06 * Math.sin(phase) * walk, 0.2, hold);
  p.elbowL.rotation.x = lerp(-0.2 - Math.abs(Math.sin(phase)) * 0.1 * walk, -0.75, hold);
  p.elbowL.rotation.z = 0;

  // --- دست راست: تاب خوردن یا دراز کردن (IK) ---
  const swing = Math.sin(phase) * 0.5 * walk;
  p.armR.rotation.set(swing, 0, -0.05);
  p.elbowR.rotation.set(-0.18 - Math.abs(Math.sin(phase + 1.2)) * 0.15 * walk, 0, 0);

  // سلام‌دادن با دست راست (وقتی مشتری وارد می‌شود)
  const greet = clamp01(s.greet || 0);
  if (greet > 0.001) {
    const wave = Math.sin(t * 9) * 0.35 * greet;
    p.armR.rotation.x = lerp(p.armR.rotation.x, -2.1 + wave * 0.3, greet);
    p.armR.rotation.z = lerp(p.armR.rotation.z, -0.55, greet);
    p.elbowR.rotation.x = lerp(p.elbowR.rotation.x, -0.55 + wave, greet);
  }

  const reach = s.reach;
  if (reach && reach.k > 0.001 && reach.target) {
    const rig = reach.side === 'L' ? { arm: p.armL, elbow: p.elbowL } : { arm: p.armR, elbow: p.elbowR };
    const k = clamp01(reach.k);
    _qIdle.copy(rig.arm.quaternion);
    _qElbowIdle.copy(rig.elbow.quaternion);
    solveArm(
      rig.arm,
      rig.elbow,
      reach.l1 ?? 0.2,
      reach.l2 ?? 0.245,
      reach.target,
      reach.pole || (reach.side === 'L' ? _poleL : _poleR)
    );
    _qTmpA.copy(rig.arm.quaternion);
    _qTmpB.copy(rig.elbow.quaternion);
    rig.arm.quaternion.slerpQuaternions(_qIdle, _qTmpA, k);
    rig.elbow.quaternion.slerpQuaternions(_qElbowIdle, _qTmpB, k);
  }

  // --- انگشت‌ها: باز یا بسته (گرفتن کالا) ---
  const fingers = clamp01(s.fingers ?? (s.holdBasket ? 0.55 : 0.15));
  for (const hand of [p.handL, p.handR]) {
    const f = hand.userData.fingers;
    if (f) f.rotation.x = -fingers * 1.25;
  }

  // --- کیسهٔ خرید: بعد از پرداخت ---
  if (s.bagScale != null) {
    p.bag.visible = s.bagScale > 0.01;
    p.bag.scale.setScalar(Math.max(0.001, s.bagScale));
  }
}

/**
 * IK دو-استخوانی: شانه را می‌چرخاند و آرنج را خم می‌کند تا دست
 * دقیقاً به `targetLocal` (در فضای محلیِ والدِ شانه) برسد.
 */
export function solveArm(shoulder, elbow, L1, L2, targetLocal, poleDir) {
  _to.copy(targetLocal).sub(shoulder.position);
  let d = _to.length();
  if (d < 1e-4) return;
  const reachMin = Math.abs(L1 - L2) + 0.03;
  const reachMax = L1 + L2 - 0.008;
  const dc = Math.min(reachMax, Math.max(reachMin, d));
  _dir.copy(_to).normalize();
  const cosA = (L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc);
  const a = Math.acos(Math.min(1, Math.max(-1, cosA)));
  _axis.crossVectors(_dir, poleDir);
  if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
  _axis.normalize();
  _upArm.copy(_dir).applyAxisAngle(_axis, a); // جهت بازو
  _elbow.copy(shoulder.position).addScaledVector(_upArm, L1);
  _fore.copy(_to).add(shoulder.position).sub(_elbow).normalize(); // جهت ساعد
  shoulder.quaternion.setFromUnitVectors(DOWN, _upArm);
  _q.copy(shoulder.quaternion).invert();
  _local.copy(_fore).applyQuaternion(_q);
  elbow.quaternion.setFromUnitVectors(DOWN, _local);
}

/** جای خالی داخل سبد برای کالای بعدی (در مختصات محلیِ سبد) */
export const BASKET_SLOTS = [
  new THREE.Vector3(-0.06, 0.055, -0.05),
  new THREE.Vector3(0.06, 0.055, -0.05),
  new THREE.Vector3(-0.06, 0.055, 0.05),
  new THREE.Vector3(0.06, 0.055, 0.05),
  new THREE.Vector3(0, 0.055, 0.0),
  new THREE.Vector3(0, 0.11, 0.0),
];

export { SKIN_TONES, SHIRT_COLORS, PANTS_COLORS, HAIR_COLORS };
