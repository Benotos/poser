"use client";
// Tiny synthesized arcade sounds. No audio files.
import { readSettings } from "./settings";

let ctx: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  try { ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freqs: number[], step = 0.07, type: OscillatorType = "square", vol = 0.05) {
  if (!readSettings().sounds) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  freqs.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0 + i * step);
    g.gain.setValueAtTime(vol, t0 + i * step);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * step + step * 0.95);
    o.connect(g).connect(c.destination);
    o.start(t0 + i * step);
    o.stop(t0 + i * step + step);
  });
}

export const sfx = {
  buy: () => tone([523, 784], 0.06),
  win: () => tone([523, 659, 784, 1047], 0.07),
  loss: () => tone([392, 311, 233], 0.09, "triangle", 0.06),
  alert: () => tone([880, 660], 0.05, "sine", 0.04),
  level: () => tone([523, 659, 784, 1047, 1319, 1568], 0.06),
  click: () => tone([1200], 0.025, "square", 0.02),
};
