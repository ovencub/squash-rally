import { type Difficulty } from '../config/tuning';

// 사용자 설정 (기획서 3-10 설정 화면). 브라우저 localStorage에 저장 — 실패해도 기본값으로 동작.

export type ShakeLevel = 'off' | 'weak' | 'normal';
export type AssistMode = 'easyOnly' | 'on' | 'off';

export interface Settings {
  volume: number;
  shake: ShakeLevel;
  assist: AssistMode;
  seenTutorial: boolean;
  /** 기획서 6-2: 스윙 방향 반전 */
  invertStroke: boolean;
}

const KEY = 'squash.settings';
const DEFAULTS: Settings = { volume: 0.8, shake: 'weak', assist: 'easyOnly', seenTutorial: false, invertStroke: false };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장 불가 환경(시크릿 창 등)은 무시 */
  }
}

export function assistEnabled(s: Settings, d: Difficulty): boolean {
  return s.assist === 'on' || (s.assist === 'easyOnly' && d === 'easy');
}
