// =============================================================
//  customers.js — شبیه‌سازی یک روز فروش
//
//  DaySimulation: تولد مشتری‌ها در طول روز، شمارش آمار و
//  گزارش پایان روز.
//  CustomerAgent : رفتار سادهٔ هر مشتری —
//    ورود از در → قفسهٔ محصول ۱ → (قفسهٔ محصول ۲ → …) →
//    صندوق (پرداخت) → خروج از در
//
//  تصمیم خرید: وقتی مشتری کنار قفسه می‌ایستد، با احتمال
//  buyChance(قیمت‌بازار, قیمت‌فروش) کالا را می‌خرد — یعنی
//  قیمت‌گذاری بازیکن مستقیماً روی فروش اثر دارد.
// =============================================================
import * as THREE from 'three';
import { PRODUCTS, GAME } from './config.js';
import { buyChance } from './economy.js';
import { buildPerson, refreshShelves, SPAWN_POS, DOOR_POS, REGISTER_SPOT } from './scene3d.js';

const jx = (a) => (Math.random() * 2 - 1) * a;

export class DaySimulation {
  constructor(state, world, hooks = {}) {
    this.state = state;
    this.world = world;
    this.hooks = hooks;
    const { base, perDay, max } = GAME.customers;
    const raw = base + perDay * (state.day - 1) + jx(1.5);
    this.total = Math.max(4, Math.min(max, Math.round(raw)));
    this.spawned = 0;
    this.active = [];
    this.spawnTimer = 0.6;
    this.time = 0;
    this.finished = false;
    this.stats = { customers: 0, buyers: 0, itemsSold: 0, revenue: 0 };
  }

  update(dt) {
    if (this.finished) return;
    this.time += dt;

    // تولد مشتری (حداکثر ۴ نفر هم‌زمان در فروشگاه)
    if (this.spawned < this.total && this.active.length < 4) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn();
        this.spawnTimer = 2.2 + Math.random() * 2.6;
      }
    }

    for (const c of this.active) c.update(dt);
    this.active = this.active.filter((c) => !c.gone);

    // محافظ: اگر از ۲.۵ دقیقه گذشت، روز تمام شود
    if (this.time > 150)
      for (const c of this.active) {
        c.gone = true;
        this.world.scene.remove(c.group);
      }

    if (this.spawned >= this.total && this.active.length === 0) {
      this.finished = true;
      const s = this.state.dayStats;
      s.customers = this.stats.customers;
      s.buyers = this.stats.buyers;
      s.itemsSold = this.stats.itemsSold;
      s.revenue = this.stats.revenue;
      if (this.hooks.onDayEnd) this.hooks.onDayEnd(this.stats);
    }
  }

  spawn() {
    const c = new CustomerAgent(this);
    this.world.scene.add(c.group);
    this.active.push(c);
    this.spawned++;
    this.stats.customers++;
  }
}

class CustomerAgent {
  constructor(sim) {
    this.sim = sim;
    this.gone = false;
    const model = buildPerson();
    this.group = model.group;
    this.bag = model.bag;
    this.speed = 0.75 + Math.random() * 0.3;
    this.pos = new THREE.Vector3(SPAWN_POS.x + jx(0.35), 0, SPAWN_POS.z + jx(0.4));
    this.group.position.copy(this.pos);
    this.t = Math.random() * 10;

    // ۱ تا ۳ محصول متفاوت می‌خواهد
    const ids = PRODUCTS.map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    this.wants = ids.slice(0, 1 + Math.floor(Math.random() * 3));
    this.buyList = [];

    // برنامهٔ کار: هر قفسه = قدم زدن + مکث(بررسی)، بعد صندوق، بعد خروج
    const tasks = [];
    this.wants.forEach((id) => {
      const spot = sim.world.shelves[id].shopSpot.clone().add(new THREE.Vector3(jx(0.12), 0, jx(0.1)));
      tasks.push({ type: 'walk', target: spot });
      tasks.push({ type: 'pause', dur: 1.0 + Math.random() * 1.5, end: () => this.consider(id) });
    });
    tasks.push({
      type: 'walk',
      target: REGISTER_SPOT.clone().add(new THREE.Vector3(jx(0.25), 0, jx(0.15))),
    });
    tasks.push({ type: 'pause', dur: 0.7 + Math.random() * 0.9, end: () => this.pay() });
    tasks.push({ type: 'walk', target: DOOR_POS.clone().add(new THREE.Vector3(jx(0.3), 0, 0)) });
    tasks.push({
      type: 'walk',
      target: new THREE.Vector3(SPAWN_POS.x + jx(0.6), 0, SPAWN_POS.z + 1.6),
      end: () => {
        this.gone = true;
        sim.world.scene.remove(this.group);
      },
    });
    this.tasks = tasks;
    this.task = this.tasks.shift();
  }

  update(dt) {
    this.t += dt;
    const task = this.task;
    if (task.type === 'pause') {
      task.dur -= dt;
      if (task.dur <= 0) {
        const t = this.task;
        this.task = this.tasks.shift() || { type: 'done' };
        if (t.end) t.end();
      }
    } else if (task.type === 'walk') {
      const dir = task.target.clone().sub(this.pos);
      dir.y = 0;
      const dist = dir.length();
      const step = this.speed * dt;
      if (dist <= step) {
        this.pos.copy(task.target);
        const t = this.task;
        this.task = this.tasks.shift() || { type: 'done' };
        if (t.end) t.end();
      } else {
        dir.normalize();
        this.pos.addScaledVector(dir, step);
        this.group.rotation.y = Math.atan2(dir.x, dir.z);
      }
      this.group.position.y = Math.abs(Math.sin(this.t * 9)) * 0.045;
    }
    if (this.task && this.task.type === 'done') this.gone = true;
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
  }

  /** کنار قفسه: آیا این قیمت فروش را می‌پذیرد؟ */
  consider(id) {
    const st = this.sim.state;
    if ((st.inventory[id] || 0) > 0 && Math.random() < buyChance(st.market[id], st.salePrice[id])) {
      this.buyList.push(id);
    }
  }

  /** در صندوق: پرداخت و کم‌شدن موجودی */
  pay() {
    const st = this.sim.state;
    if (!this.buyList.length) return;
    let rev = 0;
    let sold = 0;
    for (const id of this.buyList) {
      if ((st.inventory[id] || 0) > 0) {
        st.inventory[id]--;
        rev += st.salePrice[id];
        sold++;
      }
    }
    if (!sold) return;
    st.money += rev;
    this.sim.stats.itemsSold += sold;
    this.sim.stats.revenue += rev;
    this.sim.stats.buyers += 1;
    this.bag.visible = true;
    refreshShelves(this.sim.world, st.inventory);
    if (this.sim.hooks.onSale) this.sim.hooks.onSale(sold, rev);
  }
}
