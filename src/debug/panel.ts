import GUI from 'lil-gui';
import { tuning } from '../config/tuning';

export interface DebugHooks {
  onCourtChange: () => void;
  onCameraChange: () => void;
  onLaunch: () => void;
  presets: () => { label: string; run: () => void }[];
}

/** ` 키로 여닫는 튜닝 패널. tuning 객체를 직접 수정한다. */
export function createDebugPanel(hooks: DebugHooks): GUI {
  const gui = new GUI({ title: 'DEBUG (` 키)' });
  gui.hide();

  // ── 발사기 ──
  const L = tuning.debug.launcher;
  const launch = gui.addFolder('공 발사기 (캐릭터 위치에서)');
  launch.add(L, 'speed', 2, 40, 0.5).name('속력 m/s');
  launch.add(L, 'elevationDeg', -30, 60, 0.5).name('상하 각도°');
  launch.add(L, 'aimDeg', -45, 45, 0.5).name('좌우 각도°');
  launch.add(L, 'y', 0.2, 2.5, 0.05).name('발사 높이 m');
  launch.add(L, 'serve').name('서브로 판정');
  launch.add({ fire: hooks.onLaunch }, 'fire').name('▶ 발사');
  const presetFolder = launch.addFolder('프리셋 (현재 코트 기준 자동 조준)');
  const rebuildPresets = () => {
    for (const c of [...presetFolder.controllers]) c.destroy();
    for (const p of hooks.presets()) presetFolder.add({ go: p.run }, 'go').name(p.label);
  };
  rebuildPresets();
  launch.close();

  const bot = gui.addFolder('자동 플레이 (봇)');
  bot.add(tuning.debug, 'autoplay').name('켜기');
  bot.add(tuning.debug, 'autoplayErrorMs', -300, 300, 5).name('타이밍 오차(ms)');

  const play = gui.addFolder('조작·판정');
  play.add(tuning.timing, 'reach', 0.6, 2.5, 0.05).name('타격 범위 반지름(m)');
  play.add(tuning.timing, 'sweetRatio', 0.2, 0.9, 0.05).name('최적 원 비율');
  play.add(tuning.timing, 'minDistScore', 0, 1, 0.05).name('거리 최저 배점');
  play.add(tuning.timing, 'perfectMs', 10, 150, 5).name('타이밍 1점 창(ms)');
  play.add(tuning.timing, 'goodMs', 50, 300, 5).name('타이밍 0.6점 창(ms)');
  play.add(tuning.shots, 'minSpeed', 6, 30, 0.5).name('최저 타구 속력');
  play.add(tuning.shots, 'maxSpeed', 10, 40, 0.5).name('최고 타구 속력');
  play.add(tuning.shots, 'perfectAt', 0.3, 1, 0.05).name('PERFECT 기준 배점');
  play.add(tuning.shots, 'goodAt', 0.1, 0.9, 0.05).name('GOOD 기준 배점');
  play.add(tuning.input, 'maxAimSlope', 0.3, 3, 0.1).name('조준 최대 기울기');
  play.add(tuning.player, 'maxSpeed', 2, 12, 0.1).name('이동 최고속도');
  play.add(tuning.player, 'accel', 5, 80, 1).name('가속');
  play.add(tuning.player, 'decel', 5, 80, 1).name('감속');

  const fx = gui.addFolder('타격감');
  fx.add(tuning.fx.hitstopMs, 'perfect', 0, 200, 5).name('히트스톱 PERFECT');
  fx.add(tuning.fx.hitstopMs, 'good', 0, 200, 5).name('히트스톱 GOOD');
  fx.add(tuning.fx.shake, 'weak', 0, 0.15, 0.005).name('진동 약');
  fx.add(tuning.fx.shake, 'normal', 0, 0.15, 0.005).name('진동 보통');
  fx.close();

  const view = gui.addFolder('표시');
  view.add(tuning.debug, 'closeup', ['off', 'side', 'back', 'front']).name('근접 카메라');
  view.add(tuning.debug, 'showPrediction').name('예측선');
  view.add(tuning.debug, 'showContacts').name('충돌점');
  view.add(tuning.debug, 'predictSeconds', 0.5, 6, 0.1).name('예측 시간(s)');
  view.add(tuning.debug, 'timeScale', 0.05, 1, 0.05).name('슬로모');
  view.add(tuning.fx, 'ballVisualScale', 1, 5, 0.1).name('공 표시 크기');

  // ── 물리 ──
  const ph = gui.addFolder('물리');
  ph.add(tuning.physics, 'gravity', 2, 20, 0.1).name('중력');
  ph.add(tuning.physics, 'drag', 0, 0.06, 0.001).name('공기저항');
  const R = tuning.physics.restitution;
  ph.add(R, 'front', 0, 1, 0.01).name('반발: 앞벽');
  ph.add(R, 'side', 0, 1, 0.01).name('반발: 옆벽');
  ph.add(R, 'back', 0, 1, 0.01).name('반발: 유리 뒷벽');
  ph.add(R, 'floor', 0, 1, 0.01).name('반발: 바닥');
  ph.add(R, 'tin', 0, 1, 0.01).name('반발: 틴');
  ph.add(tuning.physics.tangentRetain, 'wall', 0, 1, 0.01).name('마찰 유지: 벽');
  ph.add(tuning.physics.tangentRetain, 'floor', 0, 1, 0.01).name('마찰 유지: 바닥');
  ph.add(tuning.physics, 'rollThreshold', 0, 2, 0.05).name('구르기 임계속도');
  ph.close();

  // ── 코트 ──
  const court = gui.addFolder('코트');
  const courtChanged = () => {
    hooks.onCourtChange();
    rebuildPresets();
  };
  court.add(tuning.court, 'scaleHeightLines').name('높이 라인도 축소').onChange(courtChanged);
  for (const d of ['easy', 'normal', 'hard'] as const) {
    const f = court.addFolder(d);
    f.add(tuning.court.scale[d], 'length', 0.5, 1.5, 0.01).name('길이 배율').onChange(courtChanged);
    f.add(tuning.court.scale[d], 'width', 0.5, 1.5, 0.01).name('폭 배율').onChange(courtChanged);
    f.close();
  }
  court.close();

  // ── 카메라 ──
  const cam = gui.addFolder('카메라');
  cam.add(tuning.camera, 'height', 2, 10, 0.05).name('높이').onChange(hooks.onCameraChange);
  cam.add(tuning.camera, 'backOffset', 0, 8, 0.05).name('뒷벽 뒤 거리').onChange(hooks.onCameraChange);
  cam.add(tuning.camera, 'followX', 0, 1, 0.01).name('좌우 추종 비율');
  cam.add(tuning.camera, 'followZ', 0, 1, 0.01).name('앞뒤 추종 비율');
  cam.add(tuning.camera, 'followMaxX', 0, 2, 0.05).name('좌우 최대 이동').onChange(hooks.onCameraChange);
  cam.add(tuning.camera, 'followMaxZ', 0, 2, 0.05).name('앞뒤 최대 이동').onChange(hooks.onCameraChange);
  cam.add(tuning.camera, 'followSmoothing', 0.5, 10, 0.1).name('추종 속도');
  cam.add(tuning.camera, 'fitMargin', 0, 0.3, 0.01).name('화면 여백').onChange(hooks.onCameraChange);
  cam.close();

  window.addEventListener('keydown', (e) => {
    if (e.key === '`') gui._hidden ? gui.show() : gui.hide();
  });
  return gui;
}
