// The demo's chest sounds and buzz, made with the browser's own audio (no files). They start only after a tap, which is
// when browsers allow sound. Phones that cannot vibrate (iPhone Safari) just skip the buzz.
let on = true;
let ctx;

export const soundOn = () => on;
export const setSound = (value) => { on = Boolean(value); };

function tone(freq, delay, length, type = 'triangle', volume = 0.15) {
  try {
    ctx ||= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + length + 0.05);
  } catch { /* no audio here */ }
}
const buzz = (pattern) => { try { globalThis.navigator?.vibrate?.(pattern); } catch { /* not supported */ } };

export const sfx = {
  rumble() { if (!on) return; [110, 98, 110, 98].forEach((f, i) => tone(f, i * 0.13, 0.14, 'sawtooth', 0.08)); buzz([40, 30, 40, 30, 60]); },
  open() { if (!on) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.5)); buzz([20, 40, 80]); },
};
