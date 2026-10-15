import { tuning } from '../config/tuning';
import { makeImpulse, SYNTH, type Synth } from './synth';

export type SfxName =
  | 'ui_hover'
  | 'ui_click'
  | 'ui_confirm'
  | 'ui_back'
  | 'ui_pause'
  | 'hit_soft'
  | 'hit_hard'
  | 'hit_perfect'
  | 'bounce_front'
  | 'bounce_side'
  | 'bounce_glass'
  | 'bounce_floor'
  | 'tin'
  | 'squeak'
  | 'step'
  | 'point_win'
  | 'point_lose'
  | 'game_win'
  | 'match_win'
  | 'match_lose'
  | 'combo_up';

/**
 * 사운드 뱅크 (M5): 파일 음원(Kenney CC0, public/sfx) + 분석 기반 합성 레이어 + 돔 체육관 잔향 센드.
 * file: 파일 음원 볼륨(0이면 파일 없음), layer: 겹칠 합성음 이름과 볼륨, wet: 잔향 센드, rate: 재생 속도(피치)
 * 파일을 못 불러오면 같은 이름의 합성음으로 대체한다 (CREDITS의 "임시 합성음").
 */
export type Eq = [BiquadFilterType, number, number, number?]; // 종류, 주파수, 게인(dB), Q
interface Patch {
  file: number;
  layer?: [string, number];
  wet: number;
  rate?: number;
  /** 파일 음원에 거는 EQ (실제 경기음 스펙트럼에 맞춤) */
  eq?: Eq[];
}
// 라켓 타격: 실제 타격음은 380Hz 대역이 가장 크고 60~150Hz는 -5dB, 2kHz 위는 빠르게 감소
// 고무공 피드백: 2.5kHz 위 날카로운 성분은 깎고, 아주 낮은 웅웅거림만 정리 (몸통 100~400Hz는 살림)
const DULL_EQ: Eq[] = [
  ['highpass', 450, 0, 0.7], // 원본의 웅웅거리는 저음 제거 (몸통은 합성 레이어가 담당)
  ['lowpass', 2400, 0, 0.7],
  ['highshelf', 1600, -3],
];
const BANK: Record<SfxName, Patch> = {
  hit_soft: { file: 0.12, layer: ['rubber_hit', 0.9], wet: 0.24, rate: 1.06, eq: DULL_EQ },
  hit_hard: { file: 0.14, layer: ['rubber_hit', 1.0], wet: 0.28, rate: 1.0, eq: DULL_EQ },
  hit_perfect: { file: 0.16, layer: ['rubber_hit_perfect', 0.95], wet: 0.32, rate: 0.96, eq: DULL_EQ },
  bounce_front: { file: 0.14, layer: ['rubber_wall', 1.0], wet: 0.32, rate: 1.0, eq: DULL_EQ },
  bounce_side: { file: 0.11, layer: ['rubber_wall', 0.75], wet: 0.3, rate: 1.05, eq: DULL_EQ },
  bounce_glass: { file: 0.05, layer: ['rubber_glass', 0.8], wet: 0.3, eq: DULL_EQ },
  bounce_floor: { file: 0.3, layer: ['rubber_floor', 0.95], wet: 0.25, rate: 1.0, eq: DULL_EQ },
  tin: { file: 1, layer: ['tin', 0.5], wet: 0.55 },
  squeak: { file: 0, wet: 0.4 },
  step: { file: 0.35, wet: 0.22 },
  ui_hover: { file: 0.5, wet: 0 },
  ui_click: { file: 0.8, wet: 0 },
  ui_confirm: { file: 0.8, wet: 0 },
  ui_back: { file: 0.8, wet: 0 },
  ui_pause: { file: 0.7, wet: 0 },
  point_win: { file: 0, wet: 0.25 },
  point_lose: { file: 0, wet: 0.25 },
  game_win: { file: 0, wet: 0.3 },
  match_win: { file: 0, wet: 0.3 },
  match_lose: { file: 0, wet: 0.3 },
  combo_up: { file: 0, wet: 0.2 },
};

/**
 * 소리 한 번을 내는 방법 (BANK 한 줄을 풀어 쓴 것). 사운드 비교 페이지(?sfxlab)가 예전 버전을 같은 경로로 재생할 때도 쓴다.
 * buf: 파일 음원 키, layer: 겹칠 합성음, fallback: 파일이 없을 때 대신 낼 합성음
 * eqBug: M5 시절 EQ 연결 버그 재현(EQ 첫 단만 거친 원음이 볼륨 무시하고 그대로 나감) — 비교용
 */
export interface Voice {
  buf?: string;
  file: number;
  eq?: Eq[];
  rate?: number;
  wet: number;
  layer?: Synth;
  layerVol?: number;
  fallback?: Synth;
  eqBug?: boolean;
}

/** EQ 체인을 만들어 첫 노드를 돌려준다 (src → eq... → tail) */
function applyEq(ctx: BaseAudioContext, eq: Eq[] | undefined, tail: AudioNode): AudioNode {
  let next: AudioNode = tail;
  for (const [type, f, gain, q] of [...(eq ?? [])].reverse()) {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.gain.value = gain;
    if (q !== undefined) b.Q.value = q;
    b.connect(next);
    next = b;
  }
  return next;
}

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let silentEl: HTMLAudioElement | null = null;

/** 1초짜리 무음 WAV (data URI) */
function silentWav(): string {
  const sr = 8000;
  const n = sr;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, str: string) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, 'data');
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128); // 8비트 무음
  let bin = '';
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/**
 * iOS는 무음(벨소리) 스위치가 켜져 있으면 웹 오디오(Web Audio)를 통째로 음소거한다.
 * - iOS 17+: navigator.audioSession.type = 'playback' 이면 무음 스위치와 무관하게 재생
 * - 그 이전: 사용자 탭 안에서 무음 <audio>를 반복 재생해 오디오 세션을 '재생' 모드로 바꿈
 */
function unmuteIosSilentSwitch(): void {
  if (!IS_IOS) return;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = 'playback';
      return;
    } catch {
      /* 아래 방법으로 */
    }
  }
  if (!silentEl) {
    silentEl = document.createElement('audio');
    silentEl.src = silentWav();
    silentEl.loop = true;
    silentEl.setAttribute('playsinline', '');
    silentEl.setAttribute('x-webkit-airplay', 'deny');
    silentEl.preload = 'auto';
    silentEl.style.display = 'none';
    document.body.appendChild(silentEl);
  }
  if (silentEl.paused) void silentEl.play().catch(() => {});
}

class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private wetOut: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer[]>();
  private lastVariant = new Map<string, number>();
  /** 사용자 설정 볼륨 0..1 */
  volume = 1;

  /** 브라우저 정책상 첫 사용자 입력 후에 호출 */
  /** 오디오를 못 쓰는 환경 (소리 없이 게임은 계속) */
  private broken = false;

  unlock(): void {
    if (this.broken) return;
    try {
      this.init();
    } catch (e) {
      this.broken = true;
      this.ctx = null;
      console.warn('오디오를 사용할 수 없어 소리 없이 진행합니다', e);
    }
  }

  private init(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) throw new Error('AudioContext 없음');
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      // 마스터 리미터 (잔향과 겹쳐도 찢어지지 않게). 꼭대기만 잡는다:
      // 예전 설정(기본 knee 30dB)은 -25dB부터 눌러서 세게 친 '팡'이 약한 공과 비슷한 크기로 뭉개졌음
      this.comp = this.ctx.createDynamicsCompressor();
      this.setLimiter('peak');
      this.out.connect(this.comp).connect(this.ctx.destination);
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = makeImpulse(this.ctx, tuning.audio.reverbSeconds);
      this.wetOut = this.ctx.createGain();
      this.reverb.connect(this.wetOut).connect(this.out);
      void this.loadAll();
    }
    // iOS: 'suspended'뿐 아니라 앱 전환·전화 후 'interrupted' 상태도 있음 → running이 아니면 사용자 탭 안에서 다시 시작
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    if (!this.primed) {
      // iOS 잠금 해제 관례: 사용자 탭 안에서 무음 버퍼를 한 번 재생해야 이후 소리가 남
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.connect(this.ctx.destination);
      src.start(0);
      this.primed = true;
    }
    unmuteIosSilentSwitch();
  }

  private primed = false;
  private comp: DynamicsCompressorNode | null = null;

  /** 마스터 리미터. 'soft' = 예전 설정(-10dB, 6:1, knee 30 → 큰 소리를 많이 누름), 사운드 비교용 */
  setLimiter(mode: 'peak' | 'soft'): void {
    if (this.comp) Sfx.limiterParams(this.comp, mode);
  }

  private static limiterParams(c: DynamicsCompressorNode, mode: 'peak' | 'soft'): void {
    if (mode === 'peak') {
      c.threshold.value = -3;
      c.knee.value = 2;
      c.ratio.value = 20;
      c.attack.value = 0.001;
      c.release.value = 0.12;
    } else {
      c.threshold.value = -10;
      c.knee.value = 30;
      c.ratio.value = 6;
      c.attack.value = 0.003;
      c.release.value = 0.25;
    }
  }

  /** 추가 음원 불러오기 (사운드 비교용). files = public/sfx/ 기준 경로(확장자 없이) */
  async loadExtra(key: string, files: string[]): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.buffers.has(key)) return;
    const base = `${import.meta.env.BASE_URL}sfx/`;
    const ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
    const bufs = await Promise.all(files.map(async (f) => ctx.decodeAudioData(await (await fetch(`${base}${f}.${ext}`)).arrayBuffer())));
    this.buffers.set(key, bufs);
  }

  /** BANK의 한 줄 = 게임에서 실제로 나는 방법 */
  bankVoice(name: SfxName): Voice {
    const b = BANK[name];
    return {
      buf: name,
      file: b.file,
      eq: b.eq,
      rate: b.rate,
      wet: b.wet,
      layer: b.layer ? SYNTH[b.layer[0]] : undefined,
      layerVol: b.layer?.[1],
      fallback: SYNTH[name],
    };
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx!;
    const base = `${import.meta.env.BASE_URL}sfx/`;
    const ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
    try {
      const manifest: Record<string, string[]> = await (await fetch(`${base}manifest.json`)).json();
      await Promise.all(
        Object.entries(manifest).map(async ([key, files]) => {
          const bufs = await Promise.all(
            files.map(async (f) => ctx.decodeAudioData(await (await fetch(`${base}${f}.${ext}`)).arrayBuffer())),
          );
          this.buffers.set(key, bufs);
        }),
      );
    } catch {
      /* 파일을 못 불러오면 합성음으로 동작 */
    }
  }

  /** k = 세기 0..1 (타구·충돌 속력). 세게 맞을수록 스냅이 커진다 */
  play(name: SfxName, vol = 1, pitch = 1, k = 0.6): void {
    try {
      this.playUnsafe(name, vol, pitch, k);
    } catch {
      /* 소리 하나 실패해도 게임은 계속 */
    }
  }

  private playUnsafe(name: SfxName, vol: number, pitch: number, k: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    if (ctx.state !== 'running') {
      void ctx.resume().catch(() => {});
      return;
    }
    this.wetOut!.gain.value = tuning.audio.reverb;
    this.playVoiceOn(ctx, this.out, this.reverb, this.bankVoice(name), vol * this.volume * tuning.audio.master, pitch, k);
  }

  /** 사운드 비교용: 임의의 Voice를 게임과 같은 경로(잔향·리미터 포함)로 재생 */
  playVoice(voice: Voice, vol: number, k: number, master = tuning.audio.master): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || ctx.state !== 'running') return;
    this.wetOut!.gain.value = tuning.audio.reverb;
    this.playVoiceOn(ctx, this.out, this.reverb, voice, vol * this.volume * master, 1, k);
  }

  /** 검증용: Voice 하나를 게임과 같은 체인(잔향·리미터 포함)으로 오프라인 렌더링. 피치 흔들림 없음 */
  async renderVoice(voice: Voice, vol: number, k: number, master: number, limiter: 'peak' | 'soft', seconds = 0.6): Promise<Float32Array> {
    // 브라우저 컴프레서는 만들어진 직후 수백 ms 동안 출력이 작게 나와서(게임에선 이미 돌고 있어 해당 없음) 0.5초 뒤에 재생하고 잘라낸다
    const lead = 0.5;
    const off = new OfflineAudioContext(1, Math.floor(44100 * (seconds + lead)), 44100);
    const ctx = off as unknown as AudioContext;
    const out = off.createGain();
    const comp = off.createDynamicsCompressor();
    Sfx.limiterParams(comp, limiter);
    out.connect(comp).connect(off.destination);
    const rev = off.createConvolver();
    rev.buffer = makeImpulse(ctx, tuning.audio.reverbSeconds);
    const wet = off.createGain();
    wet.gain.value = tuning.audio.reverb;
    rev.connect(wet).connect(out);
    this.playVoiceOn(ctx, out, rev, voice, vol * master, 1, k, 0, lead);
    return (await off.startRendering()).getChannelData(0).slice(Math.floor(44100 * (lead - 0.01)));
  }

  private playVoiceOn(
    ctx: AudioContext,
    out: AudioNode,
    reverb: AudioNode | null,
    voice: Voice,
    v: number,
    pitch: number,
    k: number,
    jitter = tuning.audio.pitchJitter,
    at = ctx.currentTime,
  ): void {
    if (v <= 0.001) return;
    const p = pitch * (1 + (Math.random() * 2 - 1) * jitter); // FX 장식이라 Math.random 허용
    const t = at;

    const node = ctx.createGain();
    node.connect(out);
    if (voice.wet > 0 && reverb) {
      const send = ctx.createGain();
      send.gain.value = voice.wet;
      node.connect(send).connect(reverb);
    }

    const key = voice.buf ?? '';
    const bufs = this.buffers.get(key);
    if (voice.file > 0 && bufs?.length) {
      // 같은 변형이 연속으로 나오지 않게
      let i = Math.floor(Math.random() * bufs.length);
      if (bufs.length > 1 && i === this.lastVariant.get(key)) i = (i + 1) % bufs.length;
      this.lastVariant.set(key, i);
      const src = ctx.createBufferSource();
      src.buffer = bufs[i];
      src.playbackRate.value = p * (voice.rate ?? 1);
      const g = ctx.createGain();
      g.gain.value = v * voice.file;
      if (voice.eqBug && voice.eq?.length) {
        const first = ctx.createBiquadFilter();
        const [type, f, gain, q] = voice.eq[0];
        first.type = type;
        first.frequency.value = f;
        first.gain.value = gain;
        if (q !== undefined) first.Q.value = q;
        src.connect(first).connect(node);
      } else {
        // 소스 → EQ 체인 → 볼륨(g) → 출력. (예전엔 EQ 첫 단을 출력에 바로 이어 볼륨·나머지 EQ가 빠지는 버그가 있었음)
        src.connect(applyEq(ctx, voice.eq, g));
        g.connect(node);
      }
      src.start(t);
      voice.layer?.(ctx, node, t, v * (voice.layerVol ?? 1), p, k);
    } else {
      // 파일이 없거나 아직 로딩 전: 합성음
      voice.fallback?.(ctx, node, t, v, p, k);
    }
  }

  /** 공 속도 → 볼륨 */
  speedVol(speed: number): number {
    return Math.min(1, 0.15 + speed / tuning.audio.speedForFullVolume);
  }

  /** 디버그: 잔향 길이 변경 */
  rebuildReverb(): void {
    if (this.ctx && this.reverb) this.reverb.buffer = makeImpulse(this.ctx, tuning.audio.reverbSeconds);
  }

  readonly names = Object.keys(BANK) as SfxName[];

  /** 검증용: 잔향 없이 소리 하나를 오프라인으로 렌더링 (모노 44.1kHz 샘플 배열) */
  async renderDry(name: SfxName, seconds = 0.5, parts: 'both' | 'file' | 'layer' = 'both', k = 0.6): Promise<Float32Array> {
    const off = new OfflineAudioContext(1, Math.floor(44100 * seconds), 44100);
    const patch = BANK[name];
    const bufs = this.buffers.get(name);
    const t = 0.01;
    if (patch.file > 0 && bufs?.length) {
      if (parts === 'layer') {
        if (patch.layer) SYNTH[patch.layer[0]]?.(off as unknown as AudioContext, off.destination, t, patch.layer[1], 1, k);
        return (await off.startRendering()).getChannelData(0);
      }
      const src = off.createBufferSource();
      src.buffer = bufs[0];
      src.playbackRate.value = patch.rate ?? 1;
      const g = off.createGain();
      g.gain.value = patch.file;
      src.connect(applyEq(off, patch.eq, g));
      g.connect(off.destination);
      src.start(t);
      if (patch.layer && parts === 'both') SYNTH[patch.layer[0]]?.(off as unknown as AudioContext, off.destination, t, patch.layer[1], 1, k);
    } else SYNTH[name]?.(off as unknown as AudioContext, off.destination, t, 1, 1, k);
    return (await off.startRendering()).getChannelData(0);
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  get loaded(): number {
    return this.buffers.size;
  }
}

export const sfx = new Sfx();

// 모든 "진짜 사용자 입력"(탭이 끝날 때·클릭·키) 안에서 오디오를 깨운다.
// iOS 사파리는 pointerdown/touchstart 안에서는 오디오 시작을 허용하지 않으므로 touchend/click이 꼭 필요.
for (const ev of ['touchend', 'click', 'keydown', 'pointerup'] as const) {
  window.addEventListener(ev, () => sfx.unlock(), { capture: true, passive: true });
}
// 다른 앱에 갔다 돌아오면 다음 탭에서 다시 깨우도록 (iOS 'interrupted')
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sfx.unlock();
});
