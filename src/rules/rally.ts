import { sideOutHeight, type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';
import { type BallContact } from '../physics/ball';

// 랠리 판정 순수 상태머신. 렌더/입력 의존 금지.
// 판정 원칙: 라인 위 = 아웃, 틴 윗선 = 틴, 서비스 라인 위 = 폴트, 서브 바닥 라인 위 = 폴트.

export type PlayerId = 'A' | 'B';
export type FaultReason = 'OUT' | 'TIN' | 'DOWN' | 'DOUBLE_BOUNCE' | 'FAULT';
export type ServeSide = 'left' | 'right';

export interface RallyResult {
  loser: PlayerId;
  winner: PlayerId;
  reason: FaultReason;
  /** 판정을 만든 접촉 (연출 위치용). 없으면 undefined */
  contact?: BallContact;
}

export interface RallyState {
  /** 1인 모드면 1: 모든 실점은 A의 실점, 상대도 A */
  players: 1 | 2;
  /** waiting: 서브 전, toFront: 타격 후 앞벽 대기, returning: 앞벽 맞고 돌아오는 중, over: 종료 */
  phase: 'waiting' | 'toFront' | 'returning' | 'over';
  lastHitter: PlayerId | null;
  /** 현재 공이 서브 공인지 (리시버가 치면 해제) */
  isServe: boolean;
  server: PlayerId;
  serveSide: ServeSide;
  /** 앞벽 맞은 뒤 바닥 바운드 수 */
  floorBounces: number;
  result: RallyResult | null;
}

export function newRally(players: 1 | 2, server: PlayerId = 'A', serveSide: ServeSide = 'right'): RallyState {
  return { players, phase: 'waiting', lastHitter: null, isServe: true, server, serveSide, floorBounces: 0, result: null };
}

export function opponent(p: PlayerId, s: RallyState): PlayerId {
  if (s.players === 1) return 'A';
  return p === 'A' ? 'B' : 'A';
}

function end(s: RallyState, loser: PlayerId, reason: FaultReason, contact?: BallContact): RallyState {
  const winner = s.players === 1 ? 'A' : opponent(loser, s);
  return { ...s, phase: 'over', result: { loser, winner, reason, contact } };
}

/** 선수가 공을 쳤다. serve=true면 서브 타격. */
export function applyHit(s: RallyState, hitter: PlayerId, serve = false): RallyState {
  if (s.phase === 'over') return s;
  if (serve) {
    return { ...s, phase: 'toFront', lastHitter: hitter, isServe: true, server: hitter, floorBounces: 0 };
  }
  // 리시버가 서브를 바운드 전에 발리하면 서브는 유효 → 일반 랠리로 전환
  return { ...s, phase: 'toFront', lastHitter: hitter, isServe: false, floorBounces: 0 };
}

/** 공의 면 접촉을 반영. 실점이 나면 phase='over', result 채워짐. */
export function applyContact(s: RallyState, ct: BallContact, c: CourtDims): RallyState {
  if (s.phase === 'over' || s.phase === 'waiting' || !s.lastHitter) return s;
  const r = tuning.physics.ballRadius;
  const hitter = s.lastHitter;
  const { x, y, z } = ct.point;

  switch (ct.surface) {
    case 'tin':
      return end(s, hitter, s.isServe && s.phase === 'toFront' ? 'FAULT' : 'TIN', ct);

    case 'front': {
      if (y + r >= c.frontOutHeight) return end(s, hitter, s.isServe ? 'FAULT' : 'OUT', ct);
      if (s.phase === 'toFront') {
        if (s.isServe && y - r <= c.serviceLineHeight) return end(s, hitter, 'FAULT', ct);
        return { ...s, phase: 'returning', floorBounces: 0 };
      }
      return s;
    }

    case 'left':
    case 'right':
    case 'back': {
      const out = ct.surface === 'back' ? c.backOutHeight : sideOutHeight(c, z);
      if (y + r >= out) return end(s, hitter, s.isServe ? 'FAULT' : 'OUT', ct);
      // 서브는 앞벽에 직접 맞아야 한다
      if (s.isServe && s.phase === 'toFront') return end(s, hitter, 'FAULT', ct);
      return s;
    }

    case 'floor': {
      if (s.phase === 'toFront') return end(s, hitter, s.isServe ? 'FAULT' : 'DOWN', ct);
      const bounces = s.floorBounces + 1;
      if (bounces === 1 && s.isServe && !inReceiveQuarter(x, z, s.serveSide, c)) return end(s, hitter, 'FAULT', ct);
      if (bounces >= 2) return end(s, opponent(hitter, s), 'DOUBLE_BOUNCE', ct);
      return { ...s, floorBounces: bounces };
    }
  }
}

/**
 * 서브 첫 바운드 유효 구역: 숏 라인 뒤 + 서버 박스 반대편 하프. 라인 위는 폴트.
 * (뒷벽/옆벽 경계는 물리적으로 넘을 수 없음)
 */
export function inReceiveQuarter(x: number, z: number, serveSide: ServeSide, c: CourtDims): boolean {
  const hl = tuning.court.lineWidth / 2;
  if (z <= c.shortLineZ + hl) return false;
  return serveSide === 'right' ? x < -hl : x > hl;
}

/** 서비스 박스 중심 좌표 */
export function serviceBoxCenter(side: ServeSide, c: CourtDims): { x: number; z: number } {
  const s = side === 'right' ? 1 : -1;
  return { x: s * (c.width / 2 - c.serviceBoxSize / 2), z: c.shortLineZ + c.serviceBoxSize / 2 };
}

/** 앞벽에서 나온 공을 받아야 하는 상태로 랠리 시작 (1인 모드 피드 공) */
export function feedRally(players: 1 | 2, receiver: PlayerId): RallyState {
  const s = newRally(players, receiver);
  // 피드 공은 receiver가 받아야 하므로 마지막 타자 = 상대
  return { ...s, phase: 'returning', lastHitter: opponent(receiver, s), isServe: false };
}
