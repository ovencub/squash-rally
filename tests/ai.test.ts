import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config/tuning';
import { aiMissChance } from '../src/game/ai';

// AI가 공을 놓칠 확률: 플레이어가 멀리, 빨리 보낼수록 올라가야 한다
describe('AI 실수 확률', () => {
  const L = tuning.ai.level;
  it('여유 있는 느린 공은 거의 다 받는다', () => {
    for (const lv of Object.values(L)) expect(aiMissChance(lv, 0.3, 0)).toBeLessThanOrEqual(0.05);
  });
  it('멀리 보낼수록(급할수록) 놓칠 확률이 올라간다', () => {
    const lv = L.normal;
    const ps = [0.3, 0.6, 0.8, 1.0].map((p) => aiMissChance(lv, p, 0.5));
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThan(ps[i - 1]);
  });
  it('빠르게 칠수록 놓칠 확률이 올라간다', () => {
    const lv = L.normal;
    expect(aiMissChance(lv, 0.6, 1)).toBeGreaterThan(aiMissChance(lv, 0.6, 0));
  });
  it('어려움 AI는 같은 공을 더 잘 받는다', () => {
    for (const [p, s] of [
      [0.5, 0.5],
      [0.9, 1],
    ]) {
      expect(aiMissChance(L.hard, p, s)).toBeLessThan(aiMissChance(L.normal, p, s));
      expect(aiMissChance(L.normal, p, s)).toBeLessThan(aiMissChance(L.easy, p, s));
    }
  });
  it('최대 90%', () => {
    expect(aiMissChance(L.easy, 5, 1)).toBeLessThanOrEqual(0.9);
  });
});
