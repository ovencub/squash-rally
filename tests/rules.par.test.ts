import { describe, expect, it } from 'vitest';
import { awardRally, isDeuce, newMatch, type MatchState } from '../src/rules/par';
import { type PlayerId } from '../src/rules/rally';

function play(s: MatchState, seq: string): MatchState {
  for (const c of seq) s = awardRally(s, c as PlayerId);
  return s;
}

describe('PAR 11점', () => {
  it('11:0이면 게임 종료', () => {
    const s = play(newMatch(), 'A'.repeat(11));
    expect(s.games).toEqual({ A: 1, B: 0 });
    expect(s.history[0]).toEqual({ A: 11, B: 0 });
    expect(s.points).toEqual({ A: 0, B: 0 });
    expect(s.gameJustWon).toBe('A');
  });

  it('11:9면 종료, 10:10부터는 2점 차', () => {
    expect(play(newMatch(), 'AB'.repeat(9) + 'AA').games.A).toBe(1); // 11:9
    let s = play(newMatch(), 'AB'.repeat(10)); // 10:10
    expect(isDeuce(s.points)).toBe(true);
    s = play(s, 'A'); // 11:10
    expect(s.games.A).toBe(0);
    s = play(s, 'B'); // 11:11
    s = play(s, 'A'); // 12:11
    expect(s.games.A).toBe(0);
    s = play(s, 'A'); // 13:11
    expect(s.games.A).toBe(1);
    expect(s.history[0]).toEqual({ A: 13, B: 11 });
  });
});

describe('3전 2선승', () => {
  it('2:0', () => {
    const s = play(newMatch(), 'A'.repeat(22));
    expect(s.winner).toBe('A');
  });
  it('3게임까지 가서 종료', () => {
    let s = play(newMatch(), 'A'.repeat(11));
    s = play(s, 'B'.repeat(11));
    expect(s.winner).toBeNull();
    expect(s.games).toEqual({ A: 1, B: 1 });
    s = play(s, 'AB'.repeat(10) + 'BB');
    expect(s.winner).toBe('B');
    expect(s.history.map((h) => [h.A, h.B])).toEqual([
      [11, 0],
      [0, 11],
      [10, 12],
    ]);
  });
  it('종료 후에는 점수 변화 없음', () => {
    const s = play(newMatch(), 'A'.repeat(22));
    expect(awardRally(s, 'B')).toBe(s);
  });
});

describe('서브권 · 서비스 박스', () => {
  it('서버가 이기면 박스 좌우 교대', () => {
    let s = newMatch('A');
    expect(s.serveSide).toBe('right');
    s = play(s, 'A');
    expect(s.server).toBe('A');
    expect(s.serveSide).toBe('left');
    s = play(s, 'A');
    expect(s.serveSide).toBe('right');
  });
  it('리시버가 이기면 서브권 이동, 오른쪽부터', () => {
    let s = play(newMatch('A'), 'A'); // A 왼쪽 차례
    s = play(s, 'B');
    expect(s.server).toBe('B');
    expect(s.serveSide).toBe('right');
  });
  it('새 게임은 이전 게임 승자가 오른쪽에서 서브', () => {
    let s = play(newMatch('A'), 'B'.repeat(11));
    expect(s.server).toBe('B');
    expect(s.serveSide).toBe('right');
    s = play(newMatch('B'), 'A'.repeat(11));
    expect(s.server).toBe('A');
  });
});
