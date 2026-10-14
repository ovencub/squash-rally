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

/** 리버브 센드 양 */
const WET: Partial<Record<SfxName, number>> = {
  hit_soft: 0.18,
  hit_hard: 0.25,
  hit_perfect: 0.35,
  bounce_front: 0.2,
  bounce_side: 0.15,
  bounce_glass: 0.2,
  bounce_floor: 0.1,
  tin: 0.3,
};

/**
 * 효과음 재생기. 파일 음원(M5)이 등록돼 있으면 그걸, 없으면 합성음을 쓴다.
 * 재생 시 피치 ±pitchJitter 랜덤, 볼륨은 호출자가 공 속도 등으로 조절.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  /** 사용자 설정 볼륨 0..1 */
  volume = 1;

  /** 브라우저 정책상 첫 사용자 입력 후에 호출 */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
      // 코트 울림: 타격·바운드에만 살짝
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = makeImpulse(this.ctx);
      this.reverb.connect(this.out);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(name: SfxName, vol = 1, pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || ctx.state !== 'running') return;
    const v = vol * this.volume * tuning.audio.master;
    if (v <= 0.001) return;
    const j = tuning.audio.pitchJitter;
    const p = pitch * (1 + (Math.random() * 2 - 1) * j); // FX 장식이라 Math.random 허용
    const node = ctx.createGain();
    node.connect(this.out);
    const wet = WET[name] ?? 0;
    if (wet > 0 && this.reverb) {
      const send = ctx.createGain();
      send.gain.value = wet;
      node.connect(send).connect(this.reverb);
    }
    SYNTH[name]?.(ctx, node, ctx.currentTime, v, p);
  }

  /** 공 속도 → 볼륨 */
  speedVol(speed: number): number {
    return Math.min(1, 0.15 + speed / tuning.audio.speedForFullVolume);
  }
}

export const sfx = new Sfx();
