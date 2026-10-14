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

  fx: {
    ballVisualScale: 4, // 화면상 공 크기 배율 (판정에는 영향 없음)
  },

  debug: {
    showPrediction: true,
    showContacts: true,
    predictSeconds: 3,
    timeScale: 1, // 슬로모 (1 = 정상)
    // 공 발사기: 캐릭터 위치에서 앞벽(-z) 방향으로 발사 (Space)
    launcher: { y: 0.9, speed: 18, elevationDeg: 12, aimDeg: 0, serve: false },
  },

  player: {
    // M0: 시점 확인용 임시 이동. M2에서 관성 모델로 교체.
    maxSpeed: 4.5, // m/s
  },
};
