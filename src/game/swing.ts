import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';
import { aimAtFrontWall } from '../physics/aim';
import { createBall, stepBall, type Vec3 } from '../physics/ball';
import { type Prediction } from '../physics/predict';
import { applyContact, applyHit, newRally } from '../rules/rally';

// 스윙 판정과 드라이브 궤적 계산. 순수 로직 (렌더 의존 없음).
// M1 피드백: 샷은 항상 드라이브이고 100% 앞벽에 유효하게 들어간다.
// 승패는 "스윙 타이밍"과 "타점까지 이동"으로만 갈린다.

export type Quality = 'perfect' | 'good' | 'early' | 'late';

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

function horiz(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 공이 지금 캐릭터 타격 범위 안인가 */
export function inReach(ball: Vec3, player: { x: number; z: number }): boolean {
  const T = tuning.timing;
  return horiz(ball, player) <= T.reach && ball.y >= T.minHeight && ball.y <= T.maxHeight;
}

/**
 * 현재 캐릭터 위치 기준 이상적인 타격 시각: 공이 캐릭터 옆 idealSideDist, 높이 idealHeight에 가장 가까운 순간.
 * points에는 지나온 궤적(trace)과 예측 궤적을 함께 넣는다 — 이미 지나간 순간도 후보여야 늦은 스윙이 LATE로 판정된다.
 * 범위 밖이면 null (= 위치를 못 잡음).
 */
export function idealHitTime(
  points: (Vec3 & { t: number })[],
  win: HitWindow,
  player: { x: number; z: number },
): { t: number; point: Vec3 } | null {
  const T = tuning.timing;
  let best: { t: number; point: Vec3 } | null = null;
  let bestCost = Infinity;
  for (const p of points) {
    if (p.t < win.from || p.t > win.until) continue;
    if (!inReach(p, player)) continue;
    const cost = Math.abs(horiz(p, player) - T.idealSideDist) + 0.8 * Math.abs(p.y - T.idealHeight);
    if (cost < bestCost) {
      bestCost = cost;
      best = { t: p.t, point: { x: p.x, y: p.y, z: p.z } };
    }
  }
  return best;
}

/**
 * 캐릭터와 무관한 "치기 좋은 공 위치" (타이밍 링·자동 위치 보조용).
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

export function judge(errMs: number): Quality {
  const T = tuning.timing;
  const a = Math.abs(errMs);
  if (a <= T.perfectMs) return 'perfect';
  if (a <= T.goodMs) return 'good';
  return errMs < 0 ? 'early' : 'late';
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

export interface DriveParams {
  from: Vec3;
  quality: Quality;
  errMs: number;
  /** 0..1 */
  power: number;
  /** -1..1 */
  aim: number;
  /** +1 포핸드(공이 캐릭터 오른쪽), -1 백핸드 */
  side: 1 | -1;
}

/**
 * 드라이브 발사 속도 계산. 판정이 좋을수록 빠르고 낮고 깊게.
 * 일찍 치면 크로스, 늦게 치면 스트레이트. 결과가 무효면 높이/속도를 낮춰 반드시 유효한 궤적으로 보정한다.
 */
export function planDrive(p: DriveParams, c: CourtDims): { vel: Vec3; speed: number; target: { x: number; y: number } } {
  const S = tuning.shots;
  const prof = p.quality === 'perfect' ? S.perfect : p.quality === 'good' ? S.good : S.off;
  let speed = prof.speed * (S.powerMin + (1 - S.powerMin) * Math.max(0, Math.min(1, p.power)));
  let y = prof.wallHeight;

  const e = Math.max(-1, Math.min(1, p.errMs / tuning.timing.goodMs));
  const straightX = p.from.x;
  const crossX = -p.side * c.width * S.timingAngle;
  const k = 0.5 - 0.5 * e; // 일찍(e<0) → 1 = 크로스, 늦게(e>0) → 0 = 스트레이트
  const lim = c.width / 2 - S.wallMargin;
  let x = straightX + (crossX - straightX) * k + p.aim * tuning.input.aimFromStroke;
  x = Math.max(-lim, Math.min(lim, x));

  for (let i = 0; i < S.safetyTries; i++) {
    const vel = aimAtFrontWall(p.from, { x, y }, speed, c);
    if (isValidShot(p.from, vel, c)) return { vel, speed, target: { x, y } };
    y = Math.max(S.minWallHeight, y - 0.2);
    speed *= 0.93;
    // 무리한 각도 완화: 친 위치 정면(스트레이트) 쪽으로
    const sx = Math.max(-lim, Math.min(lim, p.from.x));
    x += (sx - x) * 0.35;
  }
  // 최후 보정: 정면 쪽 낮고 느린 샷을 검증하며 탐색
  const sx = Math.max(-lim, Math.min(lim, p.from.x));
  let last = { vel: aimAtFrontWall(p.from, { x: sx, y: 1.4 }, 11, c), speed: 11, target: { x: sx, y: 1.4 } };
  for (const sp of [12, 10, 8, 14]) {
    for (const ty of [1.4, 1.1, 1.8]) {
      for (const tx of [sx, sx * 0.5, 0]) {
        const vel = aimAtFrontWall(p.from, { x: tx, y: ty }, sp, c);
        last = { vel, speed: sp, target: { x: tx, y: ty } };
        if (isValidShot(p.from, vel, c)) return last;
      }
    }
  }
  return last;
}
