// 임시 합성음 (WebAudio). M5에서 무료 음원으로 교체하고, 못 구한 소리는 이걸로 남긴다.
// 모든 함수: (ctx, 출력 노드, 시작 시각, 볼륨, 피치 배율)

/** k = 세기 0..1 (타구 속력·충돌 속력). 세게 맞을수록 '팡' 스냅이 커지고 짧고 단단해진다 */
export type Synth = (ctx: AudioContext, out: AudioNode, t: number, vol: number, pitch: number, k: number) => void;

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

/**
 * 스냅: 테니스공을 세게 칠 때 나는 '팡!' — 고무가 순간적으로 찌그러졌다 튀는 크고 짧은 터짐.
 * 700Hz 아래는 걷어내(몸통은 다른 레이어 담당) 중고음 '팡'만 남기고, 5.5kHz 위는 깎아 쇳소리 없이.
 * dur = 음량이 -80dB까지 떨어지는 시간 (실제로 들리는 길이는 그 1/4 정도).
 */
export function snap(ctx: AudioContext, out: AudioNode, t: number, vol: number, center: number, dur: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 700;
  hpf.Q.value = 0.7;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = center;
  bp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5500;
  src.connect(hpf).connect(bp).connect(lp).connect(env(ctx, out, t, vol, 0.0004, dur));
  src.start(t);
  src.stop(t + dur + 0.03);
}

/**
 * 팝: 속 빈 고무공이 찌그러졌다 튀며 울리는 '팡' — 공진(Q 높은 대역) 노이즈라 '쉬익'이 아니라 음색 있는 터짐.
 * 테니스공 타구음의 몸통. 크게 들리도록 수십 ms 에너지를 가진다 (dur = -80dB까지 시간).
 */
export function pop(ctx: AudioContext, out: AudioNode, t: number, vol: number, center: number, q: number, dur: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 450;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = center;
  bp.Q.value = q;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5000;
  src.connect(hpf).connect(bp).connect(lp).connect(env(ctx, out, t, vol, 0.0005, dur));
  src.start(t);
  src.stop(t + dur + 0.03);
}

/** 세기 곡선: 약한 공은 거의 몸통만, 셀수록 팝·크랙이 급격히 커진다 (0.15 → 0.15, 0.5 → 0.42, 1 → 1) */
const popAmt = (k: number) => 0.1 + 0.9 * Math.pow(Math.max(0, Math.min(1, k)), 1.5);

/** 감쇠 사인 모드 + 피치 하강 (고무가 눌렸다 펴지며 음이 살짝 내려감) */
export function modeDrop(ctx: AudioContext, out: AudioNode, t: number, vol: number, f0: number, f1: number, decay: number, attack = 0.002) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + decay * 2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay * 4.6);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay * 4.6 + 0.02);
}

/** 대역 노이즈 '퍽' (어택을 살짝 둥글게 → 날카로운 딸깍이 아니라 고무가 눌리는 소리) */
export function thud(ctx: AudioContext, out: AudioNode, t: number, vol: number, freq: number, q: number, decay: number, attack = 0.0025) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(2400, freq * 3);
  src.connect(f).connect(lp).connect(env(ctx, out, t, vol, attack, decay));
  src.start(t);
  src.stop(t + attack + decay + 0.05);
}

/** 감쇠 사인 모드 (모달 합성) */
export function mode(ctx: AudioContext, out: AudioNode, t: number, vol: number, freq: number, decay: number) {
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

export function noiseBurst(ctx: AudioContext, out: AudioNode, t: number, vol: number, freq: number, q: number, decay: number) {
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
export function hp(ctx: AudioContext, out: AudioNode, t: number, vol: number, freq: number, decay: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = freq;
  src.connect(f).connect(env(ctx, out, t, vol, 0.0008, decay));
  src.start(t);
  src.stop(t + decay + 0.03);
}

export function tone(ctx: AudioContext, out: AudioNode, t: number, vol: number, f0: number, f1: number, decay: number, type: OscillatorType = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + decay);
  o.connect(env(ctx, out, t, vol, 0.003, decay));
  o.start(t);
  o.stop(t + decay + 0.05);
}

export const SYNTH: Record<string, Synth> = {
  // ── 고무공 레이어 (피드백: 고무공을 세게 때리는 둔탁하고 묵직한 소리) ──
  // 낮은 '쿵' + 속 빈 고무공 공진(피치가 살짝 떨어짐) + 중음 '퍽'. 2.5kHz 위 날카로운 성분은 거의 없음.
  // 라켓: 세기 k(타구 속력)에 따라 — 약하면 고무 '톡', 세면 테니스처럼 '팡!' (스냅이 커지고 짧아짐)
  // 라켓: 세기 k(타구 속력)에 따라 — 약하면 고무 '퍽', 세면 테니스처럼 크게 '팡!' (팝 + 크랙이 커짐)
  rubber_hit: (c, o, t, v, p, k) => {
    const a = popAmt(k);
    pop(c, o, t, v * 2.6 * a, (950 + 450 * k) * p, 1.5, 0.05);
    snap(c, o, t, v * 1.3 * a, (1400 + 700 * k) * p, 0.016);
    modeDrop(c, o, t, v * 0.06, 155 * p, 95 * p, 0.028, 0.0015); // 낮은 '쿵'
    modeDrop(c, o, t, v * 0.08, 380 * p, 290 * p, 0.02, 0.0015); // 속 빈 고무공 몸통
    modeDrop(c, o, t, v * 0.12, 640 * p, 520 * p, 0.016, 0.0015); // 고무 공진
    thud(c, o, t, v * (0.7 - 0.25 * k), 950 * p, 0.85, 0.06, 0.0016); // 중음 '퍽' (약할수록 이게 주인공)
    mode(c, o, t, v * 0.06, 1300 * p, 0.007); // 줄 소리 아주 살짝
  },
  rubber_hit_perfect: (c, o, t, v, p, k) => {
    const a = popAmt(k);
    pop(c, o, t, v * 3.0 * a, (1000 + 450 * k) * p, 1.5, 0.055);
    snap(c, o, t, v * 1.5 * a, (1500 + 800 * k) * p, 0.018);
    snap(c, o, t + 0.0015, v * 0.5 * a, 3000 * p, 0.01); // 겹 스냅: 더 '쩍'
    modeDrop(c, o, t, v * 0.08, 140 * p, 85 * p, 0.034, 0.0015);
    modeDrop(c, o, t, v * 0.09, 360 * p, 270 * p, 0.024, 0.0015);
    modeDrop(c, o, t, v * 0.13, 620 * p, 500 * p, 0.018, 0.0015);
    thud(c, o, t, v * (0.7 - 0.25 * k), 900 * p, 0.8, 0.07, 0.0016);
    mode(c, o, t, v * 0.07, 1250 * p, 0.008);
  },
  // 벽(시멘트·석고): 충돌 속력 k에 따라 — 약하면 '툭', 세면 '팡!' + 벽이 울리는 낮은 붐
  rubber_wall: (c, o, t, v, p, k) => {
    const a = popAmt(k);
    pop(c, o, t, v * 2.6 * a, (850 + 400 * k) * p, 1.4, 0.055);
    snap(c, o, t, v * 1.1 * a, (1300 + 700 * k) * p, 0.016);
    modeDrop(c, o, t, v * 0.025, 125 * p, 80 * p, 0.035, 0.002);
    modeDrop(c, o, t, v * 0.05, 300 * p, 240 * p, 0.026, 0.002);
    thud(c, o, t, v * (0.7 - 0.25 * k), 720 * p, 0.8, 0.07, 0.0022);
    mode(c, o, t, v * (0.01 + 0.015 * k), 70 * p, 0.06); // 벽 전체가 울리는 낮은 붐 (셀수록 큼)
  },
  // 마룻바닥: 약하면 짧고 낮은 '텁', 세게 떨어지면 '탁!'
  rubber_floor: (c, o, t, v, p, k) => {
    const a = popAmt(k);
    pop(c, o, t, v * 2.2 * a, (750 + 400 * k) * p, 1.3, 0.04);
    snap(c, o, t, v * 1.0 * a, (1200 + 600 * k) * p, 0.012);
    modeDrop(c, o, t, v * 0.08, 115 * p, 75 * p, 0.025, 0.002);
    thud(c, o, t, v * (0.7 - 0.25 * k), 450 * p, 1.0, 0.05, 0.002);
    mode(c, o, t, v * 0.12, 560 * p, 0.012); // 나무 노크 살짝
  },
  // 유리 뒷벽: 둔탁한 '텅' + 유리 울림 아주 약하게
  rubber_glass: (c, o, t, v, p, k) => {
    const a = popAmt(k);
    pop(c, o, t, v * 2.0 * a, (800 + 400 * k) * p, 1.4, 0.05);
    snap(c, o, t, v * 0.8 * a, (1200 + 500 * k) * p, 0.014);
    modeDrop(c, o, t, v * 0.18, 150 * p, 105 * p, 0.03, 0.002);
    thud(c, o, t, v * 0.6, 460 * p, 0.9, 0.07, 0.002);
    mode(c, o, t, v * (0.03 + 0.05 * k), 1150 * p, 0.04);
    mode(c, o, t, v * 0.015, 2600 * p, 0.03);
  },
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
