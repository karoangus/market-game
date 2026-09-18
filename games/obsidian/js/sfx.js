// =============================================================
//  sfx.js — صداهای بازی با WebAudio (بدون فایل صوتی، بدون اینترنت)
//  کلیک، ضربه، سکه، سطح، صفحهٔ داستان، پیروزی
// =============================================================
const HAS_DOM = typeof window !== 'undefined' && typeof AudioContext !== 'undefined';
let ctx = null;
let on = true;

function ac() {
  if (!HAS_DOM) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume?.();
  return ctx;
}

function tone(freq, dur, type = 'sine', gain = 0.13, slideTo = null, delay = 0) {
  const c = ac();
  if (!c || !on) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur = 0.14, gain = 0.1, delay = 0) {
  const c = ac();
  if (!c || !on) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(g);
  g.connect(c.destination);
  src.start(c.currentTime + delay);
}

export const sfx = {
  get enabled() {
    return on;
  },
  setOn(v) {
    on = !!v;
    if (on) this.click();
  },
  toggle() {
    this.setOn(!on);
    return on;
  },
  /** صدای آغاز و تعامل */
  click: () => tone(520, 0.07, 'triangle', 0.09, 640),
  page: () => {
    noise(0.16, 0.05);
    tone(300, 0.1, 'sine', 0.05, 240);
  },
  coin: () => {
    tone(880, 0.09, 'square', 0.07);
    tone(1320, 0.12, 'square', 0.05, null, 0.06);
  },
  hit: () => {
    noise(0.18, 0.14);
    tone(160, 0.16, 'sawtooth', 0.08, 90);
  },
  hurt: () => tone(220, 0.22, 'sawtooth', 0.1, 110),
  level: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, null, i * 0.09));
  },
  win: () => {
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, 'sine', 0.1, null, i * 0.12));
  },
  lose: () => {
    [330, 262, 196].forEach((f, i) => tone(f, 0.4, 'sine', 0.1, null, i * 0.16));
  },
  /** صدای خفیفِ خواندن متن */
  text: () => tone(1200 + Math.random() * 200, 0.03, 'sine', 0.02),
};
