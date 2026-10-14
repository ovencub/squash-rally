import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';
import { createBall, stepBall, type BallContact, type Vec3 } from './ball';
import { launchVelocity } from './predict';

/** 공을 쏴서 조건을 만족하는 첫 접촉을 찾는다 (없으면 null) */
function firstContact(from: Vec3, vel: Vec3, c: CourtDims, match: (ct: BallContact) => boolean, maxT = 3): BallContact | null {
  const b = createBall(from, vel);
  const dt = 1 / tuning.physics.substepHz;
  let found: BallContact | null = null;
  for (let i = 0; i < maxT / dt && !found; i++) {
    stepBall(b, dt, c, (ct) => {
      if (!found && match(ct)) found = ct;
    });
  }
  return found;
}

const DEG = 180 / Math.PI;

/**
 * 주어진 속력으로 앞벽의 목표점(x, y)에 맞도록 발사 각도를 역산 (중력·공기저항 포함, 실제 적분기로 반복 보정).
 * 같은 적분기를 쓰므로 결과는 결정적이다. 도달 불가하면 가장 가까운 각도를 돌려준다.
 */
export function aimAtFrontWall(from: Vec3, target: { x: number; y: number }, speed: number, c: CourtDims): Vec3 {
  const dz = Math.max(0.1, from.z);
  let aim = Math.atan2(target.x - from.x, dz) * DEG;
  let elev = Math.atan2(target.y - from.y, dz) * DEG;
  let vel = launchVelocity(speed, elev, aim);
  for (let i = 0; i < 8; i++) {
    const hit = firstContact(from, vel, c, (ct) => ct.surface === 'front' || ct.surface === 'tin' || ct.surface === 'floor');
    if (!hit || hit.surface === 'floor') {
      elev += 6; // 앞벽에 못 닿음 → 더 높게
    } else {
      const ey = target.y - hit.point.y;
      const ex = target.x - hit.point.x;
      if (Math.abs(ey) < 0.01 && Math.abs(ex) < 0.01) break;
      elev += Math.atan2(ey, dz) * DEG;
      aim += Math.atan2(ex, dz) * DEG;
    }
    elev = Math.min(70, Math.max(-30, elev));
    vel = launchVelocity(speed, elev, aim);
  }
  return vel;
}

/** 앞벽 목표점을 맞힌 뒤 첫 바닥 바운드가 목표 깊이(z)에 오도록 속력까지 찾는다 (서브, AI 깊은 샷용) */
export function aimForLanding(
  from: Vec3,
  wallTarget: { x: number; y: number },
  landingZ: number,
  c: CourtDims,
  speedRange: [number, number] = [6, 30],
): Vec3 {
  let [lo, hi] = speedRange;
  let best = aimAtFrontWall(from, wallTarget, (lo + hi) / 2, c);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    best = aimAtFrontWall(from, wallTarget, mid, c);
    let wallHit = false;
    const land = firstContact(from, best, c, (ct) => {
      if (ct.surface === 'front') wallHit = true;
      return wallHit && ct.surface === 'floor';
    });
    if (!land || land.point.z > landingZ) hi = mid;
    else lo = mid;
  }
  return best;
}
