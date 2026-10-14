import * as THREE from 'three';
import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';
import { createArena, type Arena } from './arena';
import { palette } from './palette';

const LINE_W = 0.05; // 실제 코트 라인 폭 50mm
const EPS = 0.004; // 라인을 면 위로 띄우는 거리 (z-fighting 방지)


function flat(color: number, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

function floorTexture(): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = `#${palette.floor.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = `#${palette.floorStripe.toString(16).padStart(6, '0')}`;
  g.lineWidth = 10;
  for (let i = -size; i < size * 2; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + size, size);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * 앞벽 위 스폰서 보드 (M6 2차, 키 이미지): 보라·코랄·청록·노랑 컬러 블록 + 단순한 추상 로고 (가상 브랜드)
 */
const BOARD_STYLES: { bg: string; fg: string; draw: (g: CanvasRenderingContext2D, fg: string) => void }[] = [
  {
    bg: '#7a5cf0',
    fg: '#ffffff',
    draw: (g, fg) => {
      g.fillStyle = fg;
      g.beginPath();
      g.arc(150, 52, 22, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(120, 112);
      g.lineTo(220, 40);
      g.lineTo(300, 112);
      g.fill();
      g.fillStyle = '#c9b8ff';
      g.beginPath();
      g.moveTo(250, 112);
      g.lineTo(330, 60);
      g.lineTo(400, 112);
      g.fill();
    },
  },
  {
    bg: '#ff5a5f',
    fg: '#2a1f52',
    draw: (g, fg) => {
      g.fillStyle = fg;
      for (const x of [170, 225]) {
        g.beginPath();
        g.moveTo(x, 110);
        g.lineTo(x + 34, 22);
        g.lineTo(x + 58, 22);
        g.lineTo(x + 24, 110);
        g.fill();
      }
      for (const x of [310, 345]) {
        g.beginPath();
        g.arc(x, 98, 12, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  {
    bg: '#23b5a8',
    fg: '#ffffff',
    draw: (g, fg) => {
      g.fillStyle = fg;
      g.beginPath();
      g.arc(170, 64, 26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a1f52';
      g.beginPath();
      g.moveTo(210, 128);
      g.quadraticCurveTo(300, 20, 400, 128);
      g.fill();
    },
  },
  {
    bg: '#ffc93c',
    fg: '#2a1f52',
    draw: (g, fg) => {
      g.fillStyle = fg;
      for (const [x, y] of [
        [235, 44],
        [281, 44],
        [235, 90],
        [281, 90],
      ]) {
        g.beginPath();
        g.arc(x, y, 21, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
];

function sponsorTexture(i: number): THREE.CanvasTexture {
  const st = BOARD_STYLES[i % BOARD_STYLES.length];
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 136;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#2a1f52';
  g.fillRect(0, 0, 512, 136);
  g.fillStyle = st.bg;
  g.fillRect(8, 8, 496, 120);
  st.draw(g, st.fg);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 벽 텍스처: 위는 밝고 아래로 살짝 어두운 라벤더 그라데이션 + 패널 이음매 + 공 자국 (공 읽기를 방해하지 않게 아주 옅게)
 */
function wallTexture(base: number, marks: number): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const c = new THREE.Color(base);
  const top = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
  const bot = `rgb(${Math.round(c.r * 232)},${Math.round(c.g * 228)},${Math.round(c.b * 245)})`;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bot);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(90,70,150,0.06)';
  g.lineWidth = 2;
  for (let x = w / 5; x < w; x += w / 5) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  // 공 자국: 가운데 높이 부근에 옅은 남색 점들 (장식이라 Math.random)
  for (let i = 0; i < marks; i++) {
    const x = w * (0.15 + Math.random() * 0.7);
    const y = h * (0.35 + Math.random() * 0.45);
    g.fillStyle = `rgba(40,30,90,${0.03 + Math.random() * 0.05})`;
    g.beginPath();
    g.ellipse(x, y, 3 + Math.random() * 3, 2 + Math.random() * 2, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 가로 길이 len, 폭 LINE_W 의 띠 (XY 평면, 중심 원점) */
function strip(len: number, color = palette.line): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(len, LINE_W), flat(color));
}

export function createCourtMesh(c: CourtDims): THREE.Group {
  const root = new THREE.Group();
  root.name = 'court';
  const L = c.length;
  const W = c.width;
  const hw = W / 2;
  const frontH = c.frontOutHeight + tuning.court.wallMarginAbove;
  const backH = c.backOutHeight + 0.25;

  // ── 아레나 (관중석·관중·광고판) ──
  const arena: Arena = createArena(c);
  root.add(arena.group);
  root.userData.arena = arena;

  // ── 코트 바닥 ──
  const ftex = floorTexture();
  ftex.repeat.set(W / 1.2, L / 1.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshBasicMaterial({ map: ftex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, L / 2);
  root.add(floor);

  const floorLine = (len: number, x: number, z: number, alongZ: boolean) => {
    const m = strip(len);
    m.rotation.x = -Math.PI / 2;
    if (alongZ) m.rotation.z = Math.PI / 2;
    m.position.set(x, EPS, z);
    root.add(m);
  };
  // 숏 라인
  floorLine(W, 0, c.shortLineZ, false);
  // 하프코트 라인 (숏 라인 → 뒷벽)
  floorLine(L - c.shortLineZ, 0, (c.shortLineZ + L) / 2, true);
  // 서비스 박스 (숏 라인 뒤, 옆벽에 붙은 정사각형) — 안쪽 세로선 + 뒤쪽 가로선
  const b = c.serviceBoxSize;
  for (const s of [-1, 1]) {
    floorLine(b, s * (hw - b), c.shortLineZ + b / 2, true);
    floorLine(b, s * (hw - b / 2), c.shortLineZ + b, false);
  }

  // ── 앞벽 ──
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, frontH), new THREE.MeshBasicMaterial({ map: wallTexture(palette.wallFront, 120) }));
  front.position.set(0, frontH / 2, 0);
  root.add(front);
  const frontLine = (y: number) => {
    const m = strip(W);
    m.position.set(0, y - LINE_W / 2, EPS);
    root.add(m);
  };
  frontLine(c.frontOutHeight + LINE_W); // 라인 아랫변 = 아웃 높이 (라인 위 = 아웃)
  frontLine(c.serviceLineHeight + LINE_W);
  // 틴 (양철판) — 윗선 포함
  const tin = new THREE.Mesh(new THREE.BoxGeometry(W, c.tinHeight, 0.03), flat(palette.tin));
  tin.position.set(0, c.tinHeight / 2, 0.015);
  root.add(tin);
  const tinShine = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.06), flat(0x3a4580));
  tinShine.position.set(0, c.tinHeight * 0.62, 0.031);
  root.add(tinShine);
  const tinTop = strip(W);
  tinTop.position.set(0, c.tinHeight - LINE_W / 2, 0.03 + EPS);
  root.add(tinTop);

  // ── 옆벽 ──
  for (const s of [-1, 1]) {
    // 옆벽은 실제 코트처럼 윗변이 아웃 라인을 따라 뒤로 갈수록 낮아지는 사다리꼴
    const wx = s * hw;
    const sideGeo = new THREE.BufferGeometry();
    sideGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([wx, 0, 0, wx, 0, L, wx, backH, L, wx, 0, 0, wx, backH, L, wx, frontH, 0], 3),
    );
    // UV: u = z / L, v = y / 앞벽 높이
    sideGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, backH / frontH, 0, 0, 1, backH / frontH, 0, 1], 2));
    const side = new THREE.Mesh(sideGeo, new THREE.MeshBasicMaterial({ map: wallTexture(palette.wallSide, 40), side: THREE.DoubleSide }));
    root.add(side);
    // 사선 아웃 라인
    // 사선 아웃 라인: 아랫변 = 아웃 높이 (라인 위 = 아웃)
    const x = s * (hw - EPS);
    const f = c.frontOutHeight;
    const bk = c.backOutHeight;
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([x, f, 0, x, bk, L, x, bk + LINE_W, L, x, f, 0, x, bk + LINE_W, L, x, f + LINE_W, 0], 3),
    );
    root.add(new THREE.Mesh(lineGeo, flat(palette.line, { side: THREE.DoubleSide })));
    // 벽 윗면 몰딩
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, Math.hypot(L, frontH - backH)), flat(0x6b4fd8));
    trim.position.set(s * (hw + 0.06), (frontH + backH) / 2, L / 2);
    trim.rotation.x = Math.atan2(frontH - backH, L);
    root.add(trim);
  }
  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.28, 0.12, 0.12), flat(0x6b4fd8));
  frontTrim.position.set(0, frontH, -0.04);
  root.add(frontTrim);

  // ── 앞벽 위 스폰서 보드 줄 ──
  const boardH = 0.7;
  const n = 4;
  const bw = W / n;
  for (let i = 0; i < n; i++) {
    const tex = sponsorTexture(i);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.96, boardH), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(-W / 2 + bw * (i + 0.5), frontH + 0.08 + boardH / 2, -0.05);
    root.add(m);
  }

  // ── 유리 뒷벽 ──
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W, backH),
    new THREE.MeshBasicMaterial({ color: palette.glass, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  );
  glass.position.set(0, backH / 2, L);
  glass.renderOrder = 10;
  root.add(glass);
  const backLine = strip(W);
  backLine.position.set(0, c.backOutHeight + LINE_W / 2, L - EPS);
  backLine.rotation.y = Math.PI;
  root.add(backLine);
  const glassTop = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.03, 0.03),
    flat(palette.glass, { transparent: true, opacity: 0.35, depthWrite: false }),
  );
  glassTop.position.set(0, backH, L);
  root.add(glassTop);

  return root;
}
