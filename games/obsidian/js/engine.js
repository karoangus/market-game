// =============================================================
//  engine.js — موتور داستان: صحنه‌ها، سفر آزاد، خدمات، فروشگاه، نبرد
//  هیچ چیز DOM-اینجا نیست؛ رابط کاربری جدا است (ui.js) تا تست
//  بتواند کل بازی را بدون مرورگر اجرا کند.
// =============================================================
import {
  newState, applyEffects, checkCond, gainXp, saveGame, loadGame, hasSave, clearSave,
  clampState, PHASES, levelOf, xpToNext,
} from './state.js';
import { SCENES, ENDINGS } from '../data/story.js';
import { LOCATIONS, loc, travelOptions, travelCost, REGIONS } from '../data/world.js';
import { CHARS, char, charsAt, START_COMPANIONS } from '../data/characters.js';
import { ITEMS, item, SHOP_STOCK, SMITH_STOCK, BLACK_STOCK } from '../data/items.js';
import { ENCOUNTERS } from '../data/enemies.js';
import { Combat } from './combat.js';

const PHASE_ORDER = ['dawn', 'day', 'dusk', 'night'];
const HUB = '@loc';

export class Engine {
  constructor(state, hooks = {}) {
    this.state = state || newState();
    this.hooks = hooks;
    this.combat = null;
    this.mode = this.state.scene === HUB ? 'hub' : 'scene';
    this.choices = [];
    this.stack = [];
    this.shop = null;
    this.message = '';
    this.lastEffects = [];
  }

  // ---------- کمکی‌ها ----------
  get s() {
    return this.state;
  }
  scene(id = this.state.scene) {
    return SCENES[id] || null;
  }
  meta() {
    const st = this.state;
    return {
      name: st.name,
      hp: st.hp,
      hpMax: st.hpMax,
      energy: st.energy,
      energyMax: st.energyMax,
      level: st.level,
      xp: st.xp,
      xpNext: xpToNext(st.xp),
      gold: st.gold,
      day: st.day,
      phase: st.phase,
      phaseName: PHASES[st.phase] || st.phase,
      location: loc(st.location).name,
      locationId: st.location,
      stats: { ...st.stats },
      companions: st.companions.map((id) => ({ id, ...char(id) })),
      quests: Object.keys(st.quests).map((id) => ({ id, ...(SCENES[id] && SCENES[id].quest ? SCENES[id].quest : {}) })),
      inv: Object.entries(st.inv).map(([id, n]) => ({ id, n, ...item(id) })),
      weapon: st.weapon,
      armor: st.armor,
      kills: st.kills,
      chapter: st.chapter,
      endings: st.endings.slice(),
    };
  }

  // ---------- اثرها ----------
  runEffects(list) {
    if (!Array.isArray(list)) return {};
    const arr = list == null ? [] : Array.isArray(list) ? list : [list];
    const control = { goto: null, end: null, combat: null, travel: null };
    const plain = [];
    for (const e of arr) {
      const s = String(e);
      if (s.startsWith('goto:')) control.goto = s.slice(5);
      else if (s.startsWith('end:')) control.end = s.slice(4);
      else if (s.startsWith('combat:')) control.combat = s.slice(7).split(/[,+]/).map((x) => x.trim()).filter(Boolean);
      else if (s.startsWith('travel:')) control.travel = s.slice(7);
      else plain.push(s);
    }
    if (plain.length) {
      const before = this.state.level;
      applyEffects(this.state, plain);
      this.lastEffects = plain;
      // بالا رفتنِ سطح (از تجربهٔ داستان) هم به بازیکن خبر داده شود
      if (this.state.level > before)
        this.message = `⭐ سطح ${this.state.level}! جان و توان بیشتر شد.`;
    }
    return control;
  }

  // ---------- ورود به صحنه ----------
  enter(id) {
    if (ENDINGS[id]) return this.ending(id);
    if (id === HUB || id === '@' || !id) {
      this.mode = 'hub';
      this.state.scene = HUB;
      this.shop = null;
      return this.view();
    }
    const node = SCENES[id];
    if (!node) {
      console.warn('صحنهٔ ناشناخته:', id);
      this.mode = 'hub';
      this.state.scene = HUB;
      return this.view();
    }
    this.state.scene = id;
    this.state.sceneCount++;
    this.mode = 'scene';
    this.shop = null;
    // دیدن مکان
    if (node.at) this.state.visited[node.at] = 1;
    this.state.flags['seen_' + id] = 1;
    if (node.chapter) this.state.chapter = Math.max(this.state.chapter, node.chapter);
    const ctrl = this.runEffects(node.onEnter);
    if (node.text) this.state.log.push({ id, title: node.t || '', at: Date.now() });
    if (this.state.log.length > 60) this.state.log.shift();
    if (ctrl.combat) return this.startCombat(ctrl.combat, node);
    // صحنه‌ای که خودش نبرد دارد (فقط بار اول)
    if (node.combat && !this.state.flags['fought_' + id]) {
      return this.startCombat(node.combat.foes, node.combat, id);
    }
    // پیام‌های شرطی داخل صحنه
    if (node.when) {
      const c = node.when.find((w) => checkCond(this.state, w.if));
      if (c && c.goto) return this.enter(c.goto);
    }
    if (ctrl.end) return this.ending(ctrl.end);
    if (ctrl.goto) return this.enter(ctrl.goto);
    // صحنه‌ای که فقط متن است و خودش انتخاب دارد
    return this.view();
  }

  /** صحنهٔ جاری را دوباره می‌خواند (برای انتخاب‌هایی که فقط متن/اثر دارند) */
  refresh() {
    return this.view();
  }

  // ---------- ساخت نمای صحنه ----------
  buildSceneView(node) {
    const st = this.state;
    const choices = [];
    const src = node.choices || [];
    for (const c of src) {
      if (!checkCond(st, c.if)) continue;
      choices.push({
        k: 'choice',
        label: c.t,
        note: c.note || '',
        emoji: c.emoji || '',
        locked: false,
        choice: c,
      });
    }
    if (node.auto && !choices.length) {
      choices.push({ k: 'goto', v: node.auto, label: node.autoLabel || 'ادامه…', emoji: '➡️' });
    }
    if (node.end) choices.push({ k: 'end', v: node.end, label: 'پایان این راه…', emoji: '🔚' });
    return {
      type: 'scene',
      id: this.state.scene,
      title: node.t || loc(st.location).name,
      art: node.art || loc(st.location).emoji,
      chapter: node.chapter || st.chapter,
      text: Array.isArray(node.text) ? node.text : node.text ? [node.text] : [],
      choices,
    };
  }

  // ---------- نمای مرکز مکان (سفر آزاد) ----------
  hookFor(locId) {
    const out = [];
    for (const [id, node] of Object.entries(SCENES)) {
      if (node.at !== locId || !node.hook) continue;
      const lost = this.state.flags['lost_' + id];
      if (this.state.flags['seen_' + id] && !lost && !node.repeat) continue;
      if (lost && this.state.flags['done_' + id]) continue;
      if (typeof node.when === 'string' && !checkCond(this.state, node.when)) continue;
      out.push({ id, ...node });
    }
    return out;
  }

  /** نزدیک‌ترین جایی که داستانِ تازه‌ای دارد (برای راهنمایی بازیکن) */
  storyHint() {
    const st = this.state;
    const hasHook = (id) => this.hookFor(id).length > 0;
    if (hasHook(st.location)) return { here: true, loc: st.location, steps: 0 };
    // پیمایش عرض‌اول روی نقشه (قفل‌ها را بازیکن باید خودش باز کند)
    const seen = new Set([st.location]);
    let frontier = [{ id: st.location, first: null, steps: 0 }];
    while (frontier.length && frontier[0].steps < 6) {
      const next = [];
      for (const cur of frontier) {
        for (const nb of loc(cur.id).neighbors || []) {
          if (seen.has(nb)) continue;
          seen.add(nb);
          // جایی که راهش بسته است، نه مقصد می‌شود نه گذرگاه
          if (loc(nb).locked && !loc(nb).locked.every((c) => condName(st, c))) continue;
          const first = cur.first || nb;
          if (hasHook(nb)) return { here: false, loc: nb, via: first, steps: cur.steps + 1 };
          next.push({ id: nb, first, steps: cur.steps + 1 });
        }
      }
      frontier = next;
    }
    return null;
  }

  buildHubView() {
    const st = this.state;
    const L = loc(st.location);
    const choices = [];
    // داستان‌های این مکان
    for (const h of this.hookFor(st.location)) {
      choices.push({ k: 'goto', v: h.id, label: h.hook, note: h.t || '', emoji: h.art || '📜', story: true });
    }
    // آدم‌ها
    for (const c of charsAt(st.location)) {
      if (c.if && !checkCond(st, c.if)) continue;
      const rel = st.rel[c.id] || 0;
      choices.push({
        k: 'talk', v: c.id, label: `گفت‌وگو با ${c.name}`, note: c.role || '', emoji: c.emoji,
        rel, comp: st.companions.includes(c.id),
      });
    }
    const hints = [];
    // خدمات
    for (const s of L.services || []) choices.push(serviceChoice(s));
    if (L.explore) choices.push({ k: 'explore', label: 'گشتن در این‌جا', note: L.explore.text || '', emoji: '🔍' });
    if (L.rest) choices.push({ k: 'rest', label: `آسودن کنار ${L.name}`, note: `جان +${L.rest}`, emoji: '😌' });
    // سفر
    const hint = this.storyHint();
    for (const t of travelOptions(st)) {
      const onRoad = hint && !hint.here && hint.via === t.id;
      choices.push({
        k: 'travel', v: t.id, label: `${t.emoji} سفر به ${t.name}`, note: t.locked ? '🔒 راهش بسته است' : `${t.region} — ${t.cost} پاس از روز`,
        emoji: '', locked: t.locked, cost: t.cost, story: onRoad, road: onRoad,
      });
    }
    if (hint && hint.here) hints.push('🧭 داستان همین‌جاست.');
    else if (hint) hints.push(`🧭 ادامهٔ داستان: از راهِ ${loc(hint.via).name} به ${loc(hint.loc).name} (${hint.steps} منزل).`);
    if (this.state.kills > 0) hints.push(`تا حالا ${st.kills} تن را از پا انداخته‌ای.`);
    for (const q of Object.keys(st.quests)) {
      const node = SCENES[q];
      if (node && node.quest && !node.quest.done) hints.push(`${node.quest.emoji || '📌'} ${node.quest.title || q}`);
    }
    return {
      type: 'hub',
      id: HUB,
      title: `${L.emoji} ${L.name}`,
      art: L.emoji,
      region: L.region,
      text: [L.desc, ...(hints.length ? [hints.join(' ')] : [])],
      choices,
    };
  }

  view() {
    if (this.mode === 'end' && this.endView) return this.endView;
    if (this.combat && !this.combat.over) return { type: 'combat', ...this.combat.view() };
    if (this.mode === 'shop' || this.mode === 'guild' || this.mode === 'train') return this.buildShopView();
    if (this.mode === 'hub') return this.buildHubView();
    const node = this.scene();
    if (!node) return this.enter(HUB);
    return this.buildSceneView(node);
  }

  // ---------- انتخاب ----------
  choose(i) {
    const v = this.view();
    if (v.type === 'combat') return this.chooseCombat(null, i);
    const c = v.choices && v.choices[i];
    if (!c) return v;
    if (c.locked) return v;
    this.message = '';
    // فروشگاه، تختهٔ کارها، آموزشگاه و کوله هم همان گزینه‌های شناخته‌شده را دارند
    return this.chooseStory(c);
  }

  chooseStory(c) {
    switch (c.k) {
      case 'choice': {
        const ch = c.choice || {};
        const ctrl = this.runEffects(ch.do);
        if (ctrl.combat) return this.startCombat(ctrl.combat, { fleeTo: HUB }, this.state.scene);
        if (ctrl.end) return this.ending(ctrl.end);
        if (ctrl.travel) return this.travelTo(ctrl.travel);
        if (ctrl.goto) return this.enterOrEnd(ctrl.goto);
        // مقصد خودِ گزینه: '@' یعنی برگشت به مرکز مکان
        if (ch.to) return this.enterOrEnd(ch.to);
        if (ch.combat) return this.startCombat(ch.combat.foes, ch.combat, this.state.scene);
        return this.view();
      }
      case 'goto':
        return this.enter(c.v);
      case 'end':
        return this.ending(c.v);
      case 'talk':
        return this.talk(c.v);
      case 'service':
        return this.service(c.v);
      case 'travel':
        return this.travelTo(c.v);
      case 'explore':
        return this.explore();
      case 'rest':
        return this.restFree();
      case 'buy':
        return this.buy(c.v);
      case 'train':
        return this.train(c.v);
      case 'use':
        return this.useItem(c.v);
      default:
        return this.view();
    }
  }

  /** انتخاب در نمایی که خودت داری (کوله، فروشگاه باز، …) */
  chooseInView(v, i) {
    const c = v && v.choices && v.choices[i];
    if (!c) return this.view();
    return this.chooseStory(c);
  }

  chooseCombat(c, i) {
    const combat = this.combat;
    if (!combat) return this.view();
    const action = combat.actions()[i];
    if (!action) return this.view();
    combat.act(action.id, action.skill);
    this.state.hp = Math.max(0, combat.hp);
    if (combat.over) return this.resolveCombat();
    return this.view();
  }

  resolveCombat() {
    const combat = this.combat;
    const node = this.combatSource || {};
    this.combat = null;
    if (combat.fled) {
      this.message = 'از میدان گریختی.';
      return this.enterOrEnd(node.fleeTo, HUB);
    }
    if (combat.won) {
      if (node.__scene) {
        delete this.state.flags['lost_' + node.__scene];
        this.state.flags['done_' + node.__scene] = 1;
      }
      const loot = [];
      for (const f of combat.foes) {
        if (f.id === 'rat' && Math.random() < 0.35) loot.push('bread');
        if (f.kind === 'human' && Math.random() < 0.3) loot.push('potion');
      }
      const ctrl = this.runEffects(node.onWin || []);
      for (const id of loot) {
        this.state.inv[id] = (this.state.inv[id] || 0) + 1;
      }
      if (loot.length) this.message = 'از کشته‌ها برداشتی: ' + loot.map((l) => item(l).name).join('، ');
      if (ctrl.end) return this.ending(ctrl.end);
      if (ctrl.goto) return this.enter(ctrl.goto);
      return this.enterOrEnd(node.winTo, HUB);
    }
    // باخت: صحنه‌ای که در آن باختیم دوباره در دسترس می‌شود تا بشود دوباره تلاش کرد
    if (node.__scene) {
      this.state.flags['lost_' + node.__scene] = 1;
      delete this.state.flags['fought_' + node.__scene];
    }
    this.state.hp = Math.max(1, Math.round(this.state.hpMax * 0.4));
    const ctrl = this.runEffects(node.onLose || []);
    if (ctrl.end) return this.ending(ctrl.end);
    if (ctrl.goto) return this.enter(ctrl.goto);
    return this.enterOrEnd(node.loseTo, 'death_soft');
  }

  startCombat(foes, node, sceneId) {
    // دو قالب داریم:
    //   { foes, onWin:'sceneId', onLose:'sceneId' }  ← قالب صحنه‌های داستان
    //   { winTo:'sceneId', loseTo:'sceneId', onWin:[اثر], onLose:[اثر] }
    const src = node || {};
    const norm = { ...src };
    if (typeof src.onWin === 'string') {
      norm.winTo = src.onWin;
      norm.onWin = [];
    }
    if (typeof src.onLose === 'string') {
      norm.loseTo = src.onLose;
      norm.onLose = [];
    }
    if (sceneId) {
      norm.__scene = sceneId;
      delete this.state.flags['lost_' + sceneId];
      this.state.flags['fought_' + sceneId] = 1;
    }
    this.combatSource = norm;
    this.combat = new Combat(this.state, foes, {});
    return this.view();
  }

  /** رفتن به صحنه یا پایان، هرکدام که بود */
  enterOrEnd(id, fallback) {
    const to = id || fallback || HUB;
    if (ENDINGS[to]) return this.ending(to);
    return this.enter(to);
  }

  // ---------- سفر ----------
  travelTo(id) {
    const st = this.state;
    if (!LOCATIONS[id]) return this.view();
    if (!canTravelTo(st, id)) {
      this.message = 'راهی به آن‌جا نمی‌بری.';
      return this.view();
    }
    const L = loc(id);
    if (L.locked && !L.locked.every((c) => condName(st, c))) {
      this.message = 'راه بسته است؛ اول باید مقدماتش را فراهم کنی.';
      return this.view();
    }
    const cost = travelCost(st.location, id);
    st.location = id;
    st.visited[id] = 1;
    this.advance(cost);
    this.mode = 'hub';
    this.state.scene = HUB;
    // برخورد تصادفی بین راه
    const enc = L.encounters;
    const chance = L.encounterChance || 0;
    const nightBoost = st.phase === 'night' ? 0.15 : 0;
    if (enc && Math.random() < chance + nightBoost) {
      const group = ENCOUNTERS[enc][Math.floor(Math.random() * ENCOUNTERS[enc].length)];
      this.message = 'در راه، چیزی جلوی راهت سبز شد!';
      return this.startCombat(group, { winTo: HUB, loseTo: 'death_soft' });
    }
    return this.view();
  }

  /** گذر زمان: n پاس از روز */
  advance(n = 1) {
    const st = this.state;
    for (let i = 0; i < n; i++) {
      const idx = PHASE_ORDER.indexOf(st.phase);
      const next = (idx + 1) % PHASE_ORDER.length;
      st.phase = PHASE_ORDER[next];
      st.phasesPassed = (st.phasesPassed || 0) + 1;
      if (next === 0) {
        st.day++;
        // شب‌خوابی: کمی جان و توان
        st.hp = Math.min(st.hpMax, st.hp + Math.round(st.hpMax * 0.3));
        st.energy = Math.min(st.energyMax, st.energy + 3);
      }
    }
    clampState(st);
  }

  // ---------- گفت‌وگو ----------
  talk(npcId) {
    const c = char(npcId);
    if (!c.talk || !SCENES[c.talk]) {
      this.message = `${c.name} سرش شلوغ است.`;
      return this.view();
    }
    return this.enter(c.talk);
  }

  // ---------- خدمات ----------
  service(kind) {
    if (kind === 'shop' || kind === 'smith' || kind === 'black') {
      this.mode = 'shop';
      this.shop = kind;
      return this.view();
    }
    if (kind === 'inn') {
      if (this.state.gold < 6) {
        this.message = 'پول کافی برای اتاق نداری.';
        return this.view();
      }
      this.state.gold -= 6;
      this.state.hp = this.state.hpMax;
      this.state.energy = this.state.energyMax;
      this.advance(4 - PHASE_ORDER.indexOf(this.state.phase));
      this.message = 'شب را در بستر گرم خوابیدی؛ جان و توان کامل شد.';
      return this.view();
    }
    if (kind === 'heal') {
      if (this.state.gold < 8) {
        this.message = 'حکیم پولی می‌خواهد که نداری.';
        return this.view();
      }
      this.state.gold -= 8;
      this.state.hp = Math.min(this.state.hpMax, this.state.hp + 18);
      this.state.flags.poisoned = 0;
      this.message = 'زخم‌هایت بسته شد.';
      return this.view();
    }
    if (kind === 'temple') {
      if (this.state.gold < 10) {
        this.message = 'بی‌پیشکش، دعا بالا نمی‌رود.';
        return this.view();
      }
      this.state.gold -= 10;
      this.state.flags.blessed = 1;
      this.state.energy = Math.min(this.state.energyMax, this.state.energy + 4);
      this.message = 'باد نامت را برد؛ برکت همراهت شد.';
      return this.view();
    }
    if (kind === 'guild') {
      this.mode = 'guild';
      this.shop = 'guild';
      return this.view();
    }
    if (kind === 'train') {
      this.mode = 'train';
      this.shop = 'train';
      return this.view();
    }
    return this.view();
  }

  restFree() {
    const L = loc(this.state.location);
    const heal = L.rest || 4;
    this.state.hp = Math.min(this.state.hpMax, this.state.hp + heal);
    this.state.energy = Math.min(this.state.energyMax, this.state.energy + 2);
    this.advance(1);
    this.message = `آسودی؛ جان +${heal}.`;
    return this.view();
  }

  train(stat) {
    const st = this.state;
    const cost = 20 + (st.stats[stat] || 2) * 10;
    if (st.gold < cost) {
      this.message = `برای این آموزش ${cost} سکه لازم است.`;
      return this.view();
    }
    if ((st.stats[stat] || 0) >= 10) {
      this.message = 'بیش از این نمی‌توانی بیاموزی.';
      return this.view();
    }
    st.gold -= cost;
    st.stats[stat] += 1;
    this.advance(2);
    this.message = `ویژگی «${STAT_FA[stat]}» یک پله بالا رفت (${st.stats[stat]}).`;
    this.mode = 'hub';
    return this.view();
  }

  // ---------- گشتن ----------
  explore() {
    const st = this.state;
    const L = loc(st.location);
    const ex = L.explore || {};
    this.advance(1);
    if (ex.needItem && !st.inv[ex.needItem]) {
      this.message = `برای این کار به «${item(ex.needItem).name}» نیاز داری.`;
      return this.view();
    }
    if (Math.random() < (ex.chance || 0.5)) {
      const loot = Array.isArray(ex.loot) ? ex.loot[Math.floor(Math.random() * ex.loot.length)] : ex.loot;
      if (loot === 'gold') {
        const g = 5 + Math.floor(Math.random() * 25);
        st.gold += g;
        this.message = `زیر سنگ‌ها کیسه‌ای پیدا کردی: ${g} سکه.`;
      } else if (loot) {
        st.inv[loot] = (st.inv[loot] || 0) + 1;
        this.message = `پیدا کردی: ${item(loot).emoji} ${item(loot).name}`;
      }
      this.lastFound = loot;
    } else if (L.encounters && Math.random() < 0.5) {
      const group = ENCOUNTERS[L.encounters][Math.floor(Math.random() * ENCOUNTERS[L.encounters].length)];
      this.message = 'کمین!';
      return this.startCombat(group, { winTo: HUB, loseTo: 'death_soft' });
    } else {
      this.message = 'چیزی پیدا نکردی جز خاک و باد.';
    }
    return this.view();
  }

  // ---------- فروشگاه ----------
  buildShopView() {
    const kind = this.shop || 'shop';
    const stockMap = { shop: SHOP_STOCK, smith: SMITH_STOCK, black: BLACK_STOCK };
    const titles = { shop: '🛒 خواربار و دارو', smith: '🔨 زرادخانه', black: '🏴 بازار سیاه', guild: '📜 تختهٔ کارها', train: '🎓 آموزشگاه' };
    if (kind === 'guild') return this.buildGuildView();
    if (kind === 'train') return this.buildTrainView();
    const stock = stockMap[kind] || SHOP_STOCK;
    const mult = kind === 'black' ? 1.35 : 1;
    const choices = stock.map((id) => {
      const it = item(id);
      const price = Math.round((it.price || 10) * mult);
      return {
        k: 'buy', v: id, label: `${it.emoji} ${it.name} — ${price} سکه`,
        note: it.desc || '', locked: this.state.gold < price, price,
      };
    });
    choices.push({ k: 'goto', v: HUB, label: 'بازگشت', emoji: '↩️' });
    return {
      type: 'shop', id: 'shop', title: titles[kind] || 'فروشگاه', art: '🛒',
      text: [`کیسهٔ تو: ${this.state.gold} سکه.`, kind === 'black' ? 'فروشنده زیر چشم نگاهت می‌کند.' : 'فروشنده سرش را از حساب برنمی‌دارد.'],
      choices,
    };
  }

  buy(id) {
    const st = this.state;
    const kind = this.shop || 'shop';
    const it = item(id);
    const mult = kind === 'black' ? 1.35 : 1;
    const price = Math.round((it.price || 10) * mult);
    if (st.gold < price) {
      this.message = 'سکه کافی نداری.';
      return this.view();
    }
    st.gold -= price;
    st.inv[id] = (st.inv[id] || 0) + 1;
    this.message = `${it.emoji} ${it.name} خریدی.`;
    return this.view();
  }

  buildGuildView() {
    const st = this.state;
    const jobs = Object.entries(SCENES).filter(([, n]) => n.at === st.location && n.job && !st.flags['seen_' + n.id]);
    const choices = jobs.map(([id, n]) => ({ k: 'goto', v: id, label: `📌 ${n.job}`, note: n.t || '', }));
    choices.push({ k: 'goto', v: HUB, label: 'بازگشت', emoji: '↩️' });
    return {
      type: 'shop', id: 'guild', title: '📜 تختهٔ کارها', art: '📜',
      text: jobs.length ? ['برگه‌هایی میخ‌شده بر تخته؛ هرکدام یک دردسر.'] : ['تخته خالی است؛ کارهای این‌جا را همه برده‌اند.'],
      choices,
    };
  }

  buildTrainView() {
    const st = this.state;
    const choices = Object.keys(st.stats).map((k) => {
      const cost = 20 + st.stats[k] * 10;
      return { k: 'train', v: k, label: `${STAT_FA[k]} → ${st.stats[k] + 1}`, note: `${cost} سکه`, locked: st.gold < cost || st.stats[k] >= 10, price: cost };
    });
    choices.push({ k: 'goto', v: HUB, label: 'بازگشت', emoji: '↩️' });
    return { type: 'shop', id: 'train', title: '🎓 آموزشگاه', art: '🎓', text: ['استادها در حیاط نشسته‌اند و منتظر سکه‌اند.'], choices };
  }

  // ---------- کوله ----------
  invView() {
    const st = this.state;
    const choices = [];
    for (const [id, n] of Object.entries(st.inv)) {
      const it = item(id);
      const useable = it.kind === 'use' || it.kind === 'weapon' || it.kind === 'armor';
      choices.push({
        k: 'use', v: id, label: `${it.emoji} ${it.name} ×${n}`, note: it.desc || '', disabled: !useable,
      });
    }
    return { type: 'inv', title: '🎒 کوله', art: '🎒', text: [], choices };
  }

  useItem(id) {
    const st = this.state;
    const it = item(id);
    if (!st.inv[id]) return this.view();
    if (it.kind === 'weapon') {
      st.weapon = id;
      this.message = `${it.name} در دست گرفتی.`;
      return this.view();
    }
    if (it.kind === 'armor') {
      st.armor = id;
      this.message = `${it.name} پوشیدی.`;
      return this.view();
    }
    if (it.kind === 'use') {
      st.inv[id] -= 1;
      if (st.inv[id] <= 0) delete st.inv[id];
      if (it.heal) st.hp = Math.min(st.hpMax, st.hp + it.heal);
      if (it.energy) st.energy = Math.min(st.energyMax, st.energy + it.energy);
      if (it.cure) st.flags.poisoned = 0;
      this.message = `${it.emoji} ${it.name} خوردی/نوشیدی.`;
      return this.view();
    }
    this.message = 'این را نمی‌توانی بخوری.';
    return this.view();
  }

  gift(shopFn) {
    return this.view();
  }

  // ---------- پایان ----------
  ending(id) {
    const st = this.state;
    if (!st.endings.includes(id)) st.endings.push(id);
    const e = ENDINGS[id] || { title: 'پایان', text: ['راهت به جایی رسید که کسی نمی‌دانست.'] };
    this.mode = 'end';
    this.endView = {
      type: 'end', id, title: e.title, art: e.art || '🌑',
      text: e.text, epilogue: e.epilogue || '', meta: this.meta(),
    };
    return this.endView;
  }

  // ---------- ذخیره و شروع ----------
  static start(opts = {}) {
    const state = newState(opts.state || {});
    if (!opts.state) {
      state.companions = START_COMPANIONS.slice();
      for (const id of START_COMPANIONS) state.rel[id] = 2;
    }
    const eng = new Engine(state, opts.hooks);
    eng.enter(opts.scene || 'intro_1');
    return eng;
  }
  static loadOrNull(hooks) {
    const st = loadGame();
    if (!st) return null;
    const eng = new Engine(st, hooks);
    eng.enter(st.scene && SCENES[st.scene] ? st.scene : HUB);
    return eng;
  }
  save() {
    return saveGame(this.state);
  }
}

export const STAT_FA = { might: 'زور', wits: 'خرد', spirit: 'دل', agility: 'چابکی' };

function condName(st, cond) {
  const [kind, arg] = String(cond).split(':');
  if (kind === 'flag') return !!st.flags[arg];
  if (kind === 'item') return (st.inv[arg] || 0) > 0;
  if (kind === 'questdone') return !!st.done[arg];
  return true;
}
function canTravelTo(st, id) {
  const L = loc(st.location);
  if (L.neighbors.includes(id)) return true;
  // راه‌های یک‌طرفه هم داریم (بازگشت با هزینهٔ بیشتر)
  const T = loc(id);
  return (T.neighbors || []).includes(st.location);
}
function serviceChoice(kind) {
  const map = {
    inn: { label: '🛏️ اتاق مسافرخانه (۶ سکه)', note: 'جان و توان کامل' },
    shop: { label: '🛒 خواربار و داروخانه', note: 'خوردن و نوشیدن بخر' },
    smith: { label: '🔨 زرادخانه', note: 'تیغه و زره' },
    heal: { label: '⚕️ درمان‌گر', note: '۸ سکه' },
    temple: { label: '🕯️ پیشکش به معبد (۱۰ سکه)', note: 'برکت' },
    guild: { label: '📜 تختهٔ کارها', note: 'کارهای پول‌ساز' },
    train: { label: '🎓 آموزش ویژگی', note: 'سکه بده، توان بگیر' },
    black: { label: '🏴 بازار سیاه', note: 'کالای ممنوعه' },
  };
  const m = map[kind] || { label: kind, note: '' };
  return { k: 'service', v: kind, label: m.label, note: m.note, emoji: '' };
}
