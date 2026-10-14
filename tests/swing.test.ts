import { describe, expect, it } from 'vitest';
import { buildCourt } from '../src/config/court';
import { tuning, type Difficulty } from '../src/config/tuning';
import { Rng } from '../src/core/rng';
import { createMover, moveStep } from '../src/game/player';
import { aimWallX, distanceScore, gradeOf, handFor, isValidShot, planDrive, sweetRadius, timingScore } from '../src/game/swing';

describe('드라이브는 항상 유효하다', () => {
  for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
    it(`${d}: 코트 전역 × 배점 × 조준 방향`, () => {
      const c = buildCourt(d);
      const rng = new Rng(7);
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const from = {
          x: rng.range(-c.width / 2 + 0.15, c.width / 2 - 0.15),
          y: rng.range(0.1, 2.0),
          z: rng.range(1.0, c.length - 0.15),
        };
        for (const score of [0, 0.3, 0.6, 0.85, 1]) {
          const aim = { x: rng.range(-c.width, c.width), z: rng.range(-2, c.length) };
          const plan = planDrive(from, score, aimWallX({ x: from.x, z: from.z }, aim, c), c);
          expect(isValidShot(from, plan.vel, c), `${JSON.stringify(from)} ${score}`).toBe(true);
          n++;
        }
      }
      expect(n).toBe(300);
    });
  }

  it('배점이 높을수록 빠르다', () => {
    const c = buildCourt('easy');
    const from = { x: 0.5, y: 0.8, z: 7.5 };
    const sp = (s: number) => planDrive(from, s, 0.5, c).speed;
    expect(sp(1)).toBeGreaterThan(sp(0.6));
    expect(sp(0.6)).toBeGreaterThan(sp(0.2));
  });
});

describe('거리 배점 (최적 원 = 반지름 × sweetRatio)', () => {
  const R = tuning.timing.reach;
  it('최적 원에서 1, 안쪽/바깥쪽으로 갈수록 낮아짐', () => {
    expect(distanceScore(sweetRadius())).toBeCloseTo(1);
    expect(distanceScore(sweetRadius() * 0.5)!).toBeLessThan(1);
    expect(distanceScore(sweetRadius() * 0.5)!).toBeGreaterThan(distanceScore(0)!);
    expect(distanceScore((sweetRadius() + R) / 2)!).toBeLessThan(1);
    expect(distanceScore((sweetRadius() + R) / 2)!).toBeGreaterThan(distanceScore(R)!);
  });
  it('중심과 가장자리는 최저 배점', () => {
    expect(distanceScore(0)).toBeCloseTo(tuning.timing.minDistScore);
    expect(distanceScore(R)).toBeCloseTo(tuning.timing.minDistScore);
  });
  it('범위 밖이면 타격 안 됨', () => {
    expect(distanceScore(R + 0.001)).toBeNull();
  });
});

describe('타이밍 배점', () => {
  const T = tuning.timing;
  it('경계값', () => {
    expect(timingScore(0)).toBe(1);
    expect(timingScore(-T.perfectMs)).toBe(1);
    expect(timingScore(T.goodMs)).toBeCloseTo(0.6);
    expect(timingScore(T.worstMs + 500)).toBeCloseTo(0.25);
  });
  it('최적 원 + 완벽한 타이밍이면 PERFECT', () => {
    expect(gradeOf(distanceScore(sweetRadius())! * timingScore(0))).toBe('perfect');
    expect(gradeOf(distanceScore(0)! * timingScore(0))).toBe('weak');
  });
});

describe('포핸드/백핸드', () => {
  it('공이 캐릭터 오른쪽이면 포핸드, 왼쪽이면 백핸드', () => {
    expect(handFor({ x: 1.3 }, { x: 1 })).toBe('fore');
    expect(handFor({ x: 0.7 }, { x: 1 })).toBe('back');
  });
});

describe('커서 조준', () => {
  const c = buildCourt('easy');
  const p = { x: 0, z: 6 };
  it('커서가 앞 오른쪽이면 앞벽 오른쪽으로', () => {
    expect(aimWallX(p, { x: 1, z: 3 }, c)).toBeGreaterThan(0.5);
    expect(aimWallX(p, { x: -1, z: 3 }, c)).toBeLessThan(-0.5);
  });
  it('커서 없음 → 정면, 앞벽 밖으로 안 나감', () => {
    expect(aimWallX(p, null, c)).toBe(0);
    const lim = c.width / 2 - tuning.shots.wallMargin;
    expect(Math.abs(aimWallX(p, { x: 50, z: 5.9 }, c))).toBeLessThanOrEqual(lim);
  });
});

describe('이동', () => {
  const c = buildCourt('easy');
  it('최고 속도를 넘지 않고 코트 밖으로 못 나감', () => {
    const m = createMover(0, 6);
    for (let i = 0; i < 240; i++) moveStep(m, 1 / 120, c, { x: 1, z: 0 });
    expect(Math.hypot(m.vx, m.vz)).toBeLessThanOrEqual(tuning.player.maxSpeed + 1e-9);
    expect(m.x).toBeLessThanOrEqual(c.width / 2 - tuning.player.radius);
  });
  it('달리다 반대로 꺾으면 스퀵', () => {
    const m = createMover(-2, 6);
    for (let i = 0; i < 60; i++) moveStep(m, 1 / 120, c, { x: 1, z: 0 });
    expect(moveStep(m, 1 / 120, c, { x: -1, z: 0 })).toBe(true);
  });
  it('목표 지점에 감속해서 도착 (봇/AI용)', () => {
    const m = createMover(0, 6);
    for (let i = 0; i < 600; i++) moveStep(m, 1 / 120, c, null, { x: 2, z: 8 });
    expect(Math.hypot(m.x - 2, m.z - 8)).toBeLessThan(0.05);
  });
});
