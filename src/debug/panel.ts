import GUI from 'lil-gui';
import { tuning } from '../config/tuning';

export interface DebugHooks {
  onCourtChange: () => void;
  onCameraChange: () => void;
}

/** ` 키로 여닫는 튜닝 패널. tuning 객체를 직접 수정한다. */
export function createDebugPanel(hooks: DebugHooks): GUI {
  const gui = new GUI({ title: 'DEBUG (` 키)' });
  gui.hide();

  const court = gui.addFolder('코트');
  court.add(tuning.court, 'scaleHeightLines').name('높이 라인도 축소').onChange(hooks.onCourtChange);
  for (const d of ['easy', 'normal', 'hard'] as const) {
    const f = court.addFolder(d);
    f.add(tuning.court.scale[d], 'length', 0.5, 1.2, 0.01).name('길이 배율').onChange(hooks.onCourtChange);
    f.add(tuning.court.scale[d], 'width', 0.5, 1.2, 0.01).name('폭 배율').onChange(hooks.onCourtChange);
    f.close();
  }

  const cam = gui.addFolder('카메라');
  cam.add(tuning.camera, 'height', 2, 10, 0.05).name('높이').onChange(hooks.onCameraChange);
  cam.add(tuning.camera, 'backOffset', 0, 8, 0.05).name('뒷벽 뒤 거리').onChange(hooks.onCameraChange);
  cam.add(tuning.camera, 'followX', 0, 1, 0.01).name('좌우 추종 비율');
  cam.add(tuning.camera, 'followZ', 0, 1, 0.01).name('앞뒤 추종 비율');
  cam.add(tuning.camera, 'followMaxX', 0, 2, 0.05).name('좌우 최대 이동').onChange(hooks.onCameraChange);
  cam.add(tuning.camera, 'followMaxZ', 0, 2, 0.05).name('앞뒤 최대 이동').onChange(hooks.onCameraChange);
  cam.add(tuning.camera, 'followSmoothing', 0.5, 10, 0.1).name('추종 속도');
  cam.add(tuning.camera, 'fitMargin', 0, 0.3, 0.01).name('화면 여백').onChange(hooks.onCameraChange);

  window.addEventListener('keydown', (e) => {
    if (e.key === '`') gui._hidden ? gui.show() : gui.hide();
  });
  return gui;
}
