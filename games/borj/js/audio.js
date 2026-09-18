// =============================================================
//  audio.js — صداهای بازی «دویدن تا برج» با WebAudio (بدون فایل بیرونی)
//  اگر مرورگر WebAudio نداشته باشد، همهٔ صداها بی‌صدا و بی‌خطا اجرا می‌شوند.
// =============================================================
export const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';
export const HAS_AC = HAS_DOM && !!(window.AudioContext || window.webkitAudioContext);

let ctx = null;
let master = null;
let on = true;

function ensure() {
  if (!HAS_AC) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** یک نُتِ کوتاه؛ نوع موج، فرکانس آغاز/پایان و بلندی صدا */
function tone({ f = 440, f2 = f, dur = 0.12, type = 'square', gain = 0.2, delay = 0, wave = null }) {
  const c = ensure();
  if (!c || !on) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (f2 !== f) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
  if (wave) wave(g, t0, dur);
}

/** یک تیکِ نویزی کوتاه (برای ضربه و خار) */
function noise({ dur = 0.12, gain = 0.18, f = 900, delay = 0 }) {
  const c = ensure();
  if (!c || !on) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(master);
  src.start(t0);
}

export const audio = {
  get on() {
    return on;
  },
  /** آماده‌سازی پس از نخستین لمس کاربر (سیاست مرورگرها) */
  unlock() {
    ensure();
  },
  setOn(v) {
    on = !!v;
    if (on) this.tick();
  },
  toggle() {
    this.setOn(!on);
    return on;
  },
  bgm() {
    // زمینهٔ آرام: یک آکورد کوتاه که هر چند مرحله یک‌بار شنیده می‌شود
    tone({ f: 196, f2: 196, dur: 0.5, type: 'triangle', gain: 0.07 });
    tone({ f: 294, f2: 294, dur: 0.5, type: 'triangle', gain: 0.05, delay: 0.08 });
  },
  jump() {
    tone({ f: 420, f2: 760, dur: 0.13, type: 'square', gain: 0.12 });
  },
  jump2() {
    tone({ f: 620, f2: 980, dur: 0.14, type: 'triangle', gain: 0.13 });
  },
  coin() {
    tone({ f: 1250, f2: 1250, dur: 0.07, type: 'square', gain: 0.11 });
    tone({ f: 1850, f2: 1850, dur: 0.1, type: 'square', gain: 0.09, delay: 0.06 });
  },
  power() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ f, f2: f, dur: 0.16, type: 'triangle', gain: 0.12, delay: i * 0.07 }));
  },
  stomp() {
    tone({ f: 260, f2: 120, dur: 0.16, type: 'square', gain: 0.16 });
    noise({ dur: 0.1, gain: 0.12, f: 700 });
  },
  hurt() {
    tone({ f: 300, f2: 110, dur: 0.3, type: 'sawtooth', gain: 0.16 });
    noise({ dur: 0.16, gain: 0.12, f: 420 });
  },
  dead() {
    [392, 330, 262, 196].forEach((f, i) => tone({ f, f2: f * 0.94, dur: 0.22, type: 'triangle', gain: 0.14, delay: i * 0.13 }));
  },
  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f, f2: f, dur: 0.2, type: 'square', gain: 0.13, delay: i * 0.1 }));
  },
  click() {
    tone({ f: 700, f2: 900, dur: 0.05, type: 'square', gain: 0.09 });
  },
  tick() {
    tone({ f: 1400, f2: 1400, dur: 0.03, type: 'square', gain: 0.06 });
  },
};
