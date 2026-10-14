import { tuning } from '../config/tuning';

// 마우스 제스처 → 스윙. 순수 로직 (DOM 의존 없음, 테스트 대상).
// M1 피드백으로 샷은 드라이브 하나: "↓당겼다 ↑밀기" = 풀 스윙, 짧게 클릭 = 가볍게.
// 좌표: 화면 높이로 정규화, y는 아래가 + (브라우저 좌표 그대로).

export interface SwingInput {
  /** 0..1 스트로크 속도 기반 파워 */
  power: number;
  /** -1..1 스트로크 좌우 기울기 (+ = 오른쪽) */
  aim: number;
  kind: 'stroke' | 'tap';
  /** 입력 시각(ms) */
  time: number;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

export class GestureTracker {
  private samples: Sample[] = [];
  private downAt: Sample | null = null;
  private fired = false;
  private maxDist = 0;

  down(t: number, x: number, y: number): void {
    this.downAt = { t, x, y };
    this.samples = [{ t, x, y }];
    this.fired = false;
    this.maxDist = 0;
  }

  /** 누른 채 움직임. 위로 미는 스트로크가 완성되면 즉시 스윙을 돌려준다 (손을 떼기 전에도 반응). */
  move(t: number, x: number, y: number): SwingInput | null {
    if (!this.downAt) return null;
    this.samples.push({ t, x, y });
    this.maxDist = Math.max(this.maxDist, Math.hypot(x - this.downAt.x, y - this.downAt.y));
    const I = tuning.input;
    // 오래된 샘플 정리
    while (this.samples.length > 2 && t - this.samples[0].t > I.strokeWindowMs) this.samples.shift();
    if (this.fired) {
      // 다시 아래로 당기면 다음 스윙 준비
      const first = this.samples[0];
      if (this.dir() * (y - first.y) > I.strokeMinDist * 0.6) this.fired = false;
      return null;
    }
    // 창 안에서 가장 많이 당긴 지점(와인드업)부터 현재까지의 스트로크
    let first = this.samples[0];
    for (const s of this.samples) if (this.dir() * (s.y - first.y) > 0) first = s;
    const dy = this.dir() * (first.y - y); // + = 스윙 방향(기본 위)
    if (dy < I.strokeMinDist) return null;
    const dt = Math.max(1, t - first.t) / 1000;
    const dx = x - first.x;
    this.fired = true;
    return {
      power: Math.min(1, dy / dt / I.maxStrokeSpeed),
      aim: Math.max(-1, Math.min(1, dx / dy)),
      kind: 'stroke',
      time: t,
    };
  }

  /** 손을 뗌. 짧은 클릭이면 가벼운 스윙. */
  up(t: number, x: number, y: number): SwingInput | null {
    const d = this.downAt;
    this.downAt = null;
    if (!d || this.fired) return null;
    const I = tuning.input;
    const dist = Math.max(this.maxDist, Math.hypot(x - d.x, y - d.y));
    if (t - d.t <= I.tapMaxMs && dist <= I.tapMaxDist) {
      return { power: I.tapPower, aim: 0, kind: 'tap', time: t };
    }
    return null;
  }

  private dir(): number {
    return tuning.input.invertStroke ? -1 : 1;
  }
}
