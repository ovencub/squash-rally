import { describe, expect, it } from 'vitest';
import { buildCourt } from '../src/config/court';
import { type Difficulty } from '../src/config/tuning';
import { isValidServe, planServe, serveBallFrom, serverSpot } from '../src/game/serve';

describe('서브는 항상 유효', () => {
  for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
    for (const side of ['right', 'left'] as const) {
      it(`${d} · ${side} 박스 · 다양성 -1..1`, () => {
        const c = buildCourt(d);
        const from = serveBallFrom(serverSpot(side, c));
        for (const v of [-1, -0.5, 0, 0.5, 1]) {
          expect(isValidServe(from, planServe(from, side, c, v), side, c), `variety ${v}`).toBe(true);
        }
      });
    }
  }
});
