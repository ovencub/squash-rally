import { buildCourt, type CourtDims } from '../config/court';
import { type Difficulty } from '../config/tuning';
import { EventBus } from '../core/events';
import { createBall, stepBall, type BallContact, type BallState, type Vec3 } from '../physics/ball';
import { applyContact, applyHit, feedRally, newRally, type PlayerId, type RallyResult, type RallyState, type ServeSide } from '../rules/rally';

export interface WorldEvents extends Record<string, unknown> {
  contact: BallContact;
  launch: { from: Vec3; vel: Vec3; hitter: PlayerId; serve: boolean };
  feed: { from: Vec3; vel: Vec3 };
  rallyEnd: RallyResult;
}

/** 시뮬레이션 상태(코트·공·랠리). 렌더와 무관하며 FixedLoop의 step에서만 진행된다. */
export class World {
  court: CourtDims;
  ball: BallState | null = null;
  rally: RallyState;
  readonly bus = new EventBus<WorldEvents>();

  constructor(
    difficulty: Difficulty,
    private players: 1 | 2 = 1,
  ) {
    this.court = buildCourt(difficulty);
    this.rally = newRally(players);
  }

  setDifficulty(d: Difficulty): void {
    this.court = buildCourt(d);
    this.ball = null;
    this.rally = newRally(this.players);
  }

  /** 공을 새로 쏘거나(서브/디버그) 현재 공을 친다 */
  launch(from: Vec3, vel: Vec3, hitter: PlayerId, serve: boolean, serveSide: ServeSide = this.rally.serveSide): void {
    if (serve || this.rally.phase === 'over' || !this.ball) {
      this.rally = newRally(this.players, hitter, serveSide);
    }
    this.ball = this.newBall(from, vel);
    this.rally = applyHit(this.rally, hitter, serve);
    this.bus.emit('launch', { from, vel, hitter, serve });
  }

  /** 앞벽 쪽에서 receiver에게 공을 보내 랠리 시작 (1인 모드 피드) */
  feed(from: Vec3, vel: Vec3, receiver: PlayerId): void {
    this.ball = this.newBall(from, vel);
    this.rally = feedRally(this.players, receiver);
    this.bus.emit('feed', { from, vel });
  }

  /** 시뮬레이션 시각은 공이 바뀌어도 이어진다 (타이밍 계산용) */
  private newBall(from: Vec3, vel: Vec3): BallState {
    const b = createBall(from, vel);
    b.time = this.ball?.time ?? 0;
    return b;
  }

  clearBall(): void {
    this.ball = null;
  }

  step(dt: number): void {
    const b = this.ball;
    if (!b) return;
    stepBall(b, dt, this.court, (ct) => {
      const before = this.rally.phase;
      this.rally = applyContact(this.rally, ct, this.court);
      this.bus.emit('contact', ct);
      if (before !== 'over' && this.rally.result) this.bus.emit('rallyEnd', this.rally.result);
    });
  }
}
