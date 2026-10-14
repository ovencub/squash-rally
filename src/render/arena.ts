import * as THREE from 'three';
import { type CourtDims } from '../config/court';
import { palette } from './palette';

// 코트 바깥 아레나 (M6, 기획서 3-11: 보라 아레나 + 단순한 관중 실루엣 + 가상 스폰서).
// M6 2차: GPT 키 이미지(assets/design/01) 기준으로 관중을 밝고 다양하게, 조명·난간·유리 프레임 추가.
// 장식이라 Math.random 사용.

const SPONSORS = ['ZEPHRA', 'KORVO', 'LUMEN-9', 'TALLIX', 'BRIQ', 'NOVAPEAK'];

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function arenaFloorTexture(): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  g.fillStyle = hex(palette.arenaFloor);
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,0.035)';
  g.lineWidth = 8;
  for (let i = -s; i < s * 2; i += 24) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + s, s);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 가로로 긴 LED 광고판 텍스처 (가상 브랜드만) */
function ledTexture(names: string[]): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 96;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#1b1240';
  g.fillRect(0, 0, cv.width, cv.height);
  const w = cv.width / names.length;
  names.forEach((n, i) => {
    g.fillStyle = i % 2 ? '#2e2160' : '#24194f';
    g.fillRect(i * w + 4, 6, w - 8, cv.height - 12);
    g.fillStyle = i % 3 === 0 ? hex(palette.accent) : i % 3 === 1 ? '#ffffff' : hex(palette.playerShirt);
    g.font = 'bold 54px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n, i * w + w / 2, cv.height / 2 + 2);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Arena {
  group: THREE.Group;
  /** 매 프레임: 관중 들썩임 */
  tick: (time: number) => void;
  /** 득점 등에서 관중 환호 (0..1) */
  cheer: (amount: number) => void;
}

export function createArena(c: CourtDims): Arena {
  const group = new THREE.Group();
  const L = c.length;
  const hw = c.width / 2;

  // 바닥
  const ftex = arenaFloorTexture();
  ftex.repeat.set(20, 20);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: ftex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.02, L / 2);
  group.add(floor);
  // 코트 주변 은은한 조명 번짐
  const glowCv = document.createElement('canvas');
  glowCv.width = glowCv.height = 128;
  const gg = glowCv.getContext('2d')!;
  const grad = gg.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, 'rgba(140,110,255,0.35)');
  grad.addColorStop(1, 'rgba(140,110,255,0)');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 128, 128);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(c.width + 7, L + 7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowCv), transparent: true, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, -0.015, L / 2);
  group.add(glow);

  // 앞벽 뒤 배경 벽
  const back = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), new THREE.MeshBasicMaterial({ color: palette.arenaWall }));
  back.position.set(0, 8, -3);
  group.add(back);
  // 좌우 관중석 (계단 3단) + 관중
  const tiers = 3;
  const tierDepth = 0.95;
  const tierRise = 0.5;
  const standMat = new THREE.MeshBasicMaterial({ color: 0x1e1546 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x3a2a7a });
  const zFrom = -0.5;
  const zTo = L + 3.5;
  const seats: { x: number; y: number; z: number; face: number }[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < tiers; i++) {
      const x = s * (hw + 1.4 + i * tierDepth + tierDepth / 2);
      const h = (i + 1) * tierRise;
      const step = new THREE.Mesh(new THREE.BoxGeometry(tierDepth, h, zTo - zFrom), standMat);
      step.position.set(x, h / 2 - 0.02, (zFrom + zTo) / 2);
      group.add(step);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, zTo - zFrom), edgeMat);
      edge.position.set(x - (s * tierDepth) / 2, h, (zFrom + zTo) / 2);
      group.add(edge);
      for (let z = zFrom + 0.4; z < zTo - 0.3; z += 0.62) {
        if (Math.random() < 0.18) continue; // 빈 자리
        seats.push({ x: x + (Math.random() - 0.5) * 0.15, y: h, z: z + (Math.random() - 0.5) * 0.15, face: s });
      }
    }
    // 관중석 앞 낮은 광고판 (옆벽 바깥)
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(zTo - zFrom - 1, 0.5),
      new THREE.MeshBasicMaterial({ map: ledTexture(SPONSORS.slice(s < 0 ? 0 : 3).concat(SPONSORS.slice(0, 3))), color: 0x9a92c0 }),
    );
    board.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    board.position.set(s * (hw + 1.0), 0.3, (zFrom + zTo) / 2);
    group.add(board);
  }

  // 관중 (M6 2차, 키 이미지 기준): 몸통(셔츠 색) + 머리(피부색) + 머리카락을 각각 인스턴싱
  const body = new THREE.CylinderGeometry(0.17, 0.21, 0.55, 8);
  body.translate(0, 0.28, 0);
  const headGeo = new THREE.SphereGeometry(0.13, 10, 8);
  headGeo.translate(0, 0.7, 0);
  const hairGeo = new THREE.SphereGeometry(0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hairGeo.translate(0, 0.72, 0);
  const mat = () => new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(body, mat(), seats.length);
  const heads = new THREE.InstancedMesh(headGeo, mat(), seats.length);
  const hairs = new THREE.InstancedMesh(hairGeo, mat(), seats.length);
  const crowdParts = [bodies, heads, hairs];
  const shirtColors = [0xff7a6e, 0x2fc2b3, 0xffc93c, 0x8a6cf0, 0x4d8ef0, 0xff8fb8, 0xff9f45, 0x6a5ab8];
  const skinColors = [0xf4c9a4, 0xe0a87e, 0xc58a62, 0xf7d6bc];
  const hairColors = [0x1c1626, 0x2b1d14, 0x3a2a1a, 0x101018];
  const col = new THREE.Color();
  const phase = seats.map(() => Math.random() * Math.PI * 2);
  const dim = new THREE.Color(palette.arenaWall);
  seats.forEach((_, i) => {
    // 멀리 있는 관중이라 아레나 색으로 살짝 눌러 공 읽기를 방해하지 않게
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    bodies.setColorAt(i, col.setHex(pick(shirtColors)).lerp(dim, 0.25));
    heads.setColorAt(i, col.setHex(pick(skinColors)).lerp(dim, 0.2));
    hairs.setColorAt(i, col.setHex(pick(hairColors)));
  });
  group.add(...crowdParts);

  // 관중석 난간 + 조명 점
  const railMat = new THREE.MeshBasicMaterial({ color: 0x8f7ad8 });
  const glowTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g2 = cv.getContext('2d')!;
    const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(230,210,255,0.85)');
    gr.addColorStop(1, 'rgba(160,120,255,0)');
    g2.fillStyle = gr;
    g2.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, zTo - zFrom), railMat);
    rail.position.set(s * (hw + 1.4), 0.95, (zFrom + zTo) / 2);
    group.add(rail);
    for (let z = zFrom; z <= zTo; z += 1.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.95, 0.03), railMat);
      post.position.set(s * (hw + 1.4), 0.475, z);
      group.add(post);
    }
    // 관중석 위 조명 (키 이미지의 빛나는 점들)
    for (let z = 0; z <= L + 2; z += 2.2) {
      const light = new THREE.Sprite(glowMat);
      light.scale.setScalar(0.45);
      light.position.set(s * (hw + 1.4 + tiers * tierDepth + 0.6), tiers * tierRise + 2.4, z);
      group.add(light);
    }
  }
  for (let x = -9; x <= 9; x += 3) {
    const light = new THREE.Sprite(glowMat);
    light.scale.setScalar(0.6);
    light.position.set(x, 9.5, -2.8);
    group.add(light);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  let excite = 0;
  let lastT = 0;
  const tick = (t: number) => {
    const dt = Math.min(0.05, Math.max(0, t - lastT));
    lastT = t;
    excite = Math.max(0, excite - dt * 0.6);
    seats.forEach((s, i) => {
      const bob = Math.max(0, Math.sin(t * (2 + excite * 6) + phase[i])) * (0.02 + excite * 0.18);
      pos.set(s.x, s.y + bob, s.z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.face < 0 ? -Math.PI / 2 : Math.PI / 2);
      m.compose(pos, q, sc);
      for (const part of crowdParts) part.setMatrixAt(i, m);
    });
    for (const part of crowdParts) part.instanceMatrix.needsUpdate = true;
  };
  tick(0);

  // 유리 뒷벽 프레임: 패널 기둥 + 위 레일 (키 이미지)
  const postMat = new THREE.MeshBasicMaterial({ color: 0x2a2050 });
  const backH = c.backOutHeight + 0.25;
  const panels = Math.max(3, Math.round(c.width / 1.5));
  for (let i = 0; i <= panels; i++) {
    const x = -hw + (c.width * i) / panels;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, backH, 0.05), postMat);
    post.position.set(x, backH / 2, L + 0.03);
    group.add(post);
    // 유리 고정 클램프
    for (const y of [0.35, backH - 0.35]) {
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.06), postMat);
      clamp.position.set(x, y, L + 0.04);
      group.add(clamp);
    }
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(c.width, 0.05, 0.06), postMat);
  rail.position.set(0, backH, L + 0.03);
  group.add(rail);

  return { group, tick, cheer: (a) => (excite = Math.min(1, excite + a)) };
}
