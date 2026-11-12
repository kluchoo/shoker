let audioOn = localStorage.getItem("shoker-mute") !== "1";
let audioCtx = null;

export function isAudioOn() {
  return audioOn;
}

export function setAudioOn(next) {
  audioOn = !!next;
  localStorage.setItem("shoker-mute", audioOn ? "0" : "1");
  return audioOn;
}

export function toggleAudio() {
  return setAudioOn(!audioOn);
}

export function unlockAudio() {
  const ctx = context();
  if (ctx && ctx.state === "suspended") ctx.resume();
}

function context() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

export function chime(freq, dur, type, volume) {
  if (!audioOn) return;
  const ctx = context();
  if (!ctx) return;
  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur);
}

export function playSpinSounds(remain, spin) {
  if (!audioOn) return;
  const ctx = context();
  if (!ctx) return;
  const start = ctx.currentTime;
  const seconds = remain / 1000;
  for (let i = 0; i < 12; i += 1) {
    const at = start + (i / 12) * seconds;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 180 + i * 18;
    gain.gain.setValueAtTime(0.03, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  }
  const at = start + seconds;
  const freq = spin.outcome === "soplica" ? 880 : spin.outcome === "drink" ? 140 : 520;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = spin.outcome === "drink" ? "sawtooth" : "triangle";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.06, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.5);
}
