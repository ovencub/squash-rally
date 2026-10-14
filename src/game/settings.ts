import { tuning } from '../config/tuning';

// 사용자 설정 (기획서 3-10 설정 화면). 브라우저 localStorage에 저장 — 실패해도 기본값으로 동작.
// M3 피드백: 자동 위치 보조 없음(모든 난이도 수동 이동), 스윙은 클릭이라 방향 반전 설정도 없음.

export type ShakeLevel = 'off' | 'weak' | 'normal';

export interface Settings {
  volume: number;
  shake: ShakeLevel;
  /** 캐릭터 최고 이동 속도 (m/s) — 플레이 중에도 슬라이더로 조절 */
  moveSpeed: number;
  seenTutorial: boolean;
}

const KEY = 'squash.settings';
const DEFAULTS: Settings = { volume: 0.8, shake: 'normal', moveSpeed: tuning.player.maxSpeed, seenTutorial: false };

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      volume: saved.volume ?? DEFAULTS.volume,
      shake: saved.shake ?? DEFAULTS.shake,
      moveSpeed: saved.moveSpeed ?? DEFAULTS.moveSpeed,
      seenTutorial: !!saved.seenTutorialV2,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    // 조작이 바뀌어 튜토리얼은 다시 보여준다 (V2)
    localStorage.setItem(KEY, JSON.stringify({ volume: s.volume, shake: s.shake, moveSpeed: s.moveSpeed, seenTutorialV2: s.seenTutorial }));
  } catch {
    /* 저장 불가 환경(시크릿 창 등)은 무시 */
  }
}
