// 애니메이션 확인 페이지 (?animlab): 정해진 입력 시나리오(달리다 급정지, 옆 스텝, 서서 스윙, 뛰면서 스윙 …)를
// 고정 시간 간격으로 돌려 프레임을 한 장의 시트로 이어 붙인다. 실제 게임과 같은 이동 모델(moveStep)과 animateCharacter를 쓴다.
import * as THREE from 'three';
import { buildCourt } from '../config/court';
import { tuning } from '../config/tuning';
import { createMover, moveStep } from '../game/player';
import { animateCharacter, createCharacter, SWING_CONTACT, type AnimState } from '../render/character';
import { createScene } from '../render/scene';

type Dir = { x: number; z: number } | null;
type View = 'side' | 'diag' | 'back' | 'front';
interface Hit {
  at: number;
  hand: 'fore' | 'back';
  /** 선수 기준 공 위치: 오른쪽 +x, 앞 +f, 높이 y */
  rel: { x: number; f: number; y: number };
  /** 이 시각부터 준비 동작(라켓 빼기)을 시작 */
  prepFrom: number;
  whiff?: boolean;
}
interface Scenario {
  name: string;
  seconds: number;
  /** [시각, 입력 방향] — 그 시각부터 이 방향을 누름 */
  input: [number, Dir][];
  hit?: Hit;
  start?: { x: number; z: number };
}

export const SCENARIOS: Scenario[] = [
  { name: 'runStop', seconds: 1.9, input: [[0, null], [0.25, { x: 0, z: -1 }], [1.05, null]], start: { x: 0, z: 8.8 } },
  { name: 'sideStop', seconds: 1.6, input: [[0, null], [0.2, { x: 1, z: 0 }], [0.85, null]], start: { x: -2.6, z: 6 } },
  { name: 'backStop', seconds: 1.8, input: [[0, null], [0.2, { x: 0, z: 1 }], [0.95, null]], start: { x: 0, z: 3.5 } },
  { name: 'turn', seconds: 1.8, input: [[0, null], [0.15, { x: -1, z: 0 }], [0.7, { x: 1, z: 0 }], [1.35, null]], start: { x: 1.2, z: 6 } },
  {
    name: 'standFore',
    seconds: 1.4,
    input: [[0, null]],
    hit: { at: 0.75, hand: 'fore', rel: { x: 0.85, f: 0.25, y: 0.75 }, prepFrom: 0.2 },
  },
  {
    name: 'standBack',
    seconds: 1.4,
    input: [[0, null]],
    hit: { at: 0.75, hand: 'back', rel: { x: -0.85, f: 0.25, y: 0.75 }, prepFrom: 0.2 },
  },
  {
    name: 'runFore',
    start: { x: -1.8, z: 8.2 },
    seconds: 1.8,
    input: [[0, null], [0.1, { x: 0.6, z: -0.8 }], [1.0, null]],
    hit: { at: 0.9, hand: 'fore', rel: { x: 0.8, f: 0.45, y: 0.55 }, prepFrom: 0.45 },
  },
  {
    name: 'runBack',
    start: { x: 1.8, z: 8.2 },
    seconds: 1.8,
    input: [[0, null], [0.1, { x: -0.7, z: -0.7 }], [1.0, null]],
    hit: { at: 0.9, hand: 'back', rel: { x: -0.8, f: 0.45, y: 0.5 }, prepFrom: 0.45 },
  },
  {
    name: 'reachFore',
    start: { x: -2.4, z: 6 },
    seconds: 1.6,
    input: [[0, null], [0.1, { x: 1, z: 0 }], [0.75, null]],
    hit: { at: 0.72, hand: 'fore', rel: { x: 1.25, f: 0.2, y: 0.35 }, prepFrom: 0.3 },
  },
];

const FPS = 60;
const SWING_SECONDS = 0.34;
const HITSTOP = 0.07;

function inputAt(sc: Scenario, t: number): Dir {
  let d: Dir = null;
  for (const [at, dir] of sc.input) if (t >= at) d = dir;
  return d;
}

const CAM: Record<View, [number, number, number]> = {
  side: [3.4, 1.15, 0],
  diag: [2.4, 1.5, -2.6],
  back: [0, 1.6, 3.4],
  front: [0, 1.3, -3.4],
};

export function renderSheet(name: string, view: View, every = 4, tileW = 180, tileH = 220, cols = 8): string {
  const sc = SCENARIOS.find((s) => s.name === name)!;
  const court = buildCourt('normal');
  const scene = createScene();
  scene.background = new THREE.Color(0xe9e6f2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8c39a }));
  scene.add(floor);
  const grid = new THREE.GridHelper(40, 80, 0x8a7a5a, 0xb8a47c);
  (grid.material as THREE.Material).opacity = 0.5;
  (grid.material as THREE.Material).transparent = true;
  grid.position.y = 0.002;
  scene.add(grid);
  const ch = createCharacter(0x2f6fd6);
  scene.add(ch.root);
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  ballMesh.visible = false;
  scene.add(ballMesh);

  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(tileW, tileH, false);
  const cam = new THREE.PerspectiveCamera(42, tileW / tileH, 0.1, 50);

  const start = sc.start ?? { x: 0, z: 6 };
  const m = createMover(start.x, start.z);
  const total = Math.round(sc.seconds * FPS);
  const frames = Math.ceil(total / every);
  const rows = Math.ceil(frames / cols);
  const sheet = document.createElement('canvas');
  sheet.width = tileW * cols;
  sheet.height = tileH * rows;
  const g = sheet.getContext('2d')!;
  g.font = '12px system-ui';

  let swing: number | null = null;
  let contact: AnimState['contact'] = null;
  let frozen = 0;
  let snap = false;
  let hitDone = false;
  let tile = 0;
  const physDt = 1 / tuning.physics.substepHz;
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    const dt = 1 / FPS;
    const h = sc.hit;
    // 히트스톱 중엔 이동·애니 멈춤 (게임과 같음)
    if (frozen <= 0) for (let s = 0; s < Math.round(dt / physDt); s++) moveStep(m, physDt, court, inputAt(sc, t), null, 1);
    let prep = 0;
    if (h && !hitDone && t >= h.prepFrom) prep = Math.min(1, (t - h.prepFrom) / Math.max(0.05, h.at - h.prepFrom));
    if (h && !hitDone && t >= h.at) {
      hitDone = true;
      if (h.whiff) swing = 0;
      else {
        const yaw = 0;
        const bx = m.x + h.rel.x * Math.cos(yaw);
        const bz = m.z - h.rel.f;
        contact = { ball: new THREE.Vector3(bx, h.rel.y, bz), aim: new THREE.Vector3(bx * 0.3, 1.2, 0), w: 1 };
        swing = SWING_CONTACT;
        snap = true;
        frozen = HITSTOP;
        ballMesh.position.copy(contact.ball);
        ballMesh.visible = true;
      }
    }
    const isFrozen = frozen > 0;
    if (swing !== null && !isFrozen) {
      swing += dt / SWING_SECONDS;
      if (swing >= 1) swing = null;
    }
    if (contact && !isFrozen && !snap) {
      contact.w -= dt / 0.22;
      if (contact.w <= 0) contact = null;
    }
    if (!isFrozen || snap) {
      ch.root.position.x = m.x;
      ch.root.position.z = m.z;
    }
    const aimBall = h && !hitDone && prep > 0 ? new THREE.Vector3(m.x + h.rel.x, h.rel.y, m.z - h.rel.f) : null;
    animateCharacter(ch, dt, {
      aimBall,
      vx: m.vx,
      vz: m.vz,
      maxSpeed: tuning.player.maxSpeed,
      swing,
      hand: h?.hand ?? 'fore',
      frozen: isFrozen,
      contact,
      prep,
      snap,
    });
    snap = false;
    if (isFrozen) frozen -= dt;
    if (t > (h?.at ?? 0) + 0.15) ballMesh.visible = false;

    if (f % every === 0) {
      const o = CAM[view];
      cam.position.set(m.x + o[0], o[1], m.z + o[2]);
      cam.lookAt(m.x, 0.85, m.z);
      renderer.render(scene, cam);
      const x = (tile % cols) * tileW;
      const y = Math.floor(tile / cols) * tileH;
      g.drawImage(canvas, x, y);
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.fillRect(x, y, 150, 16);
      g.fillStyle = '#fff';
      const sp = Math.hypot(m.vx, m.vz);
      g.fillText(`${t.toFixed(2)}s ${sp.toFixed(1)}m/s${isFrozen ? ' ■' : ''} s${ch.loco.stopK.toFixed(1)}`, x + 3, y + 12);
      g.strokeStyle = 'rgba(0,0,0,.25)';
      g.strokeRect(x + 0.5, y + 0.5, tileW - 1, tileH - 1);
      tile++;
    }
  }
  renderer.dispose();
  return sheet.toDataURL('image/png');
}

Object.assign(window as object, { __animlab: { renderSheet, names: () => SCENARIOS.map((s) => s.name) } });
