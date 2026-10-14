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
    minFov: 35,
    maxFov: 80,
  },

  // ── 조작 (M1 피드백: 스윙은 항상 드라이브) ──
  input: {
    // 위로 미는 스트로크 인식: 최근 strokeWindowMs 동안 화면 높이 대비 이만큼 위로 움직이면 스윙
    strokeMinDist: 0.05, // 화면 높이 비율
    strokeWindowMs: 160,
    maxStrokeSpeed: 3.0, // 화면 높이/초. 이 이상은 파워 1.0 (상한)
    tapMaxMs: 220, // 이보다 짧고
    tapMaxDist: 0.02, // 이보다 덜 움직이면 클릭(가볍게)
    tapPower: 0.6,
    aimFromStroke: 0.6, // 스트로크 좌우 기울기가 조준에 주는 영향 (m, 앞벽 기준)
    // 기획서 6-2: 반전하면 위→아래 스트로크가 스윙
    invertStroke: false,
    bufferMs: 140, // 공이 닿는 범위에 들어오기 전 이만큼 일찍 휘둘러도 인정
    swingCooldownMs: 320,
  },

  // ── 타이밍 판정 ──
  timing: {
    perfectMs: 55,
    goodMs: 130,
    // 이상적인 타점: 캐릭터 옆으로 이 거리, 이 높이
    idealSideDist: 0.65,
    idealHeight: 0.85,
    reach: 1.35, // 캐릭터 중심에서 공까지 수평 거리 한계 (m)
    minHeight: 0.08,
    maxHeight: 2.1,
  },

  // ── 드라이브 샷 (항상 유효하게 보정됨) ──
  shots: {
    // 판정별 기본 속력(m/s)과 앞벽 목표 높이(m). 속도 차이가 확실히 느껴지게 폭을 넓게.
    perfect: { speed: 24, wallHeight: 2.0 },
    good: { speed: 19, wallHeight: 2.2 },
    off: { speed: 14, wallHeight: 2.6 }, // EARLY / LATE
    powerMin: 0.82, // 스트로크 파워 0일 때 속력 배율 (1일 때 1.0)
    // 일찍 치면 크로스, 늦게 치면 스트레이트 (앞벽 목표 x를 코트 폭 비율만큼 이동)
    timingAngle: 0.32,
    wallMargin: 0.45, // 앞벽 목표 x를 옆벽에서 최소 이만큼 띄움
    minWallHeight: 0.95, // 보정 시 앞벽 목표 최저 높이 (틴 위)
    safetyTries: 10,
  },

  player: {
    maxSpeed: 5.2, // m/s
    accel: 20, // m/s²
    decel: 26,
    radius: 0.3,
    // 쉬움 기본 ON: 손을 떼고 있으면 예상 타점 쪽으로 천천히 이동
    assistSpeedRatio: 0.55,
    squeakMinSpeed: 2.4, // 이 속도 이상에서 급정지/급전환하면 스퀵
    squeakTurnDeg: 100,
    squeakCooldownMs: 450,
  },

  solo: {
    feedDelayMs: 1100, // 실점 후 다음 공까지
    feedFlightTime: 1.0, // 피드 공 비행 시간(s)
  },

  fx: {
    ballVisualScale: 4, // 화면상 공 크기 배율 (판정에는 영향 없음)
    hitstopMs: { perfect: 85, good: 55, off: 35 },
    // 화면 진동: 설정 '약'/'보통' 별 최대 진폭(m)과 지속시간
    shake: { weak: 0.025, normal: 0.05, durationMs: 130 },
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
  },

  debug: {
    showPrediction: false,
    showContacts: false,
    predictSeconds: 3,
    timeScale: 1, // 슬로모 (1 = 정상)
    autoplay: false, // 자동 플레이(봇): 타점으로 이동해 이상적인 순간에 스윙
    autoplayErrorMs: 0, // 봇 스윙 타이밍 오차 (판정 확인용)
    // 공 발사기: 캐릭터 위치에서 앞벽(-z) 방향으로 발사
    launcher: { y: 0.9, speed: 18, elevationDeg: 12, aimDeg: 0, serve: false },
  },
};
