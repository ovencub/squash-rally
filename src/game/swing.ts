import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';
import { aimAtFrontWall } from '../physics/aim';
import { createBall, stepBall, type Vec3 } from '../physics/ball';
import { type Prediction } from '../physics/predict';
import { applyContact, applyHit, newRally } from '../rules/rally';

// 스윙 판정과 드라이브 궤적 계산. 순수 로직 (렌더 의존 없음).
// M1 피드백: 샷은 드라이브 하나, 100% 앞벽에 유효하게 들어간다.
// M3 피드백: 우클릭 = 포핸드(공이 캐릭터 오른쪽 절반), 좌클릭 = 백핸드(왼쪽 절반). 반대 손이면 헛스윙.
//   세기 = 거리 배점(타격 범위 반지름의 sweetRatio 지점이 최고) × 타이밍 배점. 방향 = 클릭 순간 커서 위치.

export type Hand = 'fore' | 'back';
export type Grade = 'perfect' | 'good' | 'weak';

export interface SwingInput {
  hand: Hand;
  /** 커서가 가리키는 바닥 지점 (방향 결정). null이면 정면 */
  aim: { x: number; z: number } | null;
}

export interface HitWindow {
  /** 공을 칠 수 있게 되는 시각 (앞벽에 맞고 돌아온 뒤) */
  from: number;
  /** 이 시각 이후는 투바운드 */
  until: number;
}

/** 예측 궤적에서 칠 수 있는 시간 구간 계산. bouncesSoFar = 앞벽 이후 이미 튄 횟수 */
export function hitWindow(pred: Prediction, now: number, returning: boolean, bouncesSoFar: number): HitWindow | null {
  let from = now;
  let bounces = bouncesSoFar;
  let sawFront = returning;
  for (const c of pred.contacts) {
    if (!sawFront) {
      if (c.surface === 'front') {
        sawFront = true;
        from = c.time;
        bounces = 0;
      }
      continue;
    }
    if (c.surface === 'floor') {
      bounces++;
      if (bounces >= 2) return { from, until: c.time };
    }
  }
  if (!sawFront) return null;
  return { from, until: pred.points[pred.points.length - 1].t };
}

export function horiz(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 공이 캐릭터의 어느 쪽 절반에 있나 (화면 오른쪽 = +x = 포핸드) */
export function handFor(ball: { x: number }, player: { x: number }): Hand {
  return ball.x >= player.x ? 'fore' : 'back';
}

/** 공이 지금 캐릭터 타격 범위 안인가 (손 구분 없이) */
export function inReach(ball: Vec3, player: { x: number; z: number }): boolean {
  const T = tuning.timing;
  return horiz(ball, player) <= T.reach && ball.y >= T.minHeight && ball.y <= T.maxHeight;
}

/** 최적 원의 반지름 (m) */
export function sweetRadius(): number {
  return tuning.timing.reach * tuning.timing.sweetRatio;
}

/**
 * 거리 배점: 최적 원(반지름 × sweetRatio) 위에서 1, 중심·가장자리로 갈수록 선형으로 minDistScore까지,
 * 범위 밖이면 null (타격 안 됨).
 */
export function distanceScore(d: number): number | null {
  const T = tuning.timing;
  const R = T.reach;
  const s = sweetRadius();
  if (d > R) return null;
  const k = d <= s ? 1 - (s - d) / s : 1 - (d - s) / (R - s);
  return T.minDistScore + (1 - T.minDistScore) * Math.max(0, Math.min(1, k));
}

/** 타이밍 배점: perfectMs 이내 1 → goodMs 0.6 → worstMs 이후 0.25 */
export function timingScore(errMs: number): number {
  const T = tuning.timing;
  const a = Math.abs(errMs);
  if (a <= T.perfectMs) return 1;
  if (a <= T.goodMs) return 1 - (0.4 * (a - T.perfectMs)) / (T.goodMs - T.perfectMs);
  return Math.max(0.25, 0.6 - (0.35 * (a - T.goodMs)) / (T.worstMs - T.goodMs));
}

export function gradeOf(score: number): Grade {
  const S = tuning.shots;
  return score >= S.perfectAt ? 'perfect' : score >= S.goodAt ? 'good' : 'weak';
}

/**
 * 현재 캐릭터 위치 기준 이상적인 타격 시각: 공이 최적 원, 높이 idealHeight에 가장 가까운 순간.
 * points에는 지나온 궤적(trace)과 예측 궤적을 함께 넣는다 — 이미 지나간 순간도 후보여야 늦은 스윙이 늦게 판정된다.
 * 범위 밖이면 null (= 위치를 못 잡음).
 */
export function idealHitTime(
  points: (Vec3 & { t: number })[],
  win: HitWindow,
  player: { x: number; z: number },
): { t: number; point: Vec3 } | null {
  const T = tuning.timing;
  const s = sweetRadius();
  let best: { t: number; point: Vec3 } | null = null;
  let bestCost = Infinity;
  for (const p of points) {
    if (p.t < win.from || p.t > win.until) continue;
    if (!inReach(p, player)) continue;
    const cost = Math.abs(horiz(p, player) - s) + 0.8 * Math.abs(p.y - T.idealHeight);
    if (cost < bestCost) {
      bestCost = cost;
      best = { t: p.t, point: { x: p.x, y: p.y, z: p.z } };
    }
  }
  return best;
}

/**
 * 캐릭터와 무관한 "치기 좋은 공 위치" (바닥 타이밍 링·봇용).
 * 첫 바운드 후 공이 idealHeight 근처로 내려오는 지점, 없으면 바운드 후 최고점, 바운드가 없으면 발리 지점.
 */
export function idealBallPoint(pred: Prediction, win: HitWindow): { t: number; point: Vec3 } | null {
  const T = tuning.timing;
  const floorAfter = pred.contacts.find((c) => c.surface === 'floor' && c.time >= win.from && c.time < win.until);
  const pts = pred.points.filter((p) => p.t >= win.from && p.t <= win.until);
  if (pts.length === 0) return null;
  const pick = (p: (typeof pts)[number]) => ({ t: p.t, point: { x: p.x, y: p.y, z: p.z } });
  if (floorAfter) {
    const after = pts.filter((p) => p.t > floorAfter.time);
    for (let i = 1; i < after.length; i++) {
      const descending = after[i].y < after[i - 1].y;
      if (descending && after[i].y <= T.idealHeight + 0.25) return pick(after[i]);
    }
    if (after.length) return pick(after.reduce((a, b) => (b.y > a.y ? b : a)));
  }
  return pick(pts.reduce((a, b) => (Math.abs(b.y - T.idealHeight) < Math.abs(a.y - T.idealHeight) ? b : a)));
}

/** 샷이 유효한가: 앞벽에 정상으로 맞고 첫 바운드까지 아웃/틴/다운이 없어야 한다 */
export function isValidShot(from: Vec3, vel: Vec3, c: CourtDims): boolean {
  const b = createBall(from, vel);
  let rally = applyHit(newRally(1), 'A');
  const dt = 1 / tuning.physics.substepHz;
  for (let i = 0; i < 3 / dt; i++) {
    stepBall(b, dt, c, (ct) => (rally = applyContact(rally, ct, c)));
    if (rally.result) return false;
    if (rally.phase === 'returning' && rally.floorBounces >= 1) return true;
  }
  return rally.phase === 'returning';
}

/**
 * 커서 방향 → 앞벽 목표 x. 캐릭터에서 커서 지점으로 그은 직선이 앞벽(z=0)과 만나는 곳.
 * 커서가 캐릭터 옆이나 뒤면 기울기를 maxAimSlope로 제한.
 */
export function aimWallX(player: { x: number; z: number }, aim: { x: number; z: number } | null, c: CourtDims): number {
  const lim = c.width / 2 - tuning.shots.wallMargin;
  if (!aim) return Math.max(-lim, Math.min(lim, player.x));
  const fwd = player.z - aim.z; // 앞(-z)으로 간 거리
  const side = aim.x - player.x;
  const maxSlope = tuning.input.maxAimSlope;
  let slope = fwd > 0.05 ? side / fwd : Math.sign(side) * maxSlope;
  slope = Math.max(-maxSlope, Math.min(maxSlope, slope));
  return Math.max(-lim, Math.min(lim, player.x + slope * player.z));
}

/**
 * 드라이브 발사 속도. 배점(0..1)이 높을수록 빠르고 낮고 깊게, 방향은 앞벽 목표 x.
 * 결과가 무효면 높이/속도/각도를 낮춰 반드시 유효한 궤적으로 보정한다.
 */
export function planDrive(from: Vec3, score: number, wallX: number, c: CourtDims): { vel: Vec3; speed: number; target: { x: number; y: number } } {
  const S = tuning.shots;
  const k = Math.max(0, Math.min(1, score));
  let speed = S.minSpeed + (S.maxSpeed - S.minSpeed) * k;
  let y = S.highWall + (S.lowWall - S.highWall) * k;
  const lim = c.width / 2 - S.wallMargin;
  let x = Math.max(-lim, Math.min(lim, wallX));
  const sx = Math.max(-lim, Math.min(lim, from.x));

  for (let i = 0; i < S.safetyTries; i++) {
    const vel = aimAtFrontWall(from, { x, y }, speed, c);
    if (isValidShot(from, vel, c)) return { vel, speed, target: { x, y } };
    y = Math.max(S.minWallHeight, y - 0.2);
    speed *= 0.93;
    x += (sx - x) * 0.35; // 무리한 각도 완화: 친 위치 정면 쪽으로
  }
  // 최후 보정: 정면 쪽 낮고 느린 샷을 검증하며 탐색
  let last = { vel: aimAtFrontWall(from, { x: sx, y: 1.4 }, 11, c), speed: 11, target: { x: sx, y: 1.4 } };
  for (const sp of [12, 10, 8, 14]) {
    for (const ty of [1.4, 1.1, 1.8]) {
      for (const tx of [sx, sx * 0.5, 0]) {
        const vel = aimAtFrontWall(from, { x: tx, y: ty }, sp, c);
        last = { vel, speed: sp, target: { x: tx, y: ty } };
        if (isValidShot(from, vel, c)) return last;
      }
    }
  }
  return last;
}
