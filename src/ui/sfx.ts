let ctx: AudioContext | null = null;
let volume = 0.5;

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', delay = 0, gain = 0.15): void {
  if (volume <= 0) return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain * volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch {
    /* 音が出せない環境では無視 */
  }
}

export const sfx = {
  click: () => tone(660, 0.05),
  hit: () => (tone(180, 0.12, 'sawtooth'), tone(120, 0.1, 'square', 0.04)),
  heal: () => (tone(660, 0.1, 'sine'), tone(880, 0.14, 'sine', 0.08)),
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', i * 0.1)),
  win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', i * 0.12)),
  lose: () => [330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', i * 0.2)),
  chest: () => [880, 1175].forEach((f, i) => tone(f, 0.1, 'triangle', i * 0.08)),
  step: () => tone(120, 0.02, 'square', 0, 0.04),
  encounter: () => [200, 160, 240, 190].forEach((f, i) => tone(f, 0.08, 'sawtooth', i * 0.06)),
};
