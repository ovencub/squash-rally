import { tuning } from '../config/tuning';

/**
 * 고정 타임스텝 누적 루프. 시뮬레이션은 step(dt) 안에서만 진행된다.
 * - timeScale: 슬로모 (판정 연출, 디버그)
 * - hitstop(ms): 실시간 기준으로 시뮬레이션을 잠깐 멈춤
 */
export class FixedLoop {
  timeScale = 1;
  private acc = 0;
  private hitstopLeft = 0;

  constructor(private step: (dt: number) => void) {}

  hitstop(ms: number): void {
    this.hitstopLeft = Math.max(this.hitstopLeft, ms / 1000);
  }

  /** 렌더 프레임마다 호출. 실제 경과 시간(초)을 넘긴다. */
  advance(realDt: number): void {
    if (this.hitstopLeft > 0) {
      this.hitstopLeft -= realDt;
      return;
    }
    const dt = 1 / tuning.physics.substepHz;
    this.acc += realDt * this.timeScale;
    let n = 0;
    while (this.acc >= dt && n < tuning.physics.maxSubstepsPerFrame) {
      this.step(dt);
      this.acc -= dt;
      n++;
    }
    if (n === tuning.physics.maxSubstepsPerFrame) this.acc = 0; // 탭 전환 등으로 밀린 시간은 버림
  }

  /** 히트스톱으로 멈춰 있는 중 */
  get inHitstop(): boolean {
    return this.hitstopLeft > 0;
  }

  /** 렌더 보간용 (0..1) */
  get alpha(): number {
    return this.acc * tuning.physics.substepHz;
  }
}
