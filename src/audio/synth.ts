// 임시 합성음 (WebAudio). M5에서 무료 음원으로 교체하고, 못 구한 소리는 이걸로 남긴다.
// 모든 함수: (ctx, 출력 노드, 시작 시각, 볼륨, 피치 배율)

type Synth = (ctx: AudioContext, out: AudioNode, t: number, vol: number, pitch: number) => void;

/** 코트 울림용 짧은 리버브 임펄스 (스테레오 감쇠 노이즈) */
export function makeImpulse(ctx: AudioContext, seconds = 0.9, decay = 3.2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let seed = 777 + ch * 31;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

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

/** 하이패스 노이즈 클릭 (밝은 트랜지언트) */
function hp(ctx: AudioContext, out: AudioNode, t: number, vol: number, freq: number, decay: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = freq;
  src.connect(f).connect(env(ctx, out, t, vol, 0.0008, decay));
  src.start(t);
  src.stop(t + decay + 0.03);
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
  // 라켓 타격 (M3 피드백: 더 경쾌하고 시원하게): 고음 "탁" 트랜지언트 + 공이 눌리는 "퐁" 피치 드롭 + 짧은 몸통
  hit_soft: (c, o, t, v, p) => {
    hp(c, o, t, v * 0.7, 4200 * p, 0.018);
    tone(c, o, t, v * 0.6, 1100 * p, 420 * p, 0.04, 'sine');
    tone(c, o, t, v * 0.35, 230 * p, 120, 0.05, 'triangle');
  },
  hit_hard: (c, o, t, v, p) => {
    hp(c, o, t, v * 0.95, 3600 * p, 0.022);
    noiseBurst(c, o, t, v * 0.6, 2200 * p, 1.4, 0.035);
    tone(c, o, t, v * 0.75, 1350 * p, 380 * p, 0.045, 'sine');
    tone(c, o, t, v * 0.6, 180 * p, 75, 0.07, 'triangle');
  },
  hit_perfect: (c, o, t, v, p) => {
    hp(c, o, t, v, 3000 * p, 0.03);
    noiseBurst(c, o, t, v * 0.75, 2600 * p, 1.1, 0.045);
    tone(c, o, t, v * 0.85, 1600 * p, 420 * p, 0.05, 'sine');
    tone(c, o, t, v * 0.75, 160 * p, 55, 0.1, 'triangle');
    // 반짝이는 꼬리
    tone(c, o, t + 0.012, v * 0.22, 2400 * p, 3200 * p, 0.16, 'sine');
    tone(c, o, t + 0.03, v * 0.14, 3600 * p, 4200 * p, 0.14, 'sine');
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
