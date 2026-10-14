import { tuning } from '../config/tuning';
import { makeImpulse, SYNTH } from './synth';

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
type Eq = [BiquadFilterType, number, number, number?]; // 종류, 주파수, 게인(dB), Q
interface Patch {
  file: number;
  layer?: [string, number];
  wet: number;
  rate?: number;
  /** 파일 음원에 거는 EQ (실제 경기음 스펙트럼에 맞춤) */
  eq?: Eq[];
}
// 라켓 타격: 실제 타격음은 380Hz 대역이 가장 크고 60~150Hz는 -5dB, 2kHz 위는 빠르게 감소
const RACKET_EQ: Eq[] = [
  ['highpass', 110, 0, 0.9],
  ['highpass', 110, 0, 0.9],
  ['peaking', 400, 7, 1.1],
  ['peaking', 150, -7, 1.4],
  ['peaking', 240, -4, 1.5],
  ['highshelf', 3000, -6],
];
const BANK: Record<SfxName, Patch> = {
  hit_soft: { file: 0.85, layer: ['body_racket', 0.6], wet: 0.35, rate: 1.05, eq: RACKET_EQ },
  hit_hard: { file: 1, layer: ['body_racket', 0.75], wet: 0.42, rate: 0.97, eq: RACKET_EQ },
  hit_perfect: { file: 1, layer: ['body_racket', 0.95], wet: 0.5, rate: 0.93, eq: RACKET_EQ },
  bounce_front: { file: 0.35, layer: ['wall_boom', 1.0], wet: 0.45, rate: 0.9, eq: [['highpass', 200, 0, 0.7]] },
  bounce_side: { file: 0.3, layer: ['wall_boom', 0.6], wet: 0.4, rate: 0.95, eq: [['highpass', 200, 0, 0.7]] },
  bounce_glass: { file: 0.35, layer: ['glass_thunk', 0.9], wet: 0.4 },
  bounce_floor: { file: 0.7, wet: 0.3, rate: 1.1 },
  tin: { file: 1, layer: ['tin', 0.5], wet: 0.55 },
  squeak: { file: 0, wet: 0.4 },
  step: { file: 0.5, wet: 0.22 },
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
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      // 마스터 리미터 (잔향과 겹쳐도 찢어지지 않게)
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      this.out.connect(comp).connect(this.ctx.destination);
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = makeImpulse(this.ctx, tuning.audio.reverbSeconds);
      this.wetOut = this.ctx.createGain();
      this.reverb.connect(this.wetOut).connect(this.out);
      void this.loadAll();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
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

  play(name: SfxName, vol = 1, pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || ctx.state !== 'running') return;
    const v = vol * this.volume * tuning.audio.master;
    if (v <= 0.001) return;
    const patch = BANK[name];
    const j = tuning.audio.pitchJitter;
    const p = pitch * (1 + (Math.random() * 2 - 1) * j); // FX 장식이라 Math.random 허용
    const t = ctx.currentTime;

    const node = ctx.createGain();
    node.connect(this.out);
    if (patch.wet > 0 && this.reverb) {
      const send = ctx.createGain();
      send.gain.value = patch.wet;
      node.connect(send).connect(this.reverb);
    }
    this.wetOut!.gain.value = tuning.audio.reverb;

    const bufs = this.buffers.get(name);
    if (patch.file > 0 && bufs?.length) {
      // 같은 변형이 연속으로 나오지 않게
      let i = Math.floor(Math.random() * bufs.length);
      if (bufs.length > 1 && i === this.lastVariant.get(name)) i = (i + 1) % bufs.length;
      this.lastVariant.set(name, i);
      const src = ctx.createBufferSource();
      src.buffer = bufs[i];
      src.playbackRate.value = p * (patch.rate ?? 1);
      const g = ctx.createGain();
      g.gain.value = v * patch.file;
      src.connect(applyEq(ctx, patch.eq, g)).connect(node);
      src.start(t);
      if (patch.layer) SYNTH[patch.layer[0]]?.(ctx, node, t, v * patch.layer[1], p);
    } else {
      // 파일이 없거나 아직 로딩 전: 합성음
      SYNTH[name]?.(ctx, node, t, v, p);
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
  async renderDry(name: SfxName, seconds = 0.5): Promise<Float32Array> {
    const off = new OfflineAudioContext(1, Math.floor(44100 * seconds), 44100);
    const patch = BANK[name];
    const bufs = this.buffers.get(name);
    const t = 0.01;
    if (patch.file > 0 && bufs?.length) {
      const src = off.createBufferSource();
      src.buffer = bufs[0];
      src.playbackRate.value = patch.rate ?? 1;
      const g = off.createGain();
      g.gain.value = patch.file;
      src.connect(applyEq(off, patch.eq, g)).connect(off.destination);
      src.start(t);
      if (patch.layer) SYNTH[patch.layer[0]]?.(off as unknown as AudioContext, off.destination, t, patch.layer[1], 1);
    } else SYNTH[name]?.(off as unknown as AudioContext, off.destination, t, 1, 1);
    return (await off.startRendering()).getChannelData(0);
  }

  get loaded(): number {
    return this.buffers.size;
  }
}

export const sfx = new Sfx();
