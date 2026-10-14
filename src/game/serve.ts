import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';
import { aimForLanding } from '../physics/aim';
import { createBall, stepBall, type Vec3 } from '../physics/ball';
import { applyContact, applyHit, newRally, serviceBoxCenter, type ServeSide } from '../rules/rally';

// 서브 (기획서 3-4). 서버는 서비스 박스, 리시버는 반대편 뒤 사각형.
// 플레이어 샷과 같은 원칙으로 서브도 항상 유효하게 계획한다 (룰 판정으로 검증).

export function serverSpot(side: ServeSide, c: CourtDims): { x: number; z: number } {
  const b = serviceBoxCenter(side, c);
  // 박스 안쪽 가장자리 쪽에 서서 공을 몸 오른쪽(포핸드)에 둔다
  return { x: b.x - 0.35, z: b.z };
}

export function receiverSpot(serverSide: ServeSide, c: CourtDims): { x: number; z: number } {
  const s = serverSide === 'right' ? -1 : 1;
  return { x: (s * c.width) / 4, z: c.shortLineZ + (c.length - c.shortLineZ) * 0.62 };
}

/** 서브 공을 띄우는 위치 (서버 오른쪽 옆) */
export function serveBallFrom(server: { x: number; z: number }): Vec3 {
  return { x: server.x + 0.6, y: 1.0, z: server.z - 0.1 };
}

/** 서브가 유효한가: 서비스 라인 위 앞벽 → 반대편 뒤 사각형 첫 바운드 */
export function isValidServe(from: Vec3, vel: Vec3, side: ServeSide, c: CourtDims): boolean {
  const b = createBall(from, vel);
  let rally = applyHit(newRally(2, 'A', side), 'A', true);
  const dt = 1 / tuning.physics.substepHz;
  for (let i = 0; i < 4 / dt; i++) {
    stepBall(b, dt, c, (ct) => (rally = applyContact(rally, ct, c)));
    if (rally.result) return false;
    if (rally.phase === 'returning' && rally.floorBounces >= 1) return true;
  }
  return false;
}

/**
 * 서브 궤적: 앞벽 서비스 라인 위를 맞고 반대편 뒤 사각형 깊숙이 떨어지게.
 * variety(-1..1)로 앞벽 지점/깊이를 살짝 바꾼다 (AI 다양성). 무효면 보수적으로 바꿔 재시도.
 */
export function planServe(from: Vec3, side: ServeSide, c: CourtDims, variety = 0): Vec3 {
  const s = side === 'right' ? 1 : -1;
  const sl = c.serviceLineHeight;
  const back = c.length - c.shortLineZ;
  let wallX = -s * (0.3 + 0.25 * variety);
  let wallY = sl + 1.1 + 0.3 * variety;
  let depth = c.shortLineZ + back * (0.5 + 0.1 * variety);
  let vel = aimForLanding(from, { x: wallX, y: wallY }, depth, c);
  for (let i = 0; i < 6 && !isValidServe(from, vel, side, c); i++) {
    wallX = -s * 0.3;
    wallY = sl + 1.0 + 0.15 * i;
    depth = c.shortLineZ + back * (0.45 + 0.04 * i);
    vel = aimForLanding(from, { x: wallX, y: wallY }, depth, c);
  }
  return vel;
}
