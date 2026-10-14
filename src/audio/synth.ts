// 임시 합성음 (WebAudio). M5에서 무료 음원으로 교체하고, 못 구한 소리는 이걸로 남긴다.
// 모든 함수: (ctx, 출력 노드, 시작 시각, 볼륨, 피치 배율)

type Synth = (ctx: AudioContext, out: AudioNode, t: number, vol: number, pitch: number) => void;

/**
 * 큰 돔 체육관 잔향 임펄스 (M5 피드백): 초기 반사 몇 개 + 긴 확산 꼬리(RT60 ≈ seconds).
 * 고음은 빨리, 저음은 오래 남도록 시간에 따라 저역통과를 점점 강하게 건다. 좌우 채널은 서로 다른 난수.
 */
export function makeImpulse(ctx: AudioContext, seconds = 2.8, preDelay = 0.03): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (seconds + preDelay));
  const buf = ctx.createBuffer(2, len, sr);
  const early = [
    [0.019, 0.55],
    [0.031, 0.42],
    [0.047, 0.38],
    [0.071, 0.3],
    [0.097, 0.24],
    [0.131, 0.18],
  ];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let seed = 777 + ch * 31;
    let lp = 0;
    const p0 = Math.floor(preDelay * sr);
    for (let i = p0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const t = (i - p0) / sr;
      const n = (seed / 0x7fffffff) * 2 - 1;
      // 진폭: RT60 = seconds → e^(-6.9 t / seconds), 시작은 살짝 페이드인(확산)
      const amp = Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.04);
      // 시간이 갈수록 어두워짐
      const k = 0.55 - 0.45 * Math.min(1, t / seconds);
      lp += k * (n - lp);
      d[i] = lp * amp * 0.5;
    }
    for (const [t, a] of early) {
      const i = Math.floor((t + (ch ? 0.004 : 0)) * sr);
      if (i < len) d[i] += a * (ch ? 0.9 : 1);
    }
  }
  return buf;
}

/** 감쇠 사인 모드 (모달 합성) */
function mode(ctx: AudioContext, out: AudioNode, t: number, vol: number, freq: number, decay: number) {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay * 4.6); // decay = 1/e 시간
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + decay * 4.6 + 0.02);
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
  // ── 파일 음원에 겹치는 레이어 (실제 스쿼시 영상 분석값 기반) ──
  // 라켓 타격 몸통: 470/355/97Hz 주성분 + 1kHz·1.5kHz 배음, -20dB까지 약 20ms
  body_racket: (c, o, t, v, p) => {
    for (const [f, a, d] of [
      [395, 1, 0.011],
      [468, 0.7, 0.01],
      [355, 0.5, 0.012],
      [97, 0.3, 0.014],
      [974, 0.25, 0.007],
      [1486, 0.2, 0.006],
    ]) {
      mode(c, o, t, v * a * 0.5, f * p, d);
    }
    noiseBurst(c, o, t, v * 0.18, 1500 * p, 0.8, 0.01);
  },
  // 벽: 실측 벽 공진(253·415·770·883·1023·1534Hz)이 고르게 울리는 넓은 대역 "탁" + 약한 저음 붐
  wall_boom: (c, o, t, v, p) => {
    for (const [f, a, d] of [
      [253, 1, 0.05],
      [415, 0.9, 0.045],
      [770, 0.8, 0.04],
      [883, 0.75, 0.036],
      [1023, 0.75, 0.032],
      [1534, 0.75, 0.026],
      [1857, 0.6, 0.022],
      [2331, 0.45, 0.018],
      [110, 0.35, 0.03],
    ]) {
      mode(c, o, t, v * a * 0.32, f * p, d);
    }
    noiseBurst(c, o, t, v * 0.5, 900 * p, 0.35, 0.035);
    hp(c, o, t, v * 0.35, 1500 * p, 0.03);
  },
  glass_thunk: (c, o, t, v, p) => {
    mode(c, o, t, v * 0.5, 180 * p, 0.02);
    mode(c, o, t, v * 0.2, 1150 * p, 0.03);
    mode(c, o, t, v * 0.1, 2600 * p, 0.025);
  },

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
  // 신발 스퀵: 고무 밑창 스틱-슬립. 1.6~3kHz에서 빠르게 떨리며 끝이 살짝 올라감
  squeak: (c, o, t, v, p) => {
    const dur = 0.09 + Math.random() * 0.08;
    const base = (1700 + Math.random() * 700) * p;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * 1.25, t + dur * 0.7);
    osc.frequency.linearRampToValueAtTime(base * 1.1, t + dur);
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 55 + Math.random() * 40;
    const lg = c.createGain();
    lg.gain.value = base * 0.08;
    lfo.connect(lg).connect(osc.frequency);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = base * 1.1;
    f1.Q.value = 3;
    const f2 = c.createBiquadFilter();
    f2.type = 'peaking';
    f2.frequency.value = base * 2.1;
    f2.gain.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v * 0.22, t + 0.012);
    g.gain.setValueAtTime(v * 0.22, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f1).connect(f2).connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
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
