import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';

// 렌더/DOM 의존 금지 (순수 TS, 테스트 대상)

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Surface = 'front' | 'tin' | 'left' | 'right' | 'back' | 'floor';

export interface BallContact {
  surface: Surface;
  /** 접촉 순간 공 중심 위치 */
  point: Vec3;
  /** 면에 수직인 충돌 속도 (m/s, 양수) */
  normalSpeed: number;
  /** 공 전체 속력 (m/s) */
  speed: number;
  /** 시뮬레이션 시각 (s) */
  time: number;
  /** 바닥에서 굴러가기 시작함 (= 추가 바운드로 간주) */
  rolling?: boolean;
}

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  /** 바닥을 구르는 중 */
  rolling: boolean;
  time: number;
}

export function createBall(pos: Vec3, vel: Vec3): BallState {
  return { pos: { ...pos }, vel: { ...vel }, rolling: false, time: 0 };
}

export function cloneBall(b: BallState): BallState {
  return { pos: { ...b.pos }, vel: { ...b.vel }, rolling: b.rolling, time: b.time };
}

const MAX_CONTACTS_PER_STEP = 6;

/**
 * 공을 dt만큼 진행. 반암시적 오일러 적분 후, 이동 구간에 대해 각 평면 통과 시각을 정확히 계산(스윕)해
 * 가장 이른 접촉부터 처리한다 → 프레임레이트와 무관하게 결정적이며 고속에서도 벽을 뚫지 않는다.
 */
export function stepBall(b: BallState, dt: number, c: CourtDims, onContact: (ct: BallContact) => void): void {
  const P = tuning.physics;
  const r = P.ballRadius;
  const v = b.vel;
  const p = b.pos;

  // 힘: 중력 + 2차 공기저항
  const speed = Math.hypot(v.x, v.y, v.z);
  const dragA = P.drag * speed;
  v.x -= v.x * dragA * dt;
  v.z -= v.z * dragA * dt;
  if (b.rolling) {
    v.y = 0;
    const hs = Math.hypot(v.x, v.z);
    if (hs > 0) {
      const ns = Math.max(0, hs - P.rollFriction * dt);
      v.x *= ns / hs;
      v.z *= ns / hs;
    }
  } else {
    v.y -= v.y * dragA * dt;
    v.y -= P.gravity * dt;
  }

  // 평면 경계 (공 중심 기준)
  const minX = -c.width / 2 + r;
  const maxX = c.width / 2 - r;
  const minZ = r;
  const maxZ = c.length - r;
  const minY = r;

  let remaining = dt;
  for (let i = 0; i < MAX_CONTACTS_PER_STEP && remaining > 0; i++) {
    let tHit = remaining;
    let surf: Surface | null = null;
    if (v.x < 0 && p.x + v.x * remaining < minX) {
      const t = (minX - p.x) / v.x;
      if (t < tHit) [tHit, surf] = [t, 'left'];
    }
    if (v.x > 0 && p.x + v.x * remaining > maxX) {
      const t = (maxX - p.x) / v.x;
      if (t < tHit) [tHit, surf] = [t, 'right'];
    }
    if (v.z < 0 && p.z + v.z * remaining < minZ) {
      const t = (minZ - p.z) / v.z;
      if (t < tHit) [tHit, surf] = [t, 'front'];
    }
    if (v.z > 0 && p.z + v.z * remaining > maxZ) {
      const t = (maxZ - p.z) / v.z;
      if (t < tHit) [tHit, surf] = [t, 'back'];
    }
    if (!b.rolling && v.y < 0 && p.y + v.y * remaining < minY) {
      const t = (minY - p.y) / v.y;
      if (t < tHit) [tHit, surf] = [t, 'floor'];
    }
    tHit = Math.max(0, tHit);

    p.x += v.x * tHit;
    p.y += v.y * tHit;
    p.z += v.z * tHit;
    remaining -= tHit;
    b.time += tHit;
    if (!surf) break;

    const spd = Math.hypot(v.x, v.y, v.z);
    const T = P.tangentRetain;
    const R = P.restitution;
    let normalSpeed: number;
    let rolling = false;
    if (surf === 'floor') {
      p.y = minY;
      normalSpeed = -v.y;
      v.y = normalSpeed * R.floor;
      v.x *= T.floor;
      v.z *= T.floor;
      if (v.y < P.rollThreshold) {
        v.y = 0;
        b.rolling = true;
        rolling = true;
      }
    } else if (surf === 'left' || surf === 'right') {
      p.x = surf === 'left' ? minX : maxX;
      normalSpeed = Math.abs(v.x);
      v.x = -v.x * R.side;
      v.y *= T.wall;
      v.z *= T.wall;
    } else if (surf === 'back') {
      p.z = maxZ;
      normalSpeed = v.z;
      v.z = -v.z * R.back;
      v.x *= T.wall;
      v.y *= T.wall;
    } else {
      // 앞벽: 틴 윗선(포함) 아래에 공이 닿으면 틴
      p.z = minZ;
      if (p.y - r <= c.tinHeight) surf = 'tin';
      normalSpeed = -v.z;
      v.z = normalSpeed * (surf === 'tin' ? R.tin : R.front);
      v.x *= T.wall;
      v.y *= T.wall;
    }

    onContact({ surface: surf, point: { ...p }, normalSpeed, speed: spd, time: b.time });
    if (rolling) {
      // 첫 바운드에 바로 굴러가면 그 자체로 연속 바운드 → 바운드 1회 추가로 알림
      onContact({ surface: 'floor', point: { ...p }, normalSpeed: 0, speed: Math.hypot(v.x, v.z), time: b.time, rolling: true });
    }
  }
  b.time += remaining;
}
