import * as THREE from 'three';
import { sfx } from './audio/sfx';
import { buildCourt } from './config/court';
import { tuning, type Difficulty } from './config/tuning';
import { createDebugPanel } from './debug/panel';
import { launchPresets } from './debug/presets';
import { Game, type HitEvent, type WhiffReason } from './game/game';
import { type Hand } from './game/swing';
import { loadSettings, saveSettings } from './game/settings';
import { type Vec3 } from './physics/ball';
import { type RallyResult } from './rules/rally';
import { CameraRig } from './render/camera';
import { createCourtMesh } from './render/court-mesh';
import { createRenderer, createScene } from './render/scene';
import { REASON_TEXT } from './ui/labels';
import { Screens } from './ui/screens';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const renderer = createRenderer(canvas);
const scene = createScene();
const settings = loadSettings();
sfx.volume = settings.volume;

// ── HUD ──
ui.innerHTML = `
  <div id="hud" class="hidden">
    <div class="combo"><div class="l">COMBO</div><div class="n" id="combo">0</div><div class="s" id="comboSub"></div></div>
    <div class="side-label" id="side"></div>
    <button class="pause-btn" id="pauseBtn" title="일시정지 (Esc)">II</button>
    <div class="banner" id="banner"><div class="t"></div><div class="d"></div></div>
    <div class="hud-guide"><b>WASD</b> = 이동 &nbsp;·&nbsp; <b>우클릭</b> = 포핸드(오른쪽 공) &nbsp;·&nbsp; <b>좌클릭</b> = 백핸드(왼쪽 공) &nbsp;·&nbsp; <b>커서</b> = 방향 &nbsp;·&nbsp; <b>Esc</b> = 일시정지</div>
  </div>
  <div id="popups"></div>
  <div id="fps" style="position:absolute;right:8px;bottom:6px;font-size:11px;opacity:.45"></div>
`;
const hud = document.getElementById('hud')!;
const comboEl = document.getElementById('combo')!;
const comboSub = document.getElementById('comboSub')!;
const sideEl = document.getElementById('side')!;
const banner = document.getElementById('banner')!;
const popups = document.getElementById('popups')!;
const fpsEl = document.getElementById('fps')!;
const screens = new Screens(ui);

// ── 메뉴 배경: 코트만 ──
const backdropRig = new CameraRig();
let backdrop: THREE.Group | null = createCourtMesh(buildCourt('easy'));
scene.add(backdrop);

let game: Game | null = null;
let difficulty: Difficulty = 'easy';

function aspect() {
  return window.innerWidth / window.innerHeight;
}
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  backdropRig.fit(buildCourt('easy'), aspect());
  game?.resize(aspect());
}
window.addEventListener('resize', resize);

function project(p: Vec3): { x: number; y: number } {
  const v = new THREE.Vector3(p.x, p.y, p.z).project((game?.rig ?? backdropRig).camera);
  return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
}

function popup(text: string, cls: string, at: Vec3, sub: string | null = null) {
  const s = project(at);
  const d = document.createElement('div');
  d.className = `popup ${cls}`;
  d.textContent = text;
  if (sub) {
    const e = document.createElement('small');
    e.textContent = sub;
    d.appendChild(e);
  }
  d.style.left = `${s.x}px`;
  d.style.top = `${s.y - 70}px`;
  popups.appendChild(d);
  setTimeout(() => d.remove(), 800);
}

let bannerTimer = 0;
function showBanner(title: string, desc: string) {
  banner.querySelector('.t')!.textContent = title;
  banner.querySelector('.d')!.textContent = desc;
  banner.classList.add('show');
  bannerTimer = 1.6;
}

const GRADE_TEXT = { perfect: 'PERFECT!', good: 'GOOD', weak: 'WEAK' };
const WHIFF_TEXT: Record<WhiffReason, (h: Hand) => [string, string | null]> = {
  wrongHand: (h) => ['반대 손!', h === 'fore' ? '공이 왼쪽 → 좌클릭(백핸드)' : '공이 오른쪽 → 우클릭(포핸드)'],
  outOfRange: () => ['헛스윙', '공이 범위 밖이에요'],
  noBall: () => ['헛스윙', null],
};

function startSolo(d: Difficulty) {
  difficulty = d;
  screens.hide();
  if (backdrop) {
    scene.remove(backdrop);
    backdrop = null;
  }
  game?.dispose();
  game = new Game(scene, d, settings, {
    onHit: (e: HitEvent) => {
      popup(GRADE_TEXT[e.grade], e.grade, e.at, e.hint);
      comboEl.classList.remove('punch');
      void comboEl.offsetWidth;
      comboEl.classList.add('punch');
    },
    onRallyEnd: (r: RallyResult) => {
      const t = REASON_TEXT[r.reason];
      showBanner(t.title, t.desc);
    },
    onWhiff: (reason: WhiffReason, hand: Hand) => {
      if (!game) return;
      const [t, sub] = WHIFF_TEXT[reason](hand);
      popup(t, 'whiff', { x: game.playerPos.x, y: 1.9, z: game.playerPos.z }, sub);
    },
  });
  game.resize(aspect());
  hud.classList.remove('hidden');
  banner.classList.remove('show');
  if (!settings.seenTutorial) {
    const tip = document.createElement('div');
    tip.className = 'tutorial';
    tip.innerHTML = `<b>WASD</b>로 움직여 공이 <b>노란 점선 원</b> 위에 오게 하고<br>공이 오른쪽이면 <b>우클릭</b>, 왼쪽이면 <b>좌클릭</b>! 방향은 <b>커서</b>로`;
    hud.appendChild(tip);
    setTimeout(() => tip.remove(), 4600);
    settings.seenTutorial = true;
    saveSettings(settings);
  }
}

function backToMenu() {
  game?.dispose();
  game = null;
  hud.classList.add('hidden');
  if (!backdrop) {
    backdrop = createCourtMesh(buildCourt('easy'));
    scene.add(backdrop);
  }
  showMain();
}

function showMain() {
  screens.main({
    solo: () => screens.difficulty({ pick: startSolo, back: showMain }),
    howto: () => screens.howto({ back: showMain }),
    settings: () => screens.settings(settings, { back: showMain, changed: () => {} }),
  });
}

function pause() {
  if (!game || game.paused) return;
  game.paused = true;
  sfx.play('ui_pause');
  showPause();
}
function showPause() {
  screens.pause({
    resume: () => {
      screens.hide();
      if (game) game.paused = false;
    },
    settings: () => screens.settings(settings, { back: showPause, changed: () => {} }),
    quit: () => {
      const s = game!.session;
      screens.results(s, { retry: () => startSolo(difficulty), menu: backToMenu });
    },
  });
}
document.getElementById('pauseBtn')!.addEventListener('click', pause);

// ── 입력: 우클릭 = 포핸드, 좌클릭 = 백핸드, 커서 = 방향 ──
const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
function updateAim(e: { clientX: number; clientY: number }) {
  if (!game) return;
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, game.rig.camera);
  game.aimPoint = raycaster.ray.intersectPlane(floorPlane, hitPoint) ? { x: hitPoint.x, z: hitPoint.z } : null;
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove', updateAim);
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (!game || (e.button !== 0 && e.button !== 2)) return;
  updateAim(e);
  game.swing({ hand: e.button === 2 ? 'fore' : 'back', aim: game.aimPoint });
});

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game && !game.paused) pause();
    else if (game?.paused && screens.visible) {
      screens.hide();
      game.paused = false;
    }
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  if (game && !game.paused) pause();
});

// ── 디버그 패널 (` 키) ──
createDebugPanel({
  onCourtChange: () => {
    game?.rebuildCourt();
    resize();
  },
  onCameraChange: resize,
  onLaunch: () => {
    if (!game) return;
    const L = tuning.debug.launcher;
    const p = game.playerPos;
    const el = (L.elevationDeg * Math.PI) / 180;
    const az = (L.aimDeg * Math.PI) / 180;
    const v = { x: L.speed * Math.cos(el) * Math.sin(az), y: L.speed * Math.sin(el), z: -L.speed * Math.cos(el) * Math.cos(az) };
    game.world.launch({ x: p.x + 0.35, y: L.y, z: p.z - 0.3 }, v, 'A', L.serve);
  },
  presets: () =>
    launchPresets(game?.world.court ?? buildCourt('easy')).map((p, i) => ({
      label: `${p.label} → ${p.expect}`,
      run: () => {
        if (!game) return;
        const q = launchPresets(game.world.court)[i];
        game.setPlayerPos(q.from.x - 0.35, q.from.z + 0.3);
        game.world.launch(q.from, q.vel, 'A', q.serve);
      },
    })),
});

// ── 루프 ──
const stats = { fps: 0, frames: 0 };
Object.assign(window as object, { __stats: stats, __game: () => game, __startSolo: startSolo, __tuning: tuning });
let fpsAcc = 0;
let fpsFrames = 0;
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game) {
    const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const mz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    game.moveInput.x = mx;
    game.moveInput.z = mz;
    game.update(dt);
    const s = game.session;
    comboEl.textContent = String(s.combo);
    comboSub.textContent = `최고 ${s.best} · PERFECT ${s.perfects}`;
    sideEl.textContent = game.ballSide === 'fore' ? '포핸드 (우클릭)' : game.ballSide === 'back' ? '백핸드 (좌클릭)' : '';
    renderer.render(scene, game.rig.camera);
  } else {
    renderer.render(scene, backdropRig.camera);
  }
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) banner.classList.remove('show');

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

resize();
screens.title({ start: showMain });
requestAnimationFrame(frame);
