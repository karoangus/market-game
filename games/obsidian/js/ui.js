// =============================================================
//  ui.js — لایهٔ نمایش ابسیدین (همه‌چیز بر پایهٔ نمای engine)
//  موتور هیچ DOMی نمی‌شناسد؛ این‌جا نما به HTML تبدیل می‌شود.
// =============================================================
import { item } from '../data/items.js';
import { LOCATIONS, loc, REGIONS } from '../data/world.js';
import { STAT_FA } from './engine.js';
import { voice } from './voice.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class UI {
  constructor(engine, hooks = {}) {
    this.engine = engine;
    this.hooks = hooks;
    this.current = null;
    this._lastType = null;
    this._lastLog = 0;
    this.bindStatic();
  }

  // ---------------- پنل‌ها ----------------
  openSheet(id) {
    document.querySelectorAll('.sheet').forEach((s) => s.classList.toggle('open', s.id === id));
    $('sheet-backdrop').classList.add('show');
  }
  closeSheets() {
    document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('open'));
    $('sheet-backdrop').classList.remove('show');
  }
  toast(msg, ms = 2600) {
    const t = $('toast');
    if (!t || !msg) return;
    t.innerHTML = `<span>${msg}</span>`;
    t.classList.remove('hidden');
    clearTimeout(this._t);
    this._t = setTimeout(() => t.classList.add('hidden'), ms);
  }
  confirm(msg, onYes) {
    $('confirm-msg').textContent = msg;
    $('confirm').classList.remove('hidden');
    this._yes = onYes;
  }

  bindStatic() {
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeSheets()));
    $('sheet-backdrop').addEventListener('click', () => this.closeSheets());
    $('confirm-no').addEventListener('click', () => $('confirm').classList.add('hidden'));
    $('confirm-yes').addEventListener('click', () => {
      $('confirm').classList.add('hidden');
      this._yes && this._yes();
    });
    $('btn-inv').addEventListener('click', () => this.showInv());
    $('btn-map').addEventListener('click', () => this.showMap());
    $('btn-quests').addEventListener('click', () => this.showQuests());
    $('btn-settings').addEventListener('click', () => this.showSettings());
    $('btn-settings2').addEventListener('click', () => this.showSettings());
    $('btn-full').addEventListener('click', () => {
      const d = document;
      if (!d.fullscreenElement) d.documentElement.requestFullscreen?.().catch(() => {});
      else d.exitFullscreen?.().catch(() => {});
    });
    $('btn-speak').addEventListener('click', () => {
      const v = this.current;
      if (!v) return;
      voice.speak(this.plainText(v), v.id);
    });
    $('btn-mute').addEventListener('click', () => {
      voice.setMuted(voice.enabled);
      this.syncVoiceButtons();
      this.toast(voice.enabled ? '🔊 صدا روشن شد' : '🔇 صدا خاموش شد');
    });
    // کلیدهای ۱..۹ برای انتخاب
    document.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) this.choose(n - 1);
      if (e.key === 'Escape') this.closeSheets();
      if (e.key === 'Enter') this.choose(0);
    });
    voice.on(() => this.syncVoiceButtons());
    this.syncVoiceButtons();
  }

  syncVoiceButtons() {
    const m = $('btn-mute');
    if (m) {
      m.textContent = voice.enabled ? '🔈' : '🔇';
      m.classList.toggle('off', !voice.enabled);
    }
    const s = $('btn-speak');
    if (s) s.classList.toggle('off', !voice.enabled);
    const a = $('set-auto');
    if (a) a.checked = voice.auto;
  }

  plainText(v) {
    const t = (v.text || []).join(' ');
    return `${v.title || ''}. ${t}`.trim();
  }

  // ---------------- HUD ----------------
  refreshHUD() {
    const m = this.engine.meta();
    $('hud-place').textContent = `${loc(m.locationId).emoji} ${m.location}`;
    $('hud-day').textContent = `📅 روز ${m.day} · ${m.phaseName}`;
    $('hud-gold').textContent = `💰 ${m.gold}`;
    $('hud-hp').textContent = `❤️ ${Math.max(0, m.hp)}/${m.hpMax}`;
    $('hud-energy').textContent = `⚡ ${m.energy}/${m.energyMax}`;
    $('hud-level').textContent = `⭐ ${m.level}`;
    $('set-scenes').textContent = this.engine.state.sceneCount;
    $('set-clips').textContent = voice.clips();
  }

  // ---------------- انتخاب ----------------
  choose(i) {
    const v = this.current;
    if (!v) return;
    const choices = v.type === 'combat' ? v.actions : v.choices;
    if (!choices || !choices[i]) return;
    if (choices[i].locked) {
      this.toast('🔒 این راه باز نیست.');
      return;
    }
    if (this.current.type === 'combat') sfx.hit();
    else sfx.click();
    const hp0 = this.engine.state.hp;
    const lv0 = this.engine.state.level;
    this.engine.choose(i);
    if (this.engine.state.level > lv0) sfx.level();
    else if (this.engine.state.hp < hp0 - 2) sfx.hurt();
    this.hooks.onTurn && this.hooks.onTurn(this.engine);
    this.render();
  }

  // ---------------- رندر ----------------
  render() {
    const v = this.engine.view();
    const changed = this._lastType !== v.type || v.id !== this._lastId;
    this.current = v;
    if (v.type === 'end') sfx.win();
    else if (v.type === 'combat' && changed) sfx.lose();
    else if (changed) sfx.page();
    if (v.type === 'combat' && v.log) {
      // هر ضربهٔ تازه، صدای خودش را دارد
      if (v.log.length > this._lastLog) sfx.hit();
      this._lastLog = v.log.length;
    }
    this._lastType = v.type;
    this._lastId = v.id;
    this.refreshHUD();
    if (v.type === 'combat') this.renderCombat(v);
    else if (v.type === 'end') this.renderEnd(v);
    else this.renderScene(v);
    // خواندن خودکار صدا
    if (v.type !== 'combat' && voice.auto && voice.enabled) {
      voice.speak(this.plainText(v), v.id);
    }
  }

  renderScene(v) {
    $('combat').classList.add('hidden');
    const scene = $('scene');
    scene.classList.remove('hidden');
    scene.style.animation = 'none';
    void scene.offsetWidth;
    scene.style.animation = '';
    $('scene-art').textContent = v.art || '🪨';
    $('scene-title').textContent = v.title || '';
    const text = $('scene-text');
    text.innerHTML = '';
    for (const p of v.text || []) {
      if (!p) continue;
      text.appendChild(el('p', null, String(p).replace(/\n+/g, '<br>')));
    }
    const extra = $('scene-extra');
    extra.innerHTML = '';
    const m = this.engine.meta();
    if (v.type === 'hub' && m.quests.length) {
      extra.innerHTML = '📌 ' + m.quests.map((q) => `${q.emoji || '•'} ${q.title || q.id}`).join(' · ');
    }
    const box = $('choices');
    box.innerHTML = '';
    (v.choices || []).forEach((c, i) => {
      const b = el('button', `choice ${c.k || ''} ${c.locked ? 'locked' : ''}`);
      const rel = typeof c.rel === 'number' && c.rel !== 0 ? ` <span class="rtag">${c.rel > 0 ? '♥'.repeat(Math.min(3, c.rel)) : '💔'}</span>` : '';
      b.innerHTML = `<span>${c.emoji || ''} ${c.label}${rel}</span>` +
        (c.note ? `<span class="cnote">${c.note}</span>` : '') +
        (c.comp ? ' <span class="rtag">همراه تو</span>' : '') +
        `<span class="cnum">${i + 1}</span>`;
      if (c.locked) b.innerHTML += '';
      b.addEventListener('click', () => this.choose(i));
      box.appendChild(b);
    });
    if (!v.choices || !v.choices.length) {
      box.appendChild(el('div', 'dim', 'راهی نیست… (بازی ذخیره شد)'));
    }
  }

  renderCombat(v) {
    $('scene').classList.add('hidden');
    $('combat').classList.remove('hidden');
    const foes = $('combat-foes');
    foes.innerHTML = '';
    for (const f of v.foes) {
      const d = el('div', `foe ${f.boss ? 'boss' : ''} ${f.hp <= 0 ? 'dead' : ''}`);
      d.innerHTML = `<div class="femoji">${f.emoji}</div><div class="fname">${f.name}</div>
        <div class="fhp"><i style="width:${Math.max(0, (f.hp / f.hpMax) * 100)}%"></i></div>
        <div class="cnote">${Math.max(0, f.hp)} / ${f.hpMax}</div>`;
      foes.appendChild(d);
    }
    $('combat-hp').innerHTML = `<i style="width:${Math.max(0, (v.hp / v.hpMax) * 100)}%"></i>`;
    const log = $('combat-log');
    log.innerHTML = v.log.map((l) => `<div>${l}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    const acts = $('combat-actions');
    acts.innerHTML = '';
    (v.actions || []).forEach((a, i) => {
      const b = el('button', `choice ${a.ok === false ? 'locked' : ''}`);
      b.innerHTML = `<span>${a.emoji || '⚔️'} ${a.label}</span><span class="cnum">${i + 1}</span>`;
      b.addEventListener('click', () => this.choose(i));
      acts.appendChild(b);
    });
  }

  renderEnd(v) {
    $('game').classList.add('hidden');
    $('screen-end').classList.remove('hidden');
    $('end-art').textContent = v.art || '🌑';
    $('end-title').textContent = v.title || 'پایان';
    $('end-text').innerHTML = (v.text || []).map((p) => `<p>${p}</p>`).join('');
    const m = v.meta || this.engine.meta();
    $('end-extra').innerHTML = v.epilogue ? `<p class="gold">${v.epilogue}</p>` : '';
    $('end-stats').innerHTML = `
      <div>روزها<b>${m.day}</b></div>
      <div>سطح<b>${m.level}</b></div>
      <div>سکه<b>${m.gold}</b></div>
      <div>صحنه‌ها<b>${this.engine.state.sceneCount}</b></div>
      <div>همراهان<b>${m.companions.length}</b></div>
      <div>پایان‌های دیده‌شده<b>${m.endings.length}</b></div>`;
    if (voice.auto && voice.enabled) voice.speak(this.plainText(v), v.id);
  }

  // ---------------- پنل‌ها ----------------
  showInv() {
    const st = this.engine.state;
    const rows = Object.entries(st.inv);
    const body = $('inv-body');
    $('inv-who').textContent = `سکه: ${st.gold} · ${STAT_FA.might} ${st.stats.might} · ${STAT_FA.wits} ${st.stats.wits} · ${STAT_FA.spirit} ${st.stats.spirit} · ${STAT_FA.agility} ${st.stats.agility}`;
    body.innerHTML = rows.length ? '' : '<div class="dim">کوله‌ات خالی است.</div>';
    for (const [id, n] of rows) {
      const it = item(id);
      const usable = it.kind === 'use' || it.kind === 'weapon' || it.kind === 'armor';
      const equipped = st.weapon === id || st.armor === id;
      const row = el('div', `row-line inv-item ${usable ? '' : 'dis'}`);
      row.innerHTML = `<span><b>${it.emoji} ${it.name}</b> ×${n}${equipped ? ' <span class="rtag">در دست</span>' : ''}
        <span class="rsub">${it.desc || ''}</span></span>
        <span class="rtag">${it.kind === 'weapon' ? `آسیب ${it.dmg || 0}` : it.kind === 'armor' ? `دفاع ${it.def || 0}` : it.heal ? `جان +${it.heal}` : ''}</span>`;
      row.addEventListener('click', () => {
        const v = this.engine.invView();
        this.engine.chooseInView(v, rows.findIndex((r) => r[0] === id));
        this.toast(this.engine.message || '');
        this.hooks.onTurn && this.hooks.onTurn(this.engine);
        this.showInv();
        this.refreshHUD();
      });
      body.appendChild(row);
    }
    this.openSheet('sheet-inv');
  }

  showMap() {
    const st = this.engine.state;
    const body = $('map-body');
    const nodes = Object.entries(LOCATIONS);
    body.innerHTML = `<div class="map-grid">${nodes
      .map(([id, L]) => {
        const seen = !!st.visited[id];
        const here = st.location === id;
        const canGo = (LOCATIONS[st.location].neighbors || []).includes(id) || (L.neighbors || []).includes(st.location);
        return `<div class="map-node ${here ? 'here' : ''} ${seen ? 'seen' : 'unknown'}">
          <b>${L.emoji} ${seen ? L.name : '؟؟؟'}</b>
          <small>${REGIONS[L.region] || ''} ${L.region}${here ? ' — این‌جایی' : canGo ? ' — راه داری' : ''}</small>
        </div>`;
      })
      .join('')}</div>
      <p class="dim" style="font-size:12.5px;margin-top:12px">برای سفر، از مرکز مکان گزینهٔ «سفر به …» را بزن. جاهای تازه با گشتن و شنیدن خبر باز می‌شوند.</p>`;
    this.openSheet('sheet-map');
  }

  showQuests() {
    const m = this.engine.meta();
    const st = this.engine.state;
    const body = $('quest-body');
    $('quest-sub').textContent = `${Object.keys(st.done).length} کار تمام‌شده`;
    body.innerHTML =
      (m.quests.length
        ? m.quests.map((q) => `<div class="q-item"><b>${q.emoji || '📌'} ${q.title || q.id}</b><br><small>در جریان</small></div>`).join('')
        : '<div class="dim">کار در جریانی نداری. با آدم‌ها حرف بزن و جاها را بگرد.</div>') +
      `<div class="row-line"><span>همراهان<b> ${m.companions.map((c) => c.name).join('، ') || '—'}</b></span></div>
       <div class="row-line"><span>روابط<b> ${
         Object.entries(st.rel)
           .filter(([, v]) => v > 0)
           .slice(0, 8)
           .map(([k, v]) => `${k} ${v}`)
           .join(' · ') || '—'
       }</b></span></div>
       ${st.endings.length ? `<div class="q-item">پایان‌هایی که دیده‌ای: <b>${st.endings.join(' ، ')}</b></div>` : ''}
       ${st.achievements.length ? `<div class="q-item">نشان‌ها: <b>${st.achievements.join(' ، ')}</b></div>` : ''}`;
    this.openSheet('sheet-quests');
  }

  showSettings() {
    const a = $('set-auto');
    a.checked = voice.auto;
    const s2 = $('set-sfx');
    if (s2) {
      s2.checked = sfx.enabled;
      s2.onchange = () => {
        const on = sfx.setOn(s2.checked);
        this.toast(on ? '🔔 صداهای بازی روشن' : '🔕 صداهای بازی خاموش');
      };
    }
    $('set-rate').value = String(voice.rate || 1);
    a.onchange = () => voice.setAuto(a.checked);
    $('set-rate').onchange = (e) => voice.setRate(parseFloat(e.target.value));
    $('set-font').onchange = (e) => document.documentElement.style.setProperty('--fs', e.target.value + 'px');
    $('btn-save').onclick = () => {
      this.engine.save();
      this.toast('💾 ذخیره شد.');
    };
    $('btn-wipe').onclick = () =>
      this.confirm('همهٔ پیشرفت پاک شود؟', () => {
        localStorage.removeItem('obsidian-save-v1');
        location.reload();
      });
    this.refreshHUD();
    this.openSheet('sheet-settings');
  }
}
