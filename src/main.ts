import * as THREE from 'three';
import { tPosition } from './config/court';
import { tuning, type Difficulty } from './config/tuning';
import { FixedLoop } from './core/loop';
import { createDebugPanel } from './debug/panel';
import { launchPresets } from './debug/presets';
import { World } from './game/world';
import { launchVelocity, predict } from './physics/predict';
import { BallView } from './render/ball-view';
import { CameraRig } from './render/camera';
import { createCharacter } from './render/character';
import { createCourtMesh } from './render/court-mesh';
import { DebugDraw } from './render/debug-draw';
import { palette } from './render/palette';
import { createRenderer, createScene } from './render/scene';
import { REASON_TEXT } from './ui/labels';

// M1: 공 물리 + 판정 확인용 샌드박스. M2 이후 게임 모드로 대체된다.

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const renderer = createRenderer(canvas);
const scene = createScene();
const rig = new CameraRig();

let difficulty: Difficulty = 'easy';
const world = new World(difficulty, 1);
const loop = new FixedLoop((dt) => world.step(dt));
let courtMesh = createCourtMesh(world.court);
scene.add(courtMesh);

const ballView = new BallView();
const debugDraw = new DebugDraw();
scene.add(ballView.group, debugDraw.group);

const player = createCharacter(palette.playerShirt);
scene.add(player.root);
const playerPos = new THREE.Vector2(); // x, z
function resetPlayer() {
  const t = tPosition(world.court);
  playerPos.set(t.x + 0.4, t.z + 0.6);
}

ui.innerHTML = `
  <div class="hud-dev">
    <div class="title">${tuning.game.title} · M1 물리 샌드박스</div>
    <div>난이도: <span id="diff"></span> (1 / 2 / 3)</div>
    <div>이동: WASD · <b>Space</b> 발사 · 디버그 패널: \`</div>
    <div>랠리: <span id="rally"></span></div>
    <div id="fps"></div>
  </div>
  <div class="banner" id="banner"><div class="t"></div><div class="d"></div></div>
  <div class="hud-guide"><b>↓당겼다 ↑밀기</b> = 드라이브 &nbsp;·&nbsp; <b>↑올렸다 ↓내리기</b> = 드롭 &nbsp;·&nbsp; <b>툭</b> = 블록</div>
`;
const diffEl = document.getElementById('diff')!;
const fpsEl = document.getElementById('fps')!;
const rallyEl = document.getElementById('rally')!;
const banner = document.getElementById('banner')!;
const DIFF_LABEL: Record<Difficulty, string> = { easy: '쉬움', normal: '중간', hard: '어려움' };
const PHASE_LABEL = { waiting: '대기', toFront: '앞벽으로 가는 중', returning: '돌아오는 중', over: '종료' };

let bannerTimer = 0;
function showBanner(title: string, desc: string, win: boolean) {
  banner.querySelector('.t')!.textContent = title;
  banner.querySelector('.d')!.textContent = desc;
  banner.classList.toggle('win', win);
  banner.classList.add('show');
  bannerTimer = 2.2;
}

world.bus.on('contact', (ct) => debugDraw.addActual(ct, tuning.debug.showContacts));
world.bus.on('rallyEnd', (res) => {
  const t = REASON_TEXT[res.reason];
  showBanner(t.title, t.desc, false);
  debugDraw.markResult(res.contact);
});
world.bus.on('launch', () => {
  debugDraw.clearActual();
  banner.classList.remove('show');
});

function rebuildCourt() {
  scene.remove(courtMesh);
  world.setDifficulty(difficulty);
  courtMesh = createCourtMesh(world.court);
  scene.add(courtMesh);
  debugDraw.clearActual();
  const c = world.court;
  diffEl.textContent = `${DIFF_LABEL[difficulty]} (${c.length.toFixed(2)}m × ${c.width.toFixed(2)}m)`;
  resetPlayer();
  resize();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  rig.fit(world.court, w / h);
}
window.addEventListener('resize', resize);

function launchFromPlayer() {
  const L = tuning.debug.launcher;
  const from = { x: playerPos.x + 0.35, y: L.y, z: playerPos.y - 0.3 };
  world.launch(from, launchVelocity(L.speed, L.elevationDeg, L.aimDeg), 'A', L.serve);
}

function firePreset(i: number) {
  const p = launchPresets(world.court)[i];
  playerPos.set(p.from.x - 0.35, p.from.z + 0.3);
  world.launch(p.from, p.vel, 'A', p.serve);
}

createDebugPanel({
  onCourtChange: rebuildCourt,
  onCameraChange: resize,
  onLaunch: launchFromPlayer,
  presets: () => launchPresets(world.court).map((p, i) => ({ label: `${p.label} → ${p.expect}`, run: () => firePreset(i) })),
});

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  const d = ({ Digit1: 'easy', Digit2: 'normal', Digit3: 'hard' } as Record<string, Difficulty>)[e.code];
  if (d) {
    difficulty = d;
    rebuildCourt();
  }
  if (e.code === 'Space') {
    e.preventDefault();
    launchFromPlayer();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

rebuildCourt();

// FPS 측정 + e2e 훅
const stats = { fps: 0, frames: 0 };
Object.assign(window as object, { __stats: stats, __world: world, __firePreset: firePreset });
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
  const c = world.court;
  playerPos.x = THREE.MathUtils.clamp(playerPos.x, -c.width / 2 + r, c.width / 2 - r);
  playerPos.y = THREE.MathUtils.clamp(playerPos.y, r, c.length - r);
  player.root.position.set(playerPos.x, 0, playerPos.y);

  loop.timeScale = tuning.debug.timeScale;
  loop.advance(dt);

  ballView.update(world.ball);
  const showPred = tuning.debug.showPrediction && world.ball && world.rally.phase !== 'over';
  debugDraw.setPrediction(showPred ? predict(world.ball!, c, tuning.debug.predictSeconds) : null, {
    line: true,
    contacts: tuning.debug.showContacts,
  });
  const rl = world.rally;
  rallyEl.textContent = `${PHASE_LABEL[rl.phase]}${rl.isServe ? ' (서브)' : ''} · 바운드 ${rl.floorBounces}`;

  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) banner.classList.remove('show');

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
