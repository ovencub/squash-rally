import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';

// 캐릭터 이동: 관성 + 속도 상한 + 급정지/급전환 스퀵. AI도 같은 모델·같은 상한을 쓴다 (공정함).

export interface Mover {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** 마지막 입력 방향 (스퀵 판정용) */
  lastDirX: number;
  lastDirZ: number;
  squeakCooldown: number;
}

export function createMover(x: number, z: number): Mover {
  return { x, z, vx: 0, vz: 0, lastDirX: 0, lastDirZ: 0, squeakCooldown: 0 };
}

/**
 * dir: 입력 방향(길이 ≤ 1). target이 있으면(봇/AI) 그 지점으로 감속 도착.
 * speedRatio: 최고 속도 배율. 스퀵이 나면 true 반환.
 */
export function moveStep(
  m: Mover,
  dt: number,
  c: CourtDims,
  dir: { x: number; z: number } | null,
  target: { x: number; z: number } | null = null,
  speedRatio = 1,
): boolean {
  const P = tuning.player;
  const max = P.maxSpeed * speedRatio;
  let dx = 0;
  let dz = 0;
  let wantSpeed = 0;
  if (dir && (dir.x || dir.z)) {
    const l = Math.hypot(dir.x, dir.z);
    dx = dir.x / l;
    dz = dir.z / l;
    wantSpeed = max * Math.min(1, l);
  } else if (target) {
    const ex = target.x - m.x;
    const ez = target.z - m.z;
    const d = Math.hypot(ex, ez);
    if (d > 0.03) {
      dx = ex / d;
      dz = ez / d;
      // 감속 도착: 정지 거리 안이면 속도 줄임
      wantSpeed = Math.min(max, Math.sqrt(2 * P.decel * 0.6 * d));
    }
  }

  // 스퀵: 빠르게 달리다 방향을 크게 꺾거나 급정지
  const speed = Math.hypot(m.vx, m.vz);
  let squeak = false;
  m.squeakCooldown = Math.max(0, m.squeakCooldown - dt * 1000);
  if (speed > P.squeakMinSpeed && m.squeakCooldown === 0) {
    const stopping = wantSpeed < speed * 0.3;
    const cos = wantSpeed > 0 ? (dx * m.vx + dz * m.vz) / speed : 1;
    const turning = wantSpeed > 0 && cos < Math.cos((P.squeakTurnDeg * Math.PI) / 180);
    if (stopping || turning) {
      squeak = true;
      m.squeakCooldown = P.squeakCooldownMs;
    }
  }

  // 원하는 속도로 가속/감속
  const wvx = dx * wantSpeed;
  const wvz = dz * wantSpeed;
  const ax = wvx - m.vx;
  const az = wvz - m.vz;
  const da = Math.hypot(ax, az);
  const accel = wantSpeed > speed ? P.accel : P.decel;
  const maxDv = accel * dt;
  if (da > maxDv) {
    m.vx += (ax / da) * maxDv;
    m.vz += (az / da) * maxDv;
  } else {
    m.vx = wvx;
    m.vz = wvz;
  }

  m.x += m.vx * dt;
  m.z += m.vz * dt;
  const r = P.radius;
  const minX = -c.width / 2 + r;
  const maxX = c.width / 2 - r;
  if (m.x < minX || m.x > maxX) {
    m.x = Math.max(minX, Math.min(maxX, m.x));
    m.vx = 0;
  }
  if (m.z < r + 0.5 || m.z > c.length - r) {
    m.z = Math.max(r + 0.5, Math.min(c.length - r, m.z));
    m.vz = 0;
  }
  m.lastDirX = dx;
  m.lastDirZ = dz;
  return squeak;
}

/** 공이 최적 원 위(옆)에 오도록 서 있을 자리 (포핸드/백핸드 중 가까운 쪽). 디버그 봇용 */
export function standSpotFor(ball: { x: number; z: number }, from: { x: number; z: number }, c: CourtDims): { x: number; z: number } {
  const d = tuning.timing.reach * tuning.timing.sweetRatio;
  const lim = c.width / 2 - tuning.player.radius;
  const fore = { x: ball.x - d, z: ball.z + 0.15 }; // 공이 오른쪽 = 포핸드
  const back = { x: ball.x + d, z: ball.z + 0.15 };
  const pick = Math.hypot(fore.x - from.x, fore.z - from.z) <= Math.hypot(back.x - from.x, back.z - from.z) ? fore : back;
  return { x: Math.max(-lim, Math.min(lim, pick.x)), z: Math.max(0.8, Math.min(c.length - 0.3, pick.z)) };
}
