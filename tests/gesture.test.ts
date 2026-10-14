import { afterEach, describe, expect, it } from 'vitest';
import { tuning } from '../src/config/tuning';
import { GestureTracker } from '../src/input/gesture';

/** (t, x, y) 경로를 따라 움직이고 처음 나온 스윙을 돌려준다 */
function drag(path: [number, number, number][]) {
  const g = new GestureTracker();
  const [t0, x0, y0] = path[0];
  g.down(t0, x0, y0);
  for (const [t, x, y] of path.slice(1, -1)) {
    const s = g.move(t, x, y);
    if (s) return s;
  }
  const [t, x, y] = path[path.length - 1];
  return g.move(t, x, y) ?? g.up(t, x, y);
}

describe('제스처', () => {
  afterEach(() => {
    tuning.input.invertStroke = false;
  });

  it('↓당겼다 ↑밀기 → 스트로크 스윙', () => {
    const s = drag([
      [0, 0.5, 0.5],
      [60, 0.5, 0.58],
      [100, 0.5, 0.5],
      [140, 0.5, 0.4],
    ]);
    expect(s?.kind).toBe('stroke');
  });

  it('당기지 않고 바로 밀어도 인정', () => {
    const s = drag([
      [0, 0.5, 0.6],
      [50, 0.5, 0.52],
      [90, 0.5, 0.45],
    ]);
    expect(s?.kind).toBe('stroke');
  });

  it('아래로만 내리면 스윙 아님', () => {
    const s = drag([
      [0, 0.5, 0.4],
      [60, 0.5, 0.5],
      [120, 0.5, 0.6],
    ]);
    expect(s).toBeNull();
  });

  it('짧은 클릭 → 가벼운 스윙', () => {
    const s = drag([
      [0, 0.5, 0.5],
      [80, 0.502, 0.5],
    ]);
    expect(s?.kind).toBe('tap');
    expect(s?.power).toBe(tuning.input.tapPower);
  });

  it('오래 누르고 있다 떼면 스윙 아님', () => {
    const s = drag([
      [0, 0.5, 0.5],
      [600, 0.5, 0.5],
    ]);
    expect(s).toBeNull();
  });

  it('빠를수록 파워가 크고 상한은 1', () => {
    const slow = drag([
      [0, 0.5, 0.6],
      [150, 0.5, 0.54],
    ])!;
    const fast = drag([
      [0, 0.5, 0.6],
      [30, 0.5, 0.4],
    ])!;
    expect(fast.power).toBeGreaterThan(slow.power);
    expect(fast.power).toBeLessThanOrEqual(1);
  });

  it('오른쪽 위로 밀면 aim +', () => {
    const s = drag([
      [0, 0.5, 0.6],
      [60, 0.56, 0.5],
    ])!;
    expect(s.aim).toBeGreaterThan(0.3);
  });

  it('반전 설정이면 위→아래가 스윙', () => {
    tuning.input.invertStroke = true;
    const s = drag([
      [0, 0.5, 0.4],
      [60, 0.5, 0.5],
    ]);
    expect(s?.kind).toBe('stroke');
  });

  it('한 번 누른 동안 연속 스윙은 다시 당겨야 함', () => {
    const g = new GestureTracker();
    g.down(0, 0.5, 0.6);
    expect(g.move(50, 0.5, 0.5)).not.toBeNull();
    expect(g.move(100, 0.5, 0.4)).toBeNull(); // 계속 위로 → 무시
    g.move(250, 0.5, 0.5);
    g.move(300, 0.5, 0.56); // 다시 당김
    expect(g.move(350, 0.5, 0.45)).not.toBeNull();
  });
});
