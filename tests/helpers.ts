import { buildCourt, type CourtDims } from '../src/config/court';
import { tuning, type Difficulty } from '../src/config/tuning';
import { createBall, stepBall, type BallContact, type Surface, type Vec3 } from '../src/physics/ball';
import { launchVelocity } from '../src/physics/predict';
import { applyContact, applyHit, newRally, type RallyState, type ServeSide } from '../src/rules/rally';

export function contact(surface: Surface, point: Partial<Vec3>, extra: Partial<BallContact> = {}): BallContact {
  return { surface, point: { x: 0, y: 1, z: 0, ...point }, normalSpeed: 5, speed: 5, time: 0, ...extra };
}

export interface ShotSpec {
  from: Vec3;
  /** vel을 주면 speed/elevation/aim 대신 사용 */
  vel?: Vec3;
  speed?: number;
  elevationDeg?: number;
  aimDeg?: number;
  serve?: boolean;
  serveSide?: ServeSide;
  players?: 1 | 2;
  difficulty?: Difficulty;
}

/** 실제 물리 + 룰로 샷 하나를 끝까지 시뮬레이션 */
export function simulateShot(spec: ShotSpec, seconds = 6): { rally: RallyState; contacts: BallContact[]; court: CourtDims } {
  const court = buildCourt(spec.difficulty ?? 'easy');
  const ball = createBall(spec.from, spec.vel ?? launchVelocity(spec.speed ?? 0, spec.elevationDeg ?? 0, spec.aimDeg ?? 0));
  let rally = newRally(spec.players ?? 2, 'A', spec.serveSide ?? 'right');
  rally = applyHit(rally, 'A', spec.serve ?? false);
  const contacts: BallContact[] = [];
  const dt = 1 / tuning.physics.substepHz;
  for (let i = 0; i < seconds / dt && rally.phase !== 'over'; i++) {
    stepBall(ball, dt, court, (c) => {
      contacts.push(c);
      rally = applyContact(rally, c, court);
    });
  }
  return { rally, contacts, court };
}
