import * as THREE from 'three';
import { buildCourt, tPosition, type CourtDims } from './config/court';
import { tuning, type Difficulty } from './config/tuning';
import { createDebugPanel } from './debug/panel';
import { CameraRig } from './render/camera';
import { createCharacter } from './render/character';
import { createCourtMesh } from './render/court-mesh';
import { palette } from './render/palette';
import { createRenderer, createScene } from './render/scene';

// M0: 코트 + 카메라 시점 확인용 부트스트랩. 이후 마일스톤에서 게임 루프/모드로 대체된다.

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const renderer = createRenderer(canvas);
const scene = createScene();
const rig = new CameraRig();

let difficulty: Difficulty = 'easy';
let court: CourtDims = buildCourt(difficulty);
let courtMesh = createCourtMesh(court);
scene.add(courtMesh);

const player = createCharacter(palette.playerShirt);
scene.add(player.root);
const playerPos = new THREE.Vector2(); // x, z
function resetPlayer() {
  const t = tPosition(court);
  playerPos.set(t.x + 0.4, t.z + 0.6);
}
resetPlayer();

ui.innerHTML = `
  <div class="hud-dev">
    <div class="title">${tuning.game.title} · M0</div>
    <div>난이도: <span id="diff"></span> (1 / 2 / 3)</div>
    <div>이동: WASD / 방향키 · 디버그: \`</div>
    <div id="fps"></div>
  </div>
  <div class="hud-guide"><b>↓당겼다 ↑밀기</b> = 드라이브 &nbsp;·&nbsp; <b>↑올렸다 ↓내리기</b> = 드롭 &nbsp;·&nbsp; <b>툭</b> = 블록</div>
`;
const diffEl = document.getElementById('diff')!;
const fpsEl = document.getElementById('fps')!;
const DIFF_LABEL: Record<Difficulty, string> = { easy: '쉬움', normal: '중간', hard: '어려움' };

function rebuildCourt() {
  scene.remove(courtMesh);
  court = buildCourt(difficulty);
  courtMesh = createCourtMesh(court);
  scene.add(courtMesh);
  diffEl.textContent = `${DIFF_LABEL[difficulty]} (${court.length.toFixed(2)}m × ${court.width.toFixed(2)}m)`;
  resetPlayer();
  resize();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  rig.fit(court, w / h);
}
window.addEventListener('resize', resize);

createDebugPanel({ onCourtChange: rebuildCourt, onCameraChange: resize });

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  const d = ({ Digit1: 'easy', Digit2: 'normal', Digit3: 'hard' } as Record<string, Difficulty>)[e.code];
  if (d) {
    difficulty = d;
    rebuildCourt();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

rebuildCourt();

// FPS 측정 (e2e에서 window.__stats로 읽음)
const stats = { fps: 0, frames: 0 };
(window as unknown as { __stats: typeof stats }).__stats = stats;
let fpsAcc = 0;
let fpsFrames = 0;

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const mz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const len = Math.hypot(mx, mz) || 1;
  playerPos.x += (mx / len) * tuning.player.maxSpeed * dt;
  playerPos.y += (mz / len) * tuning.player.maxSpeed * dt;
  const r = 0.3;
  playerPos.x = THREE.MathUtils.clamp(playerPos.x, -court.width / 2 + r, court.width / 2 - r);
  playerPos.y = THREE.MathUtils.clamp(playerPos.y, r, court.length - r);
  player.root.position.set(playerPos.x, 0, playerPos.y);

  rig.update(dt, { x: playerPos.x, z: playerPos.y });
  renderer.render(scene, rig.camera);

  fpsAcc += dt;
  fpsFrames++;
  stats.frames++;
  if (fpsAcc >= 0.5) {
    stats.fps = fpsFrames / fpsAcc;
    fpsEl.textContent = `${stats.fps.toFixed(0)} fps`;
    fpsAcc = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
