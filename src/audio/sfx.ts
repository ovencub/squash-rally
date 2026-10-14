import { tuning } from '../config/tuning';
import { SYNTH } from './synth';

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
 * 효과음 재생기. 파일 음원(M5)이 등록돼 있으면 그걸, 없으면 합성음을 쓴다.
 * 재생 시 피치 ±pitchJitter 랜덤, 볼륨은 호출자가 공 속도 등으로 조절.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  /** 사용자 설정 볼륨 0..1 */
  volume = 1;

  /** 브라우저 정책상 첫 사용자 입력 후에 호출 */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
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
    SYNTH[name]?.(ctx, this.out, ctx.currentTime, v, p);
  }

  /** 공 속도 → 볼륨 */
  speedVol(speed: number): number {
    return Math.min(1, 0.15 + speed / tuning.audio.speedForFullVolume);
  }
}

export const sfx = new Sfx();
