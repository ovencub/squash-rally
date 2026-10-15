import { tPosition, type CourtDims } from '../config/court';
import { tuning, type Difficulty } from '../config/tuning';
import { type Rng } from '../core/rng';
import { type BallState } from '../physics/ball';
import { type Prediction } from '../physics/predict';
import { type RallyState } from '../rules/rally';
import { handFor, hitWindow, idealBallPoint, idealHitTime, inReach, sweetRadius, type SwingInput } from './swing';

// AI 상대 (기획서 3-6). 공정함: 플레이어와 같은 물리·룰·이동 모델·타격 판정을 쓴다.
// 흐름: 상대가 친 순간 → 반응 지연 → 궤적 예측 → 타점 옆 자리로 이동(위치 오차) → 이상적 순간(+타이밍 오차)에 맞는 손으로 스윙.
// 못 따라가거나 범위를 벗어나면 그대로 놓친다(투바운드).

export interface AiContext {
  ball: BallState | null;
  pred: Prediction | null;
  rally: RallyState;
  me: { x: number; z: number };
  opponent: { x: number; z: number };
  court: CourtDims;
  /** 난이도 게임 속도 배율 (공 시간 → 실제 시간 환산) */
  gameSpeed: number;
}

/**
 * AI가 이번 공을 놓칠 확률. pressure = 필요 이동 속도 / AI 최고 속도, speedK = 타구 빠르기 0..1.
 * 여유 있는 공(pressure ≤ 0.45, 느린 공)은 거의 다 받고, 급하고 빠를수록 크게 오른다. (최대 0.9)
 */
export function aiMissChance(
  lv: { missBase: number; missPressure: number; missSpeed: number },
  pressure: number,
  speedK: number,
): number {
  const t = Math.max(0, Math.min(1, (pressure - 0.45) / 0.55));
  const rushK = t * t * (3 - 2 * t); // 부드럽게 증가
  return Math.min(0.9, lv.missBase + lv.missPressure * rushK + lv.missSpeed * speedK);
}

export interface AiDecision {
  /** 이동 목표 (null이면 제자리) */
  target: { x: number; z: number } | null;
  swing: SwingInput | null;
}

export class AiBrain {
  private reactLeft = 0;
  private chasing = false;
  private errOffset = { x: 0, z: 0 };
  private timingErr = 0;
  private lockedIdeal: number | null = null;
  private willMiss = false;

  constructor(
    private difficulty: Difficulty,
    private rng: Rng,
  ) {}

  private get lv() {
    return tuning.ai.level[this.difficulty];
  }

  /** 마지막 타구에 대한 판단 (디버그·테스트용) */
  lastDecision: { pressure: number; speedK: number; missProb: number; willMiss: boolean } | null = null;
  private shotSpeed = 0;
  private decided = false;

  /** 상대(플레이어)가 공을 친 순간. shotSpeed = 친 공의 속력(m/s) */
  onOpponentHit(shotSpeed = 0): void {
    this.reactLeft = this.lv.reactionMs / 1000;
    this.chasing = true;
    this.lockedIdeal = null;
    this.shotSpeed = shotSpeed;
    this.decided = false;
    this.willMiss = false;
    const e = this.lv.standErrM;
    this.errOffset = { x: this.rng.gauss(e), z: this.rng.gauss(e) };
    this.timingErr = 0;
  }

  /**
   * 공이 어디로 올지 보이면(반응 후 첫 판단) 이번 공의 난이도로 실수 여부와 타이밍 오차를 정한다.
   * 멀리, 빨리 보낼수록 놓치거나 약하게 받을 확률이 올라간다.
   */
  private decide(target: { x: number; z: number }, me: { x: number; z: number }, arriveIn: number, gameSpeed: number): void {
    const lv = this.lv;
    const dist = Math.hypot(target.x - me.x, target.z - me.z);
    const realTime = Math.max(0.05, arriveIn / gameSpeed); // 이동은 실제 시간 기준
    const aiMax = tuning.player.maxSpeed * lv.speedRatio;
    const pressure = dist / realTime / aiMax;
    const S = tuning.shots;
    const speedK = Math.max(0, Math.min(1, (this.shotSpeed - S.minSpeed) / (S.maxSpeed - S.minSpeed)));
    const p = aiMissChance(lv, pressure, speedK);
    this.willMiss = this.rng.next() < p;
    const rush = 1 + (lv.timingRush - 1) * Math.min(1, Math.max(0, (pressure - 0.3) / 0.7) * 0.7 + speedK * 0.3);
    this.timingErr = this.rng.gauss(lv.timingSdMs * rush) / 1000;
    this.decided = true;
    this.lastDecision = { pressure, speedK, missProb: p, willMiss: this.willMiss };
  }

  /** 내가 쳤거나 랠리가 끝남 */
  reset(): void {
    this.chasing = false;
    this.lockedIdeal = null;
  }

  update(realDt: number, ctx: AiContext): AiDecision {
    const { ball: b, rally, court: c } = ctx;
    const myTurn = !!b && rally.phase !== 'over' && rally.lastHitter === 'A';
    if (!myTurn || !this.chasing) {
      // 회복: T 근처, 상대와 겹치지 않는 쪽으로
      const t = tPosition(c);
      const side = ctx.opponent.x > 0 ? -0.6 : 0.6;
      return { target: { x: t.x + side, z: t.z + 0.6 }, swing: null };
    }
    if (this.reactLeft > 0) {
      this.reactLeft -= realDt;
      return { target: null, swing: null };
    }
    if (!ctx.pred) return { target: null, swing: null };

    const returning = rally.phase === 'returning';
    const win = hitWindow(ctx.pred, b!.time, returning, rally.floorBounces);
    const ring = win ? idealBallPoint(ctx.pred, win) : null;
    if (!win || !ring) return { target: null, swing: null };

    // 타점 옆 자리 (최적 원 거리 + 위치 오차). 포/백 중 가까운 쪽
    const d = sweetRadius();
    const fore = { x: ring.point.x - d, z: ring.point.z + 0.15 };
    const back = { x: ring.point.x + d, z: ring.point.z + 0.15 };
    const pick = Math.hypot(fore.x - ctx.me.x, fore.z - ctx.me.z) <= Math.hypot(back.x - ctx.me.x, back.z - ctx.me.z) ? fore : back;
    const lim = c.width / 2 - tuning.player.radius;
    const target = {
      x: Math.max(-lim, Math.min(lim, pick.x + this.errOffset.x)),
      z: Math.max(0.8, Math.min(c.length - 0.3, pick.z + this.errOffset.z)),
    };

    if (!this.decided) this.decide(target, ctx.me, ring.t - b!.time, ctx.gameSpeed);

    let swing: SwingInput | null = null;
    if (returning) {
      // 이상적 순간이 가까워지면 고정 (이후 늦게 치는 오차가 실제로 늦게 반영되도록)
      if (this.lockedIdeal === null) {
        const ideal = idealHitTime(ctx.pred.points, win, ctx.me);
        if (ideal && ideal.t - b!.time < 0.25) this.lockedIdeal = ideal.t;
      }
      if (!this.willMiss && this.lockedIdeal !== null && b!.time >= this.lockedIdeal + this.timingErr && inReach(b!.pos, ctx.me)) {
        swing = { hand: handFor(b!.pos, ctx.me), aim: this.aimPoint(ctx) };
      }
    }
    return { target, swing };
  }

  /** 노리는 방향 → 커서처럼 바닥 지점 */
  private aimPoint(ctx: AiContext): { x: number; z: number } {
    const c = ctx.court;
    const half = c.width / 2 - tuning.shots.wallMargin;
    let wallX: number;
    switch (this.lv.aim) {
      case 'center':
        wallX = this.rng.range(-0.8, 0.8);
        break;
      case 'mixed':
        wallX = this.rng.range(-half, half);
        break;
      case 'away':
        // 상대 반대쪽으로 흔든다
        wallX = (ctx.opponent.x > 0 ? -1 : 1) * this.rng.range(half * 0.6, half);
        break;
    }
    // 내 위치에서 앞벽 목표점 방향의 바닥 지점 (aimWallX가 이 직선을 앞벽까지 연장)
    return { x: ctx.me.x + (wallX - ctx.me.x) * 0.5, z: ctx.me.z * 0.5 };
  }
}
