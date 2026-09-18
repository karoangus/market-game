// =============================================================
//  sound.js — افکت‌های صوتی با WebAudio (بدون فایل صوتی)
//
//  همهٔ صداها با نوسان‌ساز ساخته می‌شوند: کوتاه، سبک و بی‌نیاز
//  به دانلود. صدای زنگ صندوق، بوق اسکنر، برداشتن کالا، بازشدن در…
// =============================================================
let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.08, type = 'sine', vol = 0.05, delay = 0) {
  if (!ctx || muted) return;
  try {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master || ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  } catch (e) {
    /* ignore */
  }
}

function sweep(f0, f1, dur = 0.18, vol = 0.045, type = 'sine', delay = 0) {
  if (!ctx || muted) return;
  try {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master || ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  } catch (e) {
    /* ignore */
  }
}

function noise(dur = 0.14, vol = 0.04, delay = 0) {
  if (!ctx || muted) return;
  try {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    src.connect(f);
    f.connect(g);
    g.connect(master || ctx.destination);
    src.start(ctx.currentTime + delay);
  } catch (e) {
    /* ignore */
  }
}

export const sfx = {
  init: ensure,
  setMuted(v) {
    muted = !!v;
    if (master) master.gain.value = muted ? 0 : 0.7;
  },
  get muted() {
    return muted;
  },
  /** کلیک عمومی */
  click() {
    ensure();
    tone(520, 0.04, 'sine', 0.03);
  },
  /** خرید جنس از تأمین‌کننده */
  buy() {
    ensure();
    tone(420, 0.06, 'triangle', 0.06);
    tone(640, 0.08, 'triangle', 0.05, 0.06);
  },
  /** برداشتن کالا از قفسه */
  grab() {
    ensure();
    sweep(760, 380, 0.09, 0.035, 'sine');
  },
  /** افتادن کالا در سبد */
  basket() {
    ensure();
    tone(300, 0.06, 'triangle', 0.05);
    tone(220, 0.09, 'sine', 0.04, 0.05);
  },
  /** بوق اسکنر صندوق */
  beep() {
    ensure();
    tone(1760, 0.05, 'square', 0.028);
    tone(2637, 0.045, 'square', 0.018, 0.05);
  },
  /** باز/بسته‌شدن در کشویی */
  door() {
    ensure();
    noise(0.22, 0.028);
    sweep(180, 420, 0.26, 0.022, 'sine');
  },
  /** صدای سکه (فروش) */
  coin() {
    ensure();
    tone(880, 0.07, 'sine', 0.05);
    tone(1318, 0.12, 'sine', 0.04, 0.07);
    tone(1760, 0.1, 'sine', 0.025, 0.13);
  },
  /** پایان روز */
  dayEnd() {
    ensure();
    [523, 659, 784].forEach((f, i) => tone(f, 0.2, 'sine', 0.05, i * 0.12));
  },
  /** شروع روز — جینگل کوتاه */
  dayStart() {
    ensure();
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.045, i * 0.09));
  },
  /** خبر خوب (پاداش/رکورد) */
  cheer() {
    ensure();
    [659, 784, 988, 1318].forEach((f, i) => tone(f, 0.14, 'sine', 0.04, i * 0.07));
  },
  /** نارضایتی مشتری */
  grumble() {
    ensure();
    sweep(220, 120, 0.2, 0.035, 'sawtooth');
  },
  /** دست‌زدن/موفقیت */
  success() {
    ensure();
    tone(523, 0.1, 'sine', 0.05);
    tone(784, 0.16, 'sine', 0.045, 0.1);
  },
  /** پول کم */
  error() {
    ensure();
    tone(200, 0.12, 'square', 0.035);
    tone(160, 0.16, 'square', 0.03, 0.1);
  },
  /**
   * صدای قدم (کنترل اول‌شخص).
   * بیرونِ فروشگاه (آسفالت) کمی خش‌تر و بم‌تر از کاشیِ داخل است.
   */
  step(outside = false) {
    if (!ctx || muted) return; // قبل از اولین تعامل، بی‌صدا
    const j = 0.9 + Math.random() * 0.2;
    noise(outside ? 0.055 : 0.04, outside ? 0.017 : 0.011);
    tone((outside ? 66 : 86) * j, 0.045, 'sine', outside ? 0.013 : 0.009);
  },
};
