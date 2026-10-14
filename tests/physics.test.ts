import { describe, expect, it } from 'vitest';
import { buildCourt } from '../src/config/court';
import { tuning, type Difficulty } from '../src/config/tuning';
import { launchPresets } from '../src/debug/presets';
import { createBall, stepBall, type BallContact } from '../src/physics/ball';
import { launchVelocity, predict } from '../src/physics/predict';
import { simulateShot } from './helpers';

const dt = 1 / tuning.physics.substepHz;

describe('결정성', () => {
  it('같은 입력 → 같은 접촉 목록', () => {
    const spec = { from: { x: 0.8, y: 0.9, z: 7 }, speed: 21, elevationDeg: 11, aimDeg: -13 };
    const a = simulateShot(spec, 4).contacts;
    const b = simulateShot(spec, 4).contacts;
    expect(a.length).toBeGreaterThan(2);
    expect(b).toEqual(a);
  });

  it('예측(predict) 결과 = 실제 시뮬레이션', () => {
    const court = buildCourt('normal');
    const ball = createBall({ x: -1, y: 1, z: 6 }, launchVelocity(19, 15, 12));
    const pred = predict(ball, court, 3, 1);
    const real: BallContact[] = [];
    for (let i = 0; i < Math.ceil(3 / dt); i++) {
      stepBall(ball, dt, court, (c) => real.push(c));
      if (ball.rolling && Math.hypot(ball.vel.x, ball.vel.z) < 0.05) break;
    }
    expect(pred.contacts).toEqual(real);
  });
});

describe('충돌', () => {
  it('아주 빠른 공(60m/s)도 벽을 통과하지 않는다', () => {
    const court = buildCourt('hard');
    const r = tuning.physics.ballRadius;
    for (const aim of [-40, -20, 0, 20, 40]) {
      const ball = createBall({ x: 0, y: 1.5, z: court.length / 2 }, launchVelocity(60, 5, aim));
      for (let i = 0; i < 2 / dt; i++) {
        stepBall(ball, dt, court, () => {});
        const p = ball.pos;
        expect(p.x).toBeGreaterThanOrEqual(-court.width / 2 + r - 1e-9);
        expect(p.x).toBeLessThanOrEqual(court.width / 2 - r + 1e-9);
        expect(p.z).toBeGreaterThanOrEqual(r - 1e-9);
        expect(p.z).toBeLessThanOrEqual(court.length - r + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(r - 1e-9);
      }
    }
  });

  it('벽에 맞으면 속도가 줄어든다', () => {
    const { contacts } = simulateShot({ from: { x: 0, y: 1.5, z: 6 }, speed: 18, elevationDeg: 8 }, 1);
    const front = contacts.find((c) => c.surface === 'front')!;
    expect(front).toBeDefined();
    expect(front.normalSpeed).toBeGreaterThan(10);
  });

  it('틴 높이 아래 앞벽 접촉은 tin 면으로 보고된다', () => {
    const { contacts, court } = simulateShot({ from: { x: 0, y: 0.3, z: 2 }, speed: 18, elevationDeg: 0 }, 1);
    const tin = contacts.find((c) => c.surface === 'tin')!;
    expect(tin).toBeDefined();
    expect(tin.point.y - tuning.physics.ballRadius).toBeLessThanOrEqual(court.tinHeight);
  });
});

describe('디버그 발사기 프리셋이 기대 판정을 낸다 (모든 난이도)', () => {
  for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
    for (const p of launchPresets(buildCourt(d))) {
      it(`${d} · ${p.label} → ${p.expect}`, () => {
        const { rally } = simulateShot({ ...p, difficulty: d, serveSide: 'right' }, 6);
        if (p.expect === 'VALID') {
          // 앞벽까지 유효하게 도달 → 결국 받지 못해 DOUBLE_BOUNCE로 끝나야 함 (치는 쪽 득점)
          expect(rally.result?.reason).toBe('DOUBLE_BOUNCE');
          expect(rally.result?.winner).toBe('A');
        } else {
          expect(rally.result?.reason).toBe(p.expect);
        }
      });
    }
  }
});
