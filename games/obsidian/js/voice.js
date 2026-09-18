// =============================================================
//  voice.js — صدای بازی: پخش ویس‌های ضبط‌شده + خواندن با صدای مرورگر
//  هر صحنه اگر ویس داشته باشد از فایل پخش می‌شود، وگرنه مرورگر
//  متن را با صدای فارسی می‌خواند. (بدون اینترنت هم کار می‌کند)
// =============================================================
import { VOICE } from '../audio/manifest.js';

const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';

let audioEl = null;
let currentId = null;
let muted = false;
let autoRead = true;
let rate = 1;
let voiceObj = null;
let listeners = [];

function ensureAudio() {
  if (!HAS_DOM) return null;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.addEventListener('ended', () => {
      currentId = null;
      emit();
    });
    audioEl.addEventListener('error', () => {
      currentId = null;
      emit();
    });
  }
  return audioEl;
}

function emit() {
  for (const fn of listeners) fn({ speaking: !!currentId, id: currentId, muted, autoRead });
}

// صدای فارسی مرورگر را پیدا می‌کند
function pickVoice() {
  if (!HAS_DOM || !('speechSynthesis' in window)) return null;
  const list = window.speechSynthesis.getVoices() || [];
  const fa = list.filter((v) => /^fa/i.test(v.lang || ''));
  if (!fa.length) return null;
  return fa.find((v) => /iran|farsi|persian/i.test(v.name)) || fa[0];
}

export const voice = {
  get available() {
    if (!HAS_DOM) return false;
    return typeof Audio !== 'undefined' || 'speechSynthesis' in window;
  },
  get enabled() {
    return !muted;
  },
  get auto() {
    return autoRead;
  },
  get speaking() {
    return !!currentId;
  },
  init() {
    if (!HAS_DOM) return;
    if ('speechSynthesis' in window) {
      pickVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        voiceObj = pickVoice();
      });
    }
  },
  on(fn) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((f) => f !== fn);
    };
  },
  setMuted(v) {
    muted = !!v;
    if (muted) this.stop();
    emit();
  },
  setAuto(v) {
    autoRead = !!v;
    if (!autoRead) this.stop();
    emit();
  },
  setRate(v) {
    rate = Math.max(0.6, Math.min(1.4, v));
    if (audioEl) audioEl.playbackRate = rate;
  },
  /** خواندن متنِ یک صحنه/رخداد */
  speak(text, id) {
    if (!HAS_DOM || muted || !text) return;
    this.stop();
    const clip = id ? VOICE[id] : null;
    if (clip) {
      const a = ensureAudio();
      if (a) {
        a.src = 'audio/' + clip;
        a.playbackRate = rate;
        currentId = id;
        let pr = null;
        try {
          pr = a.play();
        } catch {
          pr = null;
        }
        if (pr && typeof pr.catch === 'function') {
          pr.catch(() => {
            currentId = null;
            emit();
            this.tts(text, id);
          });
        }
        emit();
        return;
      }
    }
    this.tts(text, id);
  },
  tts(text, id) {
    if (!HAS_DOM || muted || !('speechSynthesis' in window) || !text) return;
    const clean = String(text)
      .replace(/[«»*_#|]/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 420);
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    if (!voiceObj) voiceObj = pickVoice();
    if (voiceObj) u.voice = voiceObj;
    u.lang = (voiceObj && voiceObj.lang) || 'fa-IR';
    u.rate = rate * 0.98;
    u.pitch = 1;
    u.onend = () => {
      if (currentId === id) currentId = null;
      emit();
    };
    u.onerror = () => {
      currentId = null;
      emit();
    };
    currentId = id || 'tts';
    try {
      window.speechSynthesis.speak(u);
    } catch {
      currentId = null;
    }
    emit();
  },
  stop() {
    if (!HAS_DOM) return;
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.currentTime = 0;
      } catch {}
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    currentId = null;
    emit();
  },
  /** آیا برای این صحنه ویس ضبط‌شده داریم؟ */
  hasClip(id) {
    return !!(id && VOICE[id]);
  },
  clips() {
    return Object.keys(VOICE).length;
  },
};
