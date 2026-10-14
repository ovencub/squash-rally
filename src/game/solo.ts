import { type Difficulty } from '../config/tuning';
import { type Quality } from './swing';

// 1인 모드 기록 (기획서 3-5). 점수 = 연속 랠리(콤보), 실점하면 콤보만 0.

export class SoloSession {
  combo = 0;
  bestThisRun = 0;
  hits = 0;
  perfects = 0;
  misses = 0;
  readonly bestStored: number;

  constructor(readonly difficulty: Difficulty) {
    this.bestStored = loadBest(difficulty);
  }

  /** 새 최고 기록이면 true */
  onHit(q: Quality): boolean {
    this.hits++;
    if (q === 'perfect') this.perfects++;
    this.combo++;
    const wasBest = this.combo > Math.max(this.bestStored, this.bestThisRun);
    this.bestThisRun = Math.max(this.bestThisRun, this.combo);
    if (wasBest) saveBest(this.difficulty, this.combo);
    return wasBest;
  }

  onMiss(): void {
    this.misses++;
    this.combo = 0;
  }

  get best(): number {
    return Math.max(this.bestStored, this.bestThisRun);
  }

  get perfectRate(): number {
    return this.hits ? this.perfects / this.hits : 0;
  }
}

const key = (d: Difficulty) => `squash.best.${d}`;

export function loadBest(d: Difficulty): number {
  try {
    return Number(localStorage.getItem(key(d))) || 0;
  } catch {
    return 0;
  }
}

function saveBest(d: Difficulty, v: number): void {
  try {
    localStorage.setItem(key(d), String(v));
  } catch {
    /* 무시 */
  }
}
