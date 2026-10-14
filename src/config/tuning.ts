// 모든 튜닝값은 이 파일 하나에 모은다. 디버그 패널(` 키)이 이 객체를 실시간으로 수정하므로
// 다른 모듈은 값을 캐시하지 말고 매번 읽을 것.

export type Difficulty = 'easy' | 'normal' | 'hard';

export const tuning = {
  game: {
    title: 'SQUASH RALLY',
    seed: 20261015,
  },

  court: {
    // 기획서 3-2. 공 물리는 동일, 코트만 줄어든다.
    // easy는 M0 피드백("지금보다 커도 좋다")으로 실제 규격보다 약간 크게 시작.
    scale: {
      easy: { length: 1.15, width: 1.12 },
      normal: { length: 0.85, width: 0.9 },
      hard: { length: 0.7, width: 0.8 },
    } as Record<Difficulty, { length: number; width: number }>,
    // M3 결정(A안): 난이도별 게임 진행 속도 배율. 공·물리 시간이 이만큼 빨리 흐른다 (캐릭터 이동은 실제 시간 그대로)
    // → 좁은 코트에서 덜 움직여도 되는 대신 반응 시간이 짧아진다.
    gameSpeed: { easy: 1.0, normal: 1.15, hard: 1.35 } as Record<Difficulty, number>,
    // 기획서 6-3 미결정: 높이 라인(아웃/서비스/틴)도 길이 배율로 줄일지
    scaleHeightLines: false,
    // 렌더링용 벽 높이(아웃 라인 위 여유)
    wallMarginAbove: 0.45,
    // 라인 폭(실제 50mm). 라인 위 = 아웃/폴트 판정에 사용
    lineWidth: 0.05,
  },

  physics: {
    substepHz: 240, // 고정 시뮬레이션 주파수
    gravity: 9.81,
    ballRadius: 0.02, // 실제 40mm 공 (판정용). 화면에는 fx.ballVisualScale 배로 크게 그림
    drag: 0.016, // 2차 공기저항 계수 k (가속도 = -k|v|v)
    // 면별 반발계수 (법선 속도 유지 비율)
    restitution: { front: 0.62, side: 0.6, back: 0.55, floor: 0.5, tin: 0.12 },
    // 면별 접선 속도 유지 비율 (마찰)
    tangentRetain: { wall: 0.88, floor: 0.8 },
    rollThreshold: 0.6, // 바닥 법선 속도가 이보다 작으면 굴러감(= 추가 바운드로 간주)
    rollFriction: 1.5, // 구를 때 감속 (m/s²)
    maxSubstepsPerFrame: 24,
  },

  camera: {
    // 뒷벽(유리) 바깥 기준 위치
    height: 6.4, // m, 바닥 기준
    backOffset: 5.0, // m, 뒷벽에서 뒤로
    lookAtHeight: 1.0, // m
    lookAtZRatio: 0.3, // 0 = 앞벽, 1 = 뒷벽
    // 플레이어 추종 (조금만, 부드럽게)
    followX: 0.35, // 플레이어 x 이동량 중 카메라가 따라가는 비율
    followZ: 0.15,
    followMaxX: 0.8, // m, 기준 위치에서 최대 이탈
    followMaxZ: 0.5,
    followSmoothing: 3.0, // 1/s, 클수록 빨리 따라감
    // 코트 전체가 보이도록 FOV 자동 계산 시 여백 비율
    fitMargin: 0.04,
    fitTopExtra: 0.8, // 앞벽 위 스폰서 보드까지 화면에 넣는 높이(m)
    hudTopReserve: 0.08, // 화면 위쪽 이 비율은 HUD(스코어보드) 자리로 비워 둠
    minFov: 35,
    maxFov: 80,
  },

  // ── 조작 (M3 피드백: 클릭 스윙. 우클릭 = 포핸드, 좌클릭 = 백핸드, 커서 위치 = 방향) ──
  input: {
    swingCooldownMs: 300, // 맞힌 뒤 다음 스윙까지
    whiffCooldownMs: 450, // 헛스윙 뒤 (연타 방지)
    // 커서가 캐릭터 바로 옆/뒤에 있어 앞벽 방향을 못 정할 때 쓰는 최대 좌우 기울기 (앞으로 1m당 m)
    maxAimSlope: 1.6,
  },

  // ── 타격 범위 · 배점 ──
  timing: {
    reach: 1.4, // 타격 범위 반지름: 캐릭터 중심에서 공까지 수평 거리 (m)
    sweetRatio: 0.5, // 범위 안에서 가장 좋은 배점이 나는 원의 반지름 비율 (0.5 = 반지름의 50% 지점)
    minDistScore: 0.15, // 범위 중심/가장자리에서의 최저 거리 배점
    // 타이밍 배점: 이상적인 순간(공이 최적 원·높이에 가장 가까울 때) 대비 오차
    perfectMs: 55, // 이내면 타이밍 배점 1
    goodMs: 130, // 이내면 1 → 0.6
    worstMs: 320, // 이 오차에서 최저 0.25
    idealHeight: 0.85,
    minHeight: 0.08,
    maxHeight: 2.1,
  },

  // ── 드라이브 샷 (항상 유효하게 보정됨) ──
  shots: {
    // 배점(거리 × 타이밍, 0..1)에 따라 속력과 앞벽 목표 높이를 보간 → 잘 칠수록 빠르고 낮고 깊게
    minSpeed: 12,
    maxSpeed: 26,
    highWall: 2.7, // 배점 0일 때 앞벽 목표 높이
    lowWall: 1.9, // 배점 1일 때
    perfectAt: 0.8, // 배점 이상이면 PERFECT
    goodAt: 0.5, // 이상이면 GOOD, 미만이면 약한 타구
    wallMargin: 0.45, // 앞벽 목표 x를 옆벽에서 최소 이만큼 띄움
    minWallHeight: 0.95, // 보정 시 앞벽 목표 최저 높이 (틴 위)
    safetyTries: 10,
  },

  player: {
    // 기본 최고 속도 (m/s). 사용자가 설정/플레이 중 슬라이더로 바꿀 수 있음 (settings.moveSpeed)
    maxSpeed: 6.3,
    moveSpeedMin: 3.5,
    moveSpeedMax: 9.0,
    accel: 38, // m/s²
    decel: 46,
    radius: 0.3,
    squeakMinSpeed: 3.0, // 이 속도 이상에서 급정지/급전환하면 스퀵
    squeakTurnDeg: 100,
    squeakCooldownMs: 400,
  },

  // ── AI 상대 (기획서 3-6): 같은 물리·룰·이동 상한, 반응/위치/타이밍 오차로 실력 차등 ──
  ai: {
    level: {
      // reactionMs: 상대가 친 뒤 움직이기 시작할 때까지, standErrM: 서는 위치 오차(표준편차),
      // timingSdMs: 스윙 타이밍 오차(표준편차), speedRatio: 기본 이동 속도 대비, aim: 노리는 방향
      // missChance: 타구마다 판단 실수(한참 늦게 휘두름)로 놓칠 확률
      easy: { reactionMs: 420, standErrM: 0.5, timingSdMs: 110, speedRatio: 0.72, missChance: 0.16, aim: 'center' },
      normal: { reactionMs: 280, standErrM: 0.28, timingSdMs: 65, speedRatio: 0.88, missChance: 0.08, aim: 'mixed' },
      hard: { reactionMs: 170, standErrM: 0.12, timingSdMs: 38, speedRatio: 1.0, missChance: 0.035, aim: 'away' },
    } as Record<
      Difficulty,
      { reactionMs: number; standErrM: number; timingSdMs: number; speedRatio: number; missChance: number; aim: 'center' | 'mixed' | 'away' }
    >,
    serveDelayMs: 1000, // AI 서브 전 대기
    // AI가 칠 때 타격감은 약하게 (내가 칠 때가 더 짜릿하게)
    hitstopMs: 25,
    shakeRatio: 0.25,
  },

  match: {
    pointPauseMs: 1700, // 랠리 종료 → 다음 서브 준비
    gamePauseMs: 2600, // 게임 종료 연출
    minSeparation: 0.75, // 두 선수가 겹치지 않는 최소 거리 (m)
  },

  solo: {
    feedDelayMs: 1100, // 실점 후 다음 공까지
    feedFlightTime: 1.0, // 피드 공 비행 시간(s)
  },

  fx: {
    ballVisualScale: 4, // 화면상 공 크기 배율 (판정에는 영향 없음)
    hitstopMs: { perfect: 110, good: 75, off: 45 }, // 캐릭터·라켓까지 함께 멈춤
    // 화면 진동: 설정 '약'/'보통' 별 최대 진폭(m)과 지속시간
    shake: { weak: 0.055, normal: 0.09, durationMs: 170 },
    flashMs: 110,
    swingTrailMs: 220,
    ballTrailMaxLen: 14, // 잔상 최대 점 개수 (빠를수록 길게)
    wallMarkMs: 1400,
    timingRingStartRadius: 1.4,
    slowmoOnMiss: 0.35, // 실점 순간 슬로모 배율
    slowmoMs: 450,
  },

  audio: {
    master: 0.8,
    pitchJitter: 0.05, // ±5%
    speedForFullVolume: 22, // m/s
    // M5: 큰 돔 체육관 잔향
    reverb: 0.55, // 잔향 출력 크기 (0 = 없음)
    reverbSeconds: 2.8, // 잔향 길이 (RT60)
    stepStride: 0.85, // 이 거리(m)마다 발소리
  },

  debug: {
    showPrediction: false,
    showContacts: false,
    predictSeconds: 3,
    timeScale: 1, // 슬로모 (1 = 정상)
    autoplay: false, // 자동 플레이(봇): 타점으로 이동해 이상적인 순간에 맞는 손으로 클릭
    autoplayErrorMs: 0, // 봇 스윙 타이밍 오차 (판정 확인용)
    closeup: 'off' as 'off' | 'side' | 'back' | 'front', // 캐릭터 동작 확인용 근접 카메라
    // 공 발사기: 캐릭터 위치에서 앞벽(-z) 방향으로 발사
    launcher: { y: 0.9, speed: 18, elevationDeg: 12, aimDeg: 0, serve: false },
  },
};
