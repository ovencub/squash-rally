import { describe, expect, it } from 'vitest';
import { buildCourt } from '../src/config/court';
import { tuning, type Difficulty } from '../src/config/tuning';
import { Rng } from '../src/core/rng';
import { createMover, moveStep } from '../src/game/player';
import { isValidShot, judge, planDrive, type Quality } from '../src/game/swing';

describe('드라이브는 항상 유효하다 (M1 피드백)', () => {
  for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
    it(`${d}: 코트 전역 × 모든 판정 × 파워/조준`, () => {
      const c = buildCourt(d);
      const rng = new Rng(7);
      const qualities: [Quality, number][] = [
        ['perfect', 0],
        ['good', -90],
        ['good', 90],
        ['early', -250],
        ['late', 250],
      ];
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const from = {
          x: rng.range(-c.width / 2 + 0.15, c.width / 2 - 0.15),
          y: rng.range(0.1, 2.0),
          z: rng.range(1.0, c.length - 0.15),
        };
        for (const [quality, errMs] of qualities) {
          const plan = planDrive(
            { from, quality, errMs, power: rng.next(), aim: rng.range(-1, 1), side: rng.next() < 0.5 ? 1 : -1 },
            c,
          );
          expect(isValidShot(from, plan.vel, c), `${JSON.stringify(from)} ${quality}`).toBe(true);
          n++;
        }
      }
      expect(n).toBe(300);
    });
  }

  it('판정이 좋을수록 빠르다', () => {
    const c = buildCourt('easy');
    const from = { x: 0.5, y: 0.8, z: 7.5 };
    const sp = (q: Quality, e: number) => planDrive({ from, quality: q, errMs: e, power: 1, aim: 0, side: 1 }, c).speed;
    expect(sp('perfect', 0)).toBeGreaterThan(sp('good', 80));
    expect(sp('good', 80)).toBeGreaterThan(sp('late', 200));
  });

  it('일찍 치면 크로스, 늦게 치면 스트레이트 (포핸드)', () => {
    const c = buildCourt('easy');
    const from = { x: 1.5, y: 0.8, z: 7.5 };
    const early = planDrive({ from, quality: 'good', errMs: -120, power: 1, aim: 0, side: 1 }, c).target.x;
    const late = planDrive({ from, quality: 'good', errMs: 120, power: 1, aim: 0, side: 1 }, c).target.x;
    expect(early).toBeLessThan(late);
    expect(early).toBeLessThan(0);
  });
});

it('타이밍 판정 경계', () => {
  const T = tuning.timing;
  expect(judge(0)).toBe('perfect');
  expect(judge(T.perfectMs)).toBe('perfect');
  expect(judge(-T.goodMs)).toBe('good');
  expect(judge(-T.goodMs - 1)).toBe('early');
  expect(judge(T.goodMs + 1)).toBe('late');
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
  it('목표 지점에 감속해서 도착', () => {
    const m = createMover(0, 6);
    for (let i = 0; i < 600; i++) moveStep(m, 1 / 120, c, null, { x: 2, z: 8 });
    expect(Math.hypot(m.x - 2, m.z - 8)).toBeLessThan(0.05);
  });
});
