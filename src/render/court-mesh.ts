import * as THREE from 'three';
import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';
import { palette } from './palette';

const LINE_W = 0.05; // 실제 코트 라인 폭 50mm
const EPS = 0.004; // 라인을 면 위로 띄우는 거리 (z-fighting 방지)

// 가상 스폰서 이름 (실존 브랜드 금지)
const SPONSORS = ['ZEPHRA', 'KORVO', 'LUMEN-9', 'TALLIX', 'BRIQ', 'OVENCUB'];

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

function sponsorTexture(name: string, bg: string, fg: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(18, 30, 68, 68);
  g.fillStyle = fg;
  g.fillRect(36, 48, 32, 32);
  g.font = 'bold 64px "Arial Black", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(name, 110, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

  // ── 아레나 바닥/벽 ──
  const arena = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), flat(palette.arenaFloor));
  arena.rotation.x = -Math.PI / 2;
  arena.position.set(0, -0.02, L / 2);
  root.add(arena);

  const arenaBack = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), flat(palette.arenaWall));
  arenaBack.position.set(0, 7, -2.5);
  root.add(arenaBack);

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
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, frontH), flat(palette.wallFront));
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
    const side = new THREE.Mesh(sideGeo, flat(palette.wallSide, { side: THREE.DoubleSide }));
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
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, Math.hypot(L, frontH - backH)), flat(palette.wallTrim));
    trim.position.set(s * (hw + 0.04), (frontH + backH) / 2, L / 2);
    trim.rotation.x = Math.atan2(frontH - backH, L);
    root.add(trim);
  }
  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.16, 0.08, 0.08), flat(palette.wallTrim));
  frontTrim.position.set(0, frontH, -0.04);
  root.add(frontTrim);

  // ── 앞벽 위 스폰서 보드 줄 ──
  const boardH = 0.7;
  const n = 4;
  const bw = W / n;
  for (let i = 0; i < n; i++) {
    const tex = sponsorTexture(SPONSORS[i], '#2a1f52', i % 2 ? '#ffc93c' : '#ffffff');
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
