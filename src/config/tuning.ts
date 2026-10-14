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
    scale: {
      easy: { length: 1.0, width: 1.0 },
      normal: { length: 0.85, width: 0.9 },
      hard: { length: 0.7, width: 0.8 },
    } as Record<Difficulty, { length: number; width: number }>,
    // 기획서 6-3 미결정: 높이 라인(아웃/서비스/틴)도 길이 배율로 줄일지
    scaleHeightLines: false,
    // 렌더링용 벽 높이(아웃 라인 위 여유)
    wallMarginAbove: 0.45,
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

  player: {
    // M0: 시점 확인용 임시 이동. M2에서 관성 모델로 교체.
    maxSpeed: 4.5, // m/s
  },
};
