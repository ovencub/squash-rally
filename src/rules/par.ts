import { type PlayerId, type ServeSide } from './rally';

// PAR(Point-A-Rally) 점수 규칙 (기획서 3-4). 순수 함수, 렌더/입력 의존 금지.
// - 랠리 승자 1점, 11점 선취, 10:10부터 2점 차
// - 3전 2선승
// - 랠리 승자가 다음 서브. 같은 선수가 연속 서브하면 박스 좌↔우 교대, 서브권이 넘어오면 오른쪽부터
// - 새 게임은 이전 게임 승자가 오른쪽에서 서브

export interface GameScore {
  A: number;
  B: number;
}

export interface MatchState {
  points: GameScore;
  games: GameScore;
  /** 끝난 게임들의 최종 점수 */
  history: GameScore[];
  server: PlayerId;
  serveSide: ServeSide;
  /** 방금 게임이 끝났으면 그 게임의 승자 */
  gameJustWon: PlayerId | null;
  winner: PlayerId | null;
}

export const POINTS_TO_WIN = 11;
export const GAMES_TO_WIN = 2;

export function newMatch(firstServer: PlayerId = 'A'): MatchState {
  return {
    points: { A: 0, B: 0 },
    games: { A: 0, B: 0 },
    history: [],
    server: firstServer,
    serveSide: 'right',
    gameJustWon: null,
    winner: null,
  };
}

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A');

export function isGameOver(p: GameScore): PlayerId | null {
  for (const id of ['A', 'B'] as const) {
    if (p[id] >= POINTS_TO_WIN && p[id] - p[other(id)] >= 2) return id;
  }
  return null;
}

/** 랠리 결과 반영 */
export function awardRally(s: MatchState, winner: PlayerId): MatchState {
  if (s.winner) return s;
  const points = { ...s.points, [winner]: s.points[winner] + 1 };
  let server = s.server;
  let serveSide: ServeSide = s.serveSide;
  if (winner === server) serveSide = serveSide === 'right' ? 'left' : 'right';
  else {
    server = winner;
    serveSide = 'right';
  }

  const gameWinner = isGameOver(points);
  if (!gameWinner) return { ...s, points, server, serveSide, gameJustWon: null };

  const games = { ...s.games, [gameWinner]: s.games[gameWinner] + 1 };
  const matchWinner = games[gameWinner] >= GAMES_TO_WIN ? gameWinner : null;
  return {
    points: { A: 0, B: 0 },
    games,
    history: [...s.history, points],
    server: gameWinner,
    serveSide: 'right',
    gameJustWon: gameWinner,
    winner: matchWinner,
  };
}

/** 10:10 이후 듀스 구간인가 (HUD 표시용) */
export function isDeuce(p: GameScore): boolean {
  return p.A >= POINTS_TO_WIN - 1 && p.B >= POINTS_TO_WIN - 1;
}
