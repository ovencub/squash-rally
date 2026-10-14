// 임시 합성음 (WebAudio). M5에서 무료 음원으로 교체하고, 못 구한 소리는 이걸로 남긴다.
// 모든 함수: (ctx, 출력 노드, 시작 시각, 볼륨, 피치 배율)

type Synth = (ctx: AudioContext, out: AudioNode, t: number, vol: number, pitch: number) => void;

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate * 0.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return noiseBuf;
}

function env(ctx: AudioContext, out: AudioNode, t: number, vol: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function noiseBurst(ctx: AudioContext, out: AudioNode, t: number, vol: number, freq: number, q: number, decay: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(env(ctx, out, t, vol, 0.002, decay));
  src.start(t);
  src.stop(t + decay + 0.05);
}

function tone(ctx: AudioContext, out: AudioNode, t: number, vol: number, f0: number, f1: number, decay: number, type: OscillatorType = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + decay);
  o.connect(env(ctx, out, t, vol, 0.003, decay));
  o.start(t);
  o.stop(t + decay + 0.05);
}

export const SYNTH: Record<string, Synth> = {
  // 라켓 타격: 건조한 "딱" (노이즈 클릭 + 짧은 저음)
  hit_soft: (c, o, t, v, p) => {
    noiseBurst(c, o, t, v * 0.8, 2400 * p, 1.2, 0.05);
    tone(c, o, t, v * 0.5, 320 * p, 120, 0.06);
  },
  hit_hard: (c, o, t, v, p) => {
    noiseBurst(c, o, t, v, 1900 * p, 0.9, 0.07);
    tone(c, o, t, v * 0.8, 260 * p, 70, 0.09, 'triangle');
  },
  hit_perfect: (c, o, t, v, p) => {
    noiseBurst(c, o, t, v, 2600 * p, 0.8, 0.08);
    tone(c, o, t, v * 0.9, 300 * p, 60, 0.12, 'triangle');
    tone(c, o, t + 0.01, v * 0.35, 1800 * p, 2400 * p, 0.12, 'sine');
  },
  // 공 바운드
  bounce_front: (c, o, t, v, p) => {
    noiseBurst(c, o, t, v * 0.9, 900 * p, 1.5, 0.06);
    tone(c, o, t, v * 0.6, 180 * p, 90, 0.07);
  },
  bounce_side: (c, o, t, v, p) => {
    noiseBurst(c, o, t, v * 0.7, 1100 * p, 1.5, 0.05);
    tone(c, o, t, v * 0.4, 200 * p, 100, 0.06);
  },
  bounce_glass: (c, o, t, v, p) => {
    noiseBurst(c, o, t, v * 0.6, 3200 * p, 2, 0.05);
    tone(c, o, t, v * 0.35, 900 * p, 700, 0.12);
  },
  bounce_floor: (c, o, t, v, p) => {
    noiseBurst(c, o, t, v * 0.6, 600 * p, 1.2, 0.05);
    tone(c, o, t, v * 0.5, 140 * p, 70, 0.06);
  },
  // 틴: 금속 "땡" (비조화 배음)
  tin: (c, o, t, v, p) => {
    for (const [f, a] of [
      [523, 1],
      [1371, 0.6],
      [2210, 0.4],
      [3170, 0.25],
    ]) {
      tone(c, o, t, v * 0.35 * a, f * p, f * p * 0.995, 0.6, 'sine');
    }
    noiseBurst(c, o, t, v * 0.5, 4000, 1, 0.03);
  },
  // 신발 스퀵: 빠르게 떨리는 고음
  squeak: (c, o, t, v, p) => {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2300 * p, t);
    osc.frequency.linearRampToValueAtTime(2900 * p, t + 0.05);
    osc.frequency.linearRampToValueAtTime(2500 * p, t + 0.11);
    const lfo = c.createOscillator();
    lfo.frequency.value = 70;
    const lg = c.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(osc.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2600 * p;
    f.Q.value = 4;
    osc.connect(f).connect(env(c, o, t, v * 0.18, 0.01, 0.12));
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.16);
    lfo.stop(t + 0.16);
  },
  step: (c, o, t, v, p) => noiseBurst(c, o, t, v * 0.25, 400 * p, 1, 0.03),
  // UI
  ui_hover: (c, o, t, v, p) => tone(c, o, t, v * 0.12, 1400 * p, 1500 * p, 0.04),
  ui_click: (c, o, t, v, p) => tone(c, o, t, v * 0.3, 900 * p, 600 * p, 0.06, 'triangle'),
  ui_confirm: (c, o, t, v, p) => {
    tone(c, o, t, v * 0.3, 660 * p, 660 * p, 0.08, 'triangle');
    tone(c, o, t + 0.07, v * 0.3, 990 * p, 990 * p, 0.12, 'triangle');
  },
  ui_back: (c, o, t, v, p) => tone(c, o, t, v * 0.3, 700 * p, 400 * p, 0.09, 'triangle'),
  ui_pause: (c, o, t, v, p) => tone(c, o, t, v * 0.25, 500 * p, 500 * p, 0.1, 'square'),
  // 결과 징글
  point_win: (c, o, t, v) => [784, 988, 1175].forEach((f, i) => tone(c, o, t + i * 0.07, v * 0.25, f, f, 0.14, 'triangle')),
  point_lose: (c, o, t, v) => [392, 330].forEach((f, i) => tone(c, o, t + i * 0.1, v * 0.25, f, f * 0.98, 0.18, 'triangle')),
  game_win: (c, o, t, v) => [523, 659, 784, 1047].forEach((f, i) => tone(c, o, t + i * 0.09, v * 0.25, f, f, 0.2, 'triangle')),
  match_win: (c, o, t, v) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, o, t + i * 0.1, v * 0.28, f, f, 0.3, 'triangle')),
  match_lose: (c, o, t, v) => [523, 466, 392, 330].forEach((f, i) => tone(c, o, t + i * 0.13, v * 0.25, f, f * 0.97, 0.25, 'triangle')),
  combo_up: (c, o, t, v, p) => tone(c, o, t, v * 0.15, 1200 * p, 1600 * p, 0.08, 'sine'),
};
