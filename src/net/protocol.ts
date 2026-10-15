import { type Difficulty } from '../config/tuning';
import { type Surface, type Vec3 } from '../physics/ball';
import { type FaultReason, type PlayerId, type ServeSide } from '../rules/rally';

// 온라인 1:1 대전 메시지 (WebRTC 데이터 채널, 순서 보장).
// 원칙
// - 공 궤적은 결정적: 친 사람이 (출발 위치, 속도)만 보내면 양쪽이 같은 물리로 같은 궤적을 계산한다.
// - 타격 판정은 친 사람 화면에서 (내가 본 그대로 판정).
// - 랠리 결과는 "받아야 할 차례인 사람" 화면에서 확정해 보낸다 (투바운드 = 받는 사람이 놓친 것).
// - 점수(PAR)는 같은 순서의 랠리 결과로 양쪽이 각자 계산 → 항상 같다.

export const PROTOCOL_VERSION = 1;

export type NetMsg =
  | { t: 'hello'; v: number }
  | { t: 'start'; difficulty: Difficulty }
  | { t: 'pos'; x: number; z: number; vx: number; vz: number }
  | {
      t: 'hit';
      by: PlayerId;
      from: Vec3;
      vel: Vec3;
      serve: boolean;
      serveSide: ServeSide;
      hand: 'fore' | 'back';
      aim: { x: number; y: number };
      /** 친 쪽 히트스톱(ms): 그동안 친 쪽 공은 멈춰 있으므로 지연 보정에서 뺀다 */
      stopMs: number;
      grade: 'perfect' | 'good' | 'weak';
    }
  | { t: 'whiff'; hand: 'fore' | 'back' }
  | { t: 'rally'; winner: PlayerId; reason: FaultReason; at?: Vec3; surface?: Surface }
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | { t: 'rematch' }
  | { t: 'bye' };

/** Game이 온라인 대전에서 쓰는 연결 인터페이스 */
export interface OnlineLink {
  me: PlayerId;
  send: (m: NetMsg) => void;
  /** 편도 지연 추정 (ms) */
  latencyMs: () => number;
}
