import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';
import { cloneBall, stepBall, type BallContact, type BallState, type Vec3 } from './ball';

export interface Prediction {
  /** 일정 간격 샘플 (시각 포함) */
  points: (Vec3 & { t: number })[];
  contacts: BallContact[];
}

/**
 * 실제 시뮬레이션과 같은 stepBall로 미래 궤적을 계산한다 (AI, 타이밍 링, 디버그 예측선 공용).
 * 같은 dt를 쓰므로 예측과 실제 결과가 정확히 일치한다.
 */
export function predict(ball: BallState, court: CourtDims, seconds: number, sampleEvery = 4): Prediction {
  const b = cloneBall(ball);
  const dt = 1 / tuning.physics.substepHz;
  const steps = Math.ceil(seconds / dt);
  const points: Prediction['points'] = [{ ...b.pos, t: b.time }];
  const contacts: BallContact[] = [];
  for (let i = 1; i <= steps; i++) {
    stepBall(b, dt, court, (c) => contacts.push(c));
    if (i % sampleEvery === 0) points.push({ ...b.pos, t: b.time });
    if (b.rolling && Math.hypot(b.vel.x, b.vel.z) < 0.05) break;
  }
  return { points, contacts };
}

/** 앞벽 방향 발사 속도 벡터: aimDeg 0 = 정면, +는 오른쪽(+x). elevationDeg +는 위. */
export function launchVelocity(speed: number, elevationDeg: number, aimDeg: number): Vec3 {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (aimDeg * Math.PI) / 180;
  return {
    x: speed * Math.cos(el) * Math.sin(az),
    y: speed * Math.sin(el),
    z: -speed * Math.cos(el) * Math.cos(az),
  };
}
