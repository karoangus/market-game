// =============================================================
//  combat.js — نبرد نوبتی متن‌محور (کاملاً بدون گرافیک)
//  بازیگر: تو + همراهان | دشمنان: از data/enemies.js
// =============================================================
import { enemy as enemyDef } from '../data/enemies.js';
import { char } from '../data/characters.js';
import { ITEMS, item } from '../data/items.js';
import { gainXp } from './state.js';

const rnd = (n) => Math.floor(Math.random() * n) + 1;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const SKILLS = {
  blade_rush: {
    name: 'یورش تیغ', emoji: '⚔️', cost: 2,
    need: (st) => !!st.skills.blade_rush || st.stats.might >= 4,
    desc: 'یک ضربهٔ سنگین با تیغه؛ آسیب دو برابر ولی بی‌دفاع می‌مانی.',
    run: (c, me) => {
      const t = c.targetFoe();
      if (!t) return 'کسی نمانده.';
      const dmg = Math.round(c.playerDamage(2.0));
      t.hp -= dmg;
      me.defending = false;
      return `یورش تیغ! ${t.name} ${dmg} آسیب خورد.`;
    },
  },
  spirit_heal: {
    name: 'دمِ دل', emoji: '✨', cost: 3,
    need: (st) => st.stats.spirit >= 4,
    desc: 'نفس عمیق می‌کشی و زخم خودت را می‌بندی.',
    run: (c, me) => {
      const heal = 6 + c.state.stats.spirit * 2;
      me.hp = Math.min(c.hpMax, me.hp + heal);
      return `جان تازه در رگ‌هایت می‌دود (+${heal}).`;
    },
  },
  arrow_rain: {
    name: 'بارانِ تیر', emoji: '🏹', cost: 2,
    need: (st) => st.companions.includes('mira'),
    desc: 'مهرآ سه تیر پشت‌سرهم می‌اندازد.',
    run: (c) => {
      let out = [];
      for (let i = 0; i < 3; i++) {
        const t = c.targetFoe();
        if (!t) break;
        const dmg = Math.max(1, Math.round(6 * (0.7 + Math.random() * 0.6)));
        t.hp -= dmg;
        out.push(`${t.name} ${dmg}`);
      }
      return `بارانِ تیر: ${out.join('، ')} آسیب.`;
    },
  },
  lore_break: {
    name: 'شکافِ خرد', emoji: '📖', cost: 2,
    need: (st) => st.stats.wits >= 5,
    desc: 'نقطهٔ ضعف دشمن را می‌شناسی؛ زره‌اش تا آخر نبرد بی‌اثر می‌شود.',
    run: (c) => {
      for (const f of c.foes.filter((f) => f.hp > 0)) f.def = Math.max(0, f.def - 3);
      return 'زره دشمنان را وصله‌پاره دیدی؛ ضعفشان را می‌دانی.';
    },
  },
  shadow_step: {
    name: 'گامِ سایه', emoji: '🌫️', cost: 2,
    need: (st) => st.companions.includes('tigh') || st.stats.agility >= 5,
    desc: 'پشت دشمن ظاهر می‌شوی و بی‌صدا می‌زنی.',
    run: (c) => {
      const t = c.targetFoe();
      if (!t) return 'کسی نمانده.';
      const dmg = Math.round(c.playerDamage(1.4)) + 4;
      t.hp -= dmg;
      return `از سایه بیرون آمدی: ${t.name} ${dmg} آسیب خورد.`;
    },
  },
};

export class Combat {
  constructor(state, foeIds, opts = {}) {
    this.state = state;
    this.opts = opts;
    this.foes = foeIds.map((id, i) => {
      const d = enemyDef(id);
      return { uid: `${id}#${i}`, id, ...d, hp: d.hp, hpMax: d.hp, defending: false };
    });
    this.hpMax = state.hpMax + this.armorBonus();
    this.hp = state.hp;
    this.log = [this.introLine()];
    this.turn = 0;
    this.over = false;
    this.won = false;
    this.fled = false;
    this.defending = false;
    this.stunned = false;
  }

  // ---------- کمکی‌ها ----------
  weapon() {
    const w = ITEMS[this.state.weapon] || ITEMS[this.state.weapon === undefined ? 'knife' : 'knife'];
    return w && w.kind === 'weapon' ? w : { name: 'مشت', dmg: 1 };
  }
  armor() {
    const a = ITEMS[this.state.armor];
    return a && a.kind === 'armor' ? a : { name: 'لباس', def: 0 };
  }
  armorBonus() {
    return (this.armor().def || 0) * 2;
  }
  aliveFoes() {
    return this.foes.filter((f) => f.hp > 0);
  }
  targetFoe() {
    const alive = this.aliveFoes();
    if (!alive.length) return null;
    return alive[Math.floor(Math.random() * alive.length)];
  }
  playerDamage(mul = 1) {
    const st = this.state;
    const w = this.weapon();
    const base = 2 + st.stats.might * 1.6 + st.level * 0.9 + (w.dmg || 0) * 1.2;
    let dmg = base * (0.75 + Math.random() * 0.6) * mul;
    const crit = Math.random() < 0.12 + st.stats.agility * 0.01;
    if (crit) dmg *= 1.8;
    const t = this.targetFoe();
    dmg -= t ? t.def * 0.6 : 0;
    return Math.max(1, Math.round(dmg));
  }
  introLine() {
    const names = this.foes.map((f) => f.name).join(' و ');
    return `⚔️ ${names} جلوی راه را گرفته‌اند.`;
  }

  // ---------- وارد کردن آسیب به بازیکن ----------
  hurt(n) {
    this.hp -= n;
    this.state.hp = Math.max(0, this.hp);
    if (this.hp <= 0) {
      this.over = true;
      this.won = false;
      this.log.push('خون روی زمین می‌ریزد... چشمانت سیاه می‌شود.');
    }
  }

  // ---------- اقدام‌های بازیکن ----------
  actions() {
    const st = this.state;
    const list = [{ id: 'attack', label: `حمله با ${this.weapon().name}`, emoji: '🗡️' }];
    for (const [id, sk] of Object.entries(SKILLS)) {
      if (sk.need(st)) list.push({ id: 'skill', skill: id, label: `${sk.name} (توان ${sk.cost})`, emoji: sk.emoji, cost: sk.cost, ok: st.energy >= sk.cost });
    }
    list.push({ id: 'defend', label: 'سنگر گرفتن', emoji: '🛡️' });
    const potion = st.inv.potion || 0;
    if (potion > 0) list.push({ id: 'potion', label: `نوشیدن شربت جان (${potion})`, emoji: '🧪' });
    if (st.inv.potion_big > 0) list.push({ id: 'potion_big', label: `شربت بزرگ جان (${st.inv.potion_big})`, emoji: '⚗️' });
    list.push({ id: 'flee', label: 'گریختن', emoji: '🏃' });
    return list;
  }

  /** اقدام بازیکن؛ true اگر نبرد تمام شد */
  act(id, arg) {
    if (this.over) return true;
    this.turn++;
    this.defending = false;
    const line = this.playerAct(id, arg);
    if (line) this.log.push(line);
    // همراهان
    this.alliesTurn();
    if (!this.aliveFoes().length) {
      this.finishWin();
      return true;
    }
    if (this.over) return true;
    // دشمنان
    if (!this.stunned) this.foesTurn();
    this.stunned = false;
    if (this.over) return true;
    return false;
  }

  playerAct(id, arg) {
    const st = this.state;
    if (id === 'attack') {
      const t = arg ? this.foes[arg] : this.targetFoe();
      if (!t || t.hp <= 0) return 'کسی جلوی تو نیست.';
      const dmg = this.playerDamage(1);
      t.hp -= dmg;
      return `${t.emoji} ${t.name} را زدی: ${dmg} آسیب${t.hp <= 0 ? ' — از پا افتاد.' : ` (${Math.max(0, t.hp)} جان مانده)`}`;
    }
    if (id === 'skill') {
      const sk = SKILLS[arg];
      if (!sk) return 'این کار را نمی‌دانی.';
      if (st.energy < sk.cost) return 'توان کافی نداری.';
      st.energy -= sk.cost;
      return sk.run(this, this);
    }
    if (id === 'defend') {
      this.defending = true;
      return '🛡️ سنگر گرفتی؛ آسیب این دور نصف می‌شود.';
    }
    if (id === 'potion' || id === 'potion_big') {
      const it = ITEMS[id];
      if (!st.inv[id]) return 'نداری.';
      st.inv[id] -= 1;
      if (st.inv[id] <= 0) delete st.inv[id];
      const heal = it.heal || 10;
      this.hp = Math.min(this.hpMax, this.hp + heal);
      st.hp = this.hp;
      return `${it.emoji} ${it.name} نوشیدی (+${heal} جان).`;
    }
    if (id === 'flee') {
      const chance = 0.35 + st.stats.agility * 0.07;
      if (Math.random() < chance) {
        this.over = true;
        this.fled = true;
        this.log.push('🏃 پا گذاشتی به فرار و لای درخت‌ها گم شدی.');
        return null;
      }
      return 'نتوانستی بگریزی!';
    }
    return null;
  }

  alliesTurn() {
    const st = this.state;
    for (const cid of st.companions) {
      const c = char(cid);
      const t = this.targetFoe();
      if (!t) break;
      const dmg = Math.max(1, Math.round(((c.comp && c.comp.dmg) || 4) * (0.7 + Math.random() * 0.6)));
      t.hp -= dmg;
      this.log.push(`🤝 ${c.name}: ${pick(c.quotes || ['می‌زنم!'])} (${dmg} آسیب به ${t.name})`);
      if (t.hp <= 0) this.log.push(`${t.emoji} ${t.name} از پا افتاد.`);
    }
  }

  foesTurn() {
    const st = this.state;
    const armorDef = this.armor().def || 0;
    // در هر دور بیشتر از دو دشمن به تو نمی‌رسد؛ بقیه در تنگنا می‌مانند
    const alive = this.aliveFoes();
    const attackers = alive.slice(0, 2);
    if (alive.length > attackers.length) {
      this.log.push(`(${alive.length - attackers.length} تن از دشمنان در تنگنا ماندند.)`);
    }
    for (const f of attackers) {
      const scale = f.boss ? 1.15 : 1;
      let dmg = Math.max(1, Math.round((f.atk * 0.85 * scale) * (0.7 + Math.random() * 0.6) - armorDef - Math.floor(st.stats.agility / 2)));
      if (this.defending) dmg = Math.max(1, Math.round(dmg / 2));
      this.hurt(dmg);
      this.log.push(`${f.emoji} ${f.name} زد: ${dmg} آسیب (جان تو: ${Math.max(0, this.hp)})`);
      if (this.over) return;
    }
  }

  finishWin() {
    this.over = true;
    this.won = true;
    const st = this.state;
    let xp = 0;
    let gold = 0;
    for (const f of this.foes) {
      xp += f.xp || 5;
      gold += typeof f.gold === 'number' ? f.gold : 0;
    }
    st.kills += this.foes.length;
    st.gold += gold;
    this.rewardXp = xp;
    this.rewardGold = gold;
    this.log.push(`✅ پیروز شدی! ${xp} تجربه و ${gold} سکه.`);
    const lvl = gainXp(st, xp);
    if (lvl) this.log.push('⭐ ' + lvl);
  }

  /** برای تست: نبرد را خودکار تا پایان پیش می‌برد */
  autoResolve() {
    let guard = 0;
    while (!this.over && guard++ < 200) {
      const st = this.state;
      if (st.hp < st.hpMax * 0.35 && st.inv.potion) this.act('potion');
      else this.act('attack');
    }
    return this.over;
  }

  view() {
    return {
      type: 'combat',
      hp: Math.max(0, this.hp),
      hpMax: this.hpMax,
      energy: this.state.energy,
      energyMax: this.state.energyMax,
      foes: this.foes.map((f) => ({ name: f.name, emoji: f.emoji, hp: Math.max(0, f.hp), hpMax: f.hpMax, boss: !!f.boss })),
      log: this.log.slice(-8),
      actions: this.over ? [] : this.actions(),
      over: this.over,
      won: this.won,
      fled: this.fled,
    };
  }
}
