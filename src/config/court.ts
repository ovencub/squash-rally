import { tuning, type Difficulty } from './tuning';

// WSF 규격 (배율 1.0)
export const WSF = {
  length: 9.75,
  width: 6.4,
  frontOutHeight: 4.57,
  backOutHeight: 2.13,
  serviceLineHeight: 1.78,
  tinHeight: 0.48,
  shortLineZ: 5.44,
  serviceBoxSize: 1.6,
} as const;

export interface CourtDims {
  difficulty: Difficulty;
  length: number;
  width: number;
  frontOutHeight: number;
  backOutHeight: number;
  serviceLineHeight: number;
  tinHeight: number;
  shortLineZ: number;
  serviceBoxSize: number;
}

export function buildCourt(difficulty: Difficulty): CourtDims {
  const s = tuning.court.scale[difficulty];
  const h = tuning.court.scaleHeightLines ? s.length : 1;
  return {
    difficulty,
    length: WSF.length * s.length,
    width: WSF.width * s.width,
    frontOutHeight: WSF.frontOutHeight * h,
    backOutHeight: WSF.backOutHeight * h,
    serviceLineHeight: WSF.serviceLineHeight * h,
    tinHeight: WSF.tinHeight * h,
    shortLineZ: WSF.shortLineZ * s.length,
    serviceBoxSize: WSF.serviceBoxSize * Math.min(s.length, s.width),
  };
}

/** 옆벽 아웃 라인 높이: 앞(z=0) frontOut → 뒤(z=L) backOut 선형 */
export function sideOutHeight(c: CourtDims, z: number): number {
  const t = Math.min(1, Math.max(0, z / c.length));
  return c.frontOutHeight + (c.backOutHeight - c.frontOutHeight) * t;
}

/** "T" 위치 (숏 라인과 하프코트 라인 교차점) */
export function tPosition(c: CourtDims): { x: number; z: number } {
  return { x: 0, z: c.shortLineZ };
}
