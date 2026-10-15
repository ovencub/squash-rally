import { tuning } from '../config/tuning';

// 사용자 설정 (기획서 3-10 설정 화면). 브라우저 localStorage에 저장 — 실패해도 기본값으로 동작.
// M3 피드백: 자동 위치 보조 없음(모든 난이도 수동 이동), 스윙은 클릭이라 방향 반전 설정도 없음.

export type ShakeLevel = 'off' | 'weak' | 'normal';
export type BallSize = 'real' | 'normal' | 'big';
export type ControlMode = 'pc' | 'mobile';

/** 공 표시 배율: 실제 크기(40mm)는 화면에서 2~3px라 잘 안 보여 기본은 확대 */
export const BALL_SCALE: Record<BallSize, number> = { real: 1, normal: 3, big: 4.5 };

export interface Settings {
  volume: number;
  shake: ShakeLevel;
  /** 캐릭터 최고 이동 속도 (m/s) — 플레이 중에도 슬라이더로 조절 */
  moveSpeed: number;
  ballSize: BallSize;
  /** 조작 방식: PC(키보드·마우스) / 모바일(터치) */
  control: ControlMode;
  seenTutorial: boolean;
}

function defaultControl(): ControlMode {
  try {
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches ? 'mobile' : 'pc';
  } catch {
    return 'pc';
  }
}

const KEY = 'squash.settings';
const DEFAULTS: Settings = { volume: 0.8, shake: 'normal', moveSpeed: tuning.player.maxSpeed, ballSize: 'normal', control: 'pc', seenTutorial: false };

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      volume: saved.volume ?? DEFAULTS.volume,
      shake: saved.shake ?? DEFAULTS.shake,
      moveSpeed: saved.moveSpeed ?? DEFAULTS.moveSpeed,
      ballSize: saved.ballSize ?? DEFAULTS.ballSize,
      control: saved.control ?? defaultControl(),
      seenTutorial: !!saved.seenTutorialV2,
    };
  } catch {
    return { ...DEFAULTS, control: defaultControl() };
  }
}

export function saveSettings(s: Settings): void {
  try {
    // 조작이 바뀌어 튜토리얼은 다시 보여준다 (V2)
    localStorage.setItem(KEY, JSON.stringify({ volume: s.volume, shake: s.shake, moveSpeed: s.moveSpeed, ballSize: s.ballSize, control: s.control, seenTutorialV2: s.seenTutorial }));
  } catch {
    /* 저장 불가 환경(시크릿 창 등)은 무시 */
  }
}
