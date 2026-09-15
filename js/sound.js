// =============================================================
//  sound.js — افکت‌های صوتی کوچک با WebAudio (بدون فایل صوتی)
// =============================================================
let ctx = null;

function ensure() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur = 0.08, type = 'sine', vol = 0.05, delay = 0) {
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  } catch (e) {
    /* ignore */
  }
}

export const sfx = {
  init: ensure,
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
  /** فروش روی صندلی (صدای سکه) */
  coin() {
    ensure();
    tone(880, 0.07, 'sine', 0.05);
    tone(1318, 0.12, 'sine', 0.04, 0.07);
  },
  /** پایان روز */
  dayEnd() {
    ensure();
    [523, 659, 784].forEach((f, i) => tone(f, 0.2, 'sine', 0.05, i * 0.12));
  },
};
