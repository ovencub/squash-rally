import * as THREE from 'three';
import { palette } from './palette';
import { addOutline, toon } from './scene';

// 관절 캐릭터 (M3 피드백: 팔꿈치·무릎 추가, 스쿼시 선수 같은 움직임).
// 뼈대: root(바닥, 방향) → pelvis → spine → 어깨 → 위팔 → 팔꿈치 → 아래팔 → 손 → 라켓
//                              pelvis → 엉덩관절 → 허벅지 → 무릎 → 정강이 → 발
// 로컬 -z 방향(앞벽)을 바라본다. 오른손잡이. 키 약 1.75m.
// 각도 규칙: rotation.x + = 팔다리가 앞(-z)으로, 무릎/팔꿈치 굽힘은 양수 값으로 관리.

const THIGH = 0.44;
const SHIN = 0.44;
const UPPER_ARM = 0.3;
const FOREARM = 0.28;
const FOOT_H = 0.05;

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  foot: THREE.Group;
}
interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Group;
}

export interface Character {
  root: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  legs: [Leg, Leg]; // [왼, 오른]
  armL: Arm;
  armR: Arm;
  racket: THREE.Group;
  /** 라켓 헤드 중심 (트레일 바깥 끝) */
  racketHead: THREE.Object3D;
  /** 손 위치 (트레일 안쪽 끝) */
  hand: THREE.Object3D;
  pose: Pose;
  runPhase: number;
  idleT: number;
  /** 임팩트 때 공 쪽으로 내딛는 시각적 이동량 (월드, 게임 위치에 더해서 그림) */
  lunge: THREE.Vector3;
}

/** 블렌딩되는 관절 각도 묶음 */
interface Pose {
  yaw: number;
  spineX: number; // 앞으로 숙임(음수)
  spineY: number; // 몸통 비틀기
  spineZ: number; // 옆으로 기울기
  legs: { pitch: number; roll: number; knee: number }[];
  armR: { x: number; y: number; z: number; elbow: number; wrist: number };
  armL: { x: number; z: number; elbow: number };
}

function part(geo: THREE.BufferGeometry, color: number, outline = 0.018): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color));
  addOutline(m, outline);
  return m;
}

/** 피벗 아래로 len 길이 캡슐 */
function bone(len: number, radius: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const m = part(new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 4, 8), color, 0.016);
  m.position.y = -len / 2;
  g.add(m);
  return g;
}

function makeLeg(pelvis: THREE.Group, x: number, accent: number): Leg {
  const hip = bone(THIGH, 0.05, palette.limb);
  hip.position.set(x, -0.02, 0);
  pelvis.add(hip);
  // 반바지 통 (허벅지 위 55%)
  const shortsLeg = part(new THREE.CylinderGeometry(0.085, 0.078, THIGH * 0.55, 10), palette.shorts, 0.014);
  shortsLeg.position.y = -THIGH * 0.27;
  hip.add(shortsLeg);
  const knee = bone(SHIN, 0.042, palette.limb);
  knee.position.y = -THIGH;
  hip.add(knee);
  const foot = new THREE.Group();
  foot.position.y = -SHIN;
  knee.add(foot);
  const shoe = part(new THREE.BoxGeometry(0.11, 0.07, 0.24), 0xf4f1fa, 0.014);
  shoe.position.set(0, -0.005, -0.05);
  foot.add(shoe);
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.025, 0.245), toon(accent));
  sole.position.set(0, -0.045, -0.05);
  foot.add(sole);
  // 짧은 양말
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.07, 10), toon(0xffffff));
  sock.position.y = 0.06;
  foot.add(sock);
  return { hip, knee, foot };
}

function makeArm(spine: THREE.Group, x: number, accent: number | null, shirt: number): Arm {
  const shoulder = bone(UPPER_ARM, 0.036, palette.limb);
  shoulder.position.set(x, 0.47, 0);
  spine.add(shoulder);
  // 반팔 소매
  const sleeve = part(new THREE.CylinderGeometry(0.068, 0.058, UPPER_ARM * 0.5, 10), shirt, 0.014);
  sleeve.position.y = -UPPER_ARM * 0.2;
  shoulder.add(sleeve);
  const elbow = bone(FOREARM, 0.032, palette.limb);
  elbow.position.y = -UPPER_ARM;
  shoulder.add(elbow);
  const hand = new THREE.Group();
  hand.position.y = -FOREARM;
  elbow.add(hand);
  const fist = part(new THREE.SphereGeometry(0.04, 8, 6), palette.skin, 0.01);
  hand.add(fist);
  if (accent !== null) {
    // 손목 밴드
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 10), toon(accent));
    band.position.y = 0.05;
    hand.add(band);
  }
  return { shoulder, elbow, hand };
}

// ── 라켓 (실제 규격 기준) ──
// 전장 686mm(WSF 최대). 실제 라켓 사진 기준: 긴 물방울형 헤드가 전체 길이의 절반 가까이 차지하고(약 360 x 190mm),
// 스트링 면이 목(스로트) 쪽까지 길게 내려오며, 그립 위 샤프트는 짧다. 프레임 두께 약 12mm, 그립 약 260mm.
// 로컬 좌표: 손(그립 끝 근처)이 원점, 라켓은 -y 방향으로 뻗고 면의 법선은 +x.
export const RACKET = { gripTop: 0.04, gripLen: 0.26, throatY: -0.29, headTop: -0.646, headHalfW: 0.095 };
/** 손 → 헤드 중심 거리 (IK에서 아래팔 연장 길이로 씀) */
export const HAND_TO_HEAD = 0.52; // 스윗스팟 (스트링 면 위쪽 중앙)

/** 헤드 외곽(물방울) 점들: 스로트(아래)에서 시작해 한 바퀴 */
function racketOutline(inset = 0): THREE.Vector2[] {
  const R = RACKET;
  const half: [number, number][] = [
    [0.005, R.throatY],
    [0.016, -0.32],
    [0.03, -0.36],
    [0.046, -0.4],
    [0.062, -0.44],
    [0.077, -0.48],
    [0.089, -0.52],
    [R.headHalfW, -0.555],
    [0.094, -0.59],
    [0.086, -0.616],
    [0.068, -0.635],
    [0.04, -0.645],
    [0, R.headTop - 0.005],
  ];
  // 안쪽 외곽: 가로는 안으로, 세로는 넓은 부분(-0.53) 쪽으로
  const right = half.map(([x, y]) => new THREE.Vector2(Math.max(0, x - inset), y + (y > -0.53 ? -inset : inset)));
  const left = [...right].reverse().slice(1, -1).map((v) => new THREE.Vector2(-v.x, v.y));
  return [...right, ...left];
}

function createRacket(accent: number): { racket: THREE.Group; racketHead: THREE.Object3D } {
  const R = RACKET;
  const racket = new THREE.Group();
  const head = new THREE.Group(); // 면의 법선 +z → y축 90° 돌려 +x
  head.rotation.y = Math.PI / 2;
  racket.add(head);

  // 그립: 검정 그립 테이프 + 끝 캡 + 포인트색 칼라
  const grip = part(new THREE.CylinderGeometry(0.0145, 0.0135, R.gripLen, 10), 0x1d1d24, 0.006);
  grip.position.y = R.gripTop - R.gripLen / 2;
  racket.add(grip);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 10), toon(0x2a2a35));
  cap.position.y = R.gripTop + 0.006;
  racket.add(cap);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0145, 0.03, 10), toon(accent));
  collar.position.y = R.gripTop - R.gripLen - 0.012;
  racket.add(collar);
  // 샤프트 (그립 위 ~ 스로트)
  const shaftLen = R.gripTop - R.gripLen - R.throatY;
  const shaft = part(new THREE.CylinderGeometry(0.0075, 0.009, shaftLen, 8), 0x22222a, 0.005);
  shaft.position.y = R.throatY + shaftLen / 2;
  racket.add(shaft);

  // 프레임: 물방울 외곽을 따라가는 가는 튜브 (그래파이트 + 포인트색 띠)
  const pts = racketOutline().map((v) => new THREE.Vector3(v.x, v.y, 0));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const frame = part(new THREE.TubeGeometry(curve, 80, 0.0062, 6, true), 0x22222a, 0.005);
  head.add(frame);
  const stripePts = pts.filter((p) => p.y < -0.42 && p.y > -0.6);
  for (const side of [-1, 1]) {
    const seg = stripePts.filter((p) => Math.sign(p.x) === side).map((p) => new THREE.Vector3(p.x * 1.002, p.y, 0.004));
    if (seg.length > 1) head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seg), 12, 0.0045, 5), toon(accent)));
  }

  // 스트링 베드: 반투명 면 + 흰 줄 격자 (외곽 안쪽으로 클리핑)
  const inner = racketOutline(0.007);
  const bed = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape(inner)),
    new THREE.MeshBasicMaterial({ color: 0xf4f1e8, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  head.add(bed);
  const seg: number[] = [];
  const crossAt = (y: number): [number, number] | null => {
    // 수평선 y와 외곽 다각형의 교차 x 범위
    const xs: number[] = [];
    for (let i = 0; i < inner.length; i++) {
      const p = inner[i];
      const q = inner[(i + 1) % inner.length];
      if ((p.y - y) * (q.y - y) <= 0 && p.y !== q.y) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
    return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null;
  };
  const rangeAtX = (x: number): [number, number] | null => {
    const ys: number[] = [];
    for (let i = 0; i < inner.length; i++) {
      const p = inner[i];
      const q = inner[(i + 1) % inner.length];
      if ((p.x - x) * (q.x - x) <= 0 && p.x !== q.x) ys.push(p.y + ((x - p.x) * (q.y - p.y)) / (q.x - p.x));
    }
    return ys.length >= 2 ? [Math.min(...ys), Math.max(...ys)] : null;
  };
  for (let y = R.headTop + 0.014; y < R.throatY - 0.035; y += 0.0165) {
    const r = crossAt(y);
    if (r) seg.push(r[0], y, 0.001, r[1], y, 0.001);
  }
  for (let x = -R.headHalfW + 0.0115; x < R.headHalfW - 0.006; x += 0.0115) {
    const r = rangeAtX(x);
    if (r) seg.push(x, r[0], 0.001, x, r[1], 0.001);
  }
  const strings = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)),
    new THREE.LineBasicMaterial({ color: 0xf6f3ea, transparent: true, opacity: 0.85 }),
  );
  head.add(strings);

  const racketHead = new THREE.Object3D();
  racketHead.position.set(0, -HAND_TO_HEAD, 0);
  racket.add(racketHead);
  return { racket, racketHead };
}

function basePose(): Pose {
  return {
    yaw: 0,
    spineX: -0.25,
    spineY: 0,
    spineZ: 0,
    legs: [
      { pitch: 0.35, roll: -0.16, knee: 0.75 },
      { pitch: 0.35, roll: 0.16, knee: 0.75 },
    ],
    armR: { x: 0.7, y: 0, z: 0.45, elbow: 1.5, wrist: 0.9 },
    armL: { x: 0.5, z: -0.35, elbow: 1.2 },
  };
}

/** shirt: 유니폼 색, trim: 포인트 색(줄무늬·밑창·밴드) */
export function createCharacter(shirt: number, trim: number = palette.accent): Character {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  root.add(pelvis);

  const shorts = part(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 10), palette.shorts);
  shorts.position.y = 0.0;
  pelvis.add(shorts);

  const spine = new THREE.Group();
  spine.position.y = 0.08;
  pelvis.add(spine);
  const torso = part(new THREE.CylinderGeometry(0.2, 0.16, 0.48, 12), shirt);
  torso.position.y = 0.26;
  spine.add(torso);
  // 유니폼 가로 줄무늬 + 어깨 라인
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.193, 0.185, 0.06, 12), toon(trim));
  stripe.position.y = 0.33;
  spine.add(stripe);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 16), toon(trim));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.5;
  spine.add(collar);
  const head = part(new THREE.SphereGeometry(0.17, 16, 12), palette.skin);
  head.position.y = 0.68;
  spine.add(head);
  const hair = part(new THREE.SphereGeometry(0.178, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), palette.hair, 0.008);
  hair.position.y = 0.69;
  spine.add(hair);
  // 덥수룩한 머리 뭉치 (키 이미지)
  const tufts: [number, number, number, number][] = [
    [0, 0.86, 0.02, 0.085],
    [-0.09, 0.83, 0.05, 0.075],
    [0.09, 0.83, 0.05, 0.075],
    [-0.06, 0.82, 0.12, 0.07],
    [0.06, 0.82, 0.12, 0.07],
    [0, 0.8, 0.15, 0.07],
    [-0.13, 0.76, 0.06, 0.06],
    [0.13, 0.76, 0.06, 0.06],
    [0.05, 0.85, -0.07, 0.07],
    [-0.06, 0.85, -0.06, 0.065],
  ];
  for (const [tx, ty, tz, r] of tufts) {
    const t = part(new THREE.SphereGeometry(r, 10, 8), palette.hair, 0.008);
    t.position.set(tx, ty, tz);
    spine.add(t);
  }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.176, 0.176, 0.05, 16), toon(palette.headband));
  band.position.y = 0.71;
  spine.add(band);
  // 얼굴 (앞쪽 -z): 동그란 눈 두 개 — 마주 보는 AI에서 보임
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a22 });
  for (const ex of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeMat);
    eye.position.set(ex, 0.665, -0.162);
    eye.scale.set(1, 1.3, 0.5);
    spine.add(eye);
  }

  const legs: [Leg, Leg] = [makeLeg(pelvis, -0.1, trim), makeLeg(pelvis, 0.1, trim)];
  const armL = makeArm(spine, -0.22, null, shirt);
  const armR = makeArm(spine, 0.22, trim, shirt);

  const { racket, racketHead } = createRacket(trim);
  armR.hand.add(racket);

  // 발밑 그림자 (바닥 기준, 골반 높이와 무관)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.32, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.position.y = 0.008;
  shadow.renderOrder = 9;
  root.add(shadow);

  const ch: Character = {
    root,
    pelvis,
    spine,
    legs,
    armL,
    armR,
    racket,
    racketHead,
    hand: armR.hand,
    pose: basePose(),
    runPhase: 0,
    idleT: 0,
    lunge: new THREE.Vector3(),
  };
  applyPose(ch);
  return ch;
}

export interface AnimState {
  /** 월드 속도 (m/s) */
  vx: number;
  vz: number;
  maxSpeed: number;
  /** 스윙 진행 0..1, 스윙 중이 아니면 null. 임팩트는 SWING_CONTACT 지점 */
  swing: number | null;
  hand: 'fore' | 'back';
  /** 히트스톱 중이면 true → 관절이 그 자세로 멈춤 */
  frozen: boolean;
  /** 임팩트: 공 위치(월드)에 라켓 면을 맞추는 IK. w = 영향도(임팩트 1 → 팔로스루 동안 0으로) */
  contact?: { ball: THREE.Vector3; aim: THREE.Vector3; w: number } | null;
  /** 공이 다가올 때 미리 라켓을 뒤로 빼는 준비 동작 (0..1) */
  prep?: number;
  /** 새 임팩트 프레임: 히트스톱 중이어도 즉시 임팩트 자세로 맞춤 */
  snap?: boolean;
}

/** 스윙 진행도에서 임팩트 순간 (맞히면 이 지점부터 재생) */
export const SWING_CONTACT = 0.3;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

type ArmKey = Pose['armR'];
type SwingKey = { spineY: number; spineX: number; arm: ArmKey; lunge: number };

// 스윙 키프레임: [백스윙, 임팩트, 팔로스루]
const FORE: SwingKey[] = [
  { spineY: -0.85, spineX: -0.2, lunge: 0.3, arm: { x: -0.2, y: 0.3, z: 1.4, elbow: 1.7, wrist: 1.2 } },
  { spineY: 0.05, spineX: -0.45, lunge: 1, arm: { x: 0.5, y: 0, z: 0.85, elbow: 0.25, wrist: 0.4 } },
  { spineY: 0.95, spineX: -0.3, lunge: 0.6, arm: { x: 1.7, y: -0.4, z: 0.4, elbow: 1.5, wrist: 0.6 } },
];
const BACK: SwingKey[] = [
  { spineY: 0.95, spineX: -0.2, lunge: 0.3, arm: { x: 1.3, y: -0.6, z: -0.6, elbow: 1.9, wrist: 1.3 } },
  { spineY: -0.1, spineX: -0.45, lunge: 1, arm: { x: 0.6, y: 0.2, z: -0.8, elbow: 0.25, wrist: 0.4 } },
  { spineY: -0.85, spineX: -0.25, lunge: 0.6, arm: { x: 1.4, y: 0.5, z: 1.0, elbow: 0.7, wrist: 0.5 } },
];

function swingKey(keys: SwingKey[], t: number): SwingKey {
  const [a, b, c] = t < SWING_CONTACT ? [keys[0], keys[1], smooth(t / SWING_CONTACT)] : [keys[1], keys[2], smooth((t - SWING_CONTACT) / (1 - SWING_CONTACT))];
  const k = c as number;
  const A = a as SwingKey;
  const B = b as SwingKey;
  return {
    spineY: lerp(A.spineY, B.spineY, k),
    spineX: lerp(A.spineX, B.spineX, k),
    lunge: lerp(A.lunge, B.lunge, k),
    arm: {
      x: lerp(A.arm.x, B.arm.x, k),
      y: lerp(A.arm.y, B.arm.y, k),
      z: lerp(A.arm.z, B.arm.z, k),
      elbow: lerp(A.arm.elbow, B.arm.elbow, k),
      wrist: lerp(A.arm.wrist, B.arm.wrist, k),
    },
  };
}

/** 이번 프레임의 목표 자세 계산 */
function targetPose(ch: Character, dt: number, st: AnimState): Pose {
  const p = basePose();
  const speed = Math.hypot(st.vx, st.vz);
  const run = Math.min(1, speed / (st.maxSpeed * 0.55));

  // 몸 방향: 크게 앞/옆으로 달릴 때만 진행 방향으로 살짝 돌림 (뒤로는 앞벽을 보며 백페달)
  let heading = Math.atan2(-st.vx, -st.vz);
  if (heading > Math.PI / 2) heading -= Math.PI;
  if (heading < -Math.PI / 2) heading += Math.PI;
  p.yaw = st.swing === null ? Math.max(-0.6, Math.min(0.6, heading)) * run : 0;

  // 로컬 속도 (앞 = -z)
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const lx = st.vx * c - st.vz * s;
  const lz = st.vx * s + st.vz * c;
  const fwd = -lz / Math.max(speed, 1e-3); // +1 앞으로, -1 뒤로
  const lat = lx / Math.max(speed, 1e-3); // +1 오른쪽

  ch.runPhase += dt * (5 + speed * 1.9);
  ch.idleT += dt;
  const ph = ch.runPhase;
  for (let i = 0; i < 2; i++) {
    const off = i === 0 ? 0 : Math.PI;
    const sw = Math.sin(ph + off);
    const lift = Math.max(0, Math.cos(ph + off)); // 다리를 앞으로 가져올 때 무릎을 접음
    const L = p.legs[i];
    // 앞뒤 달리기: 엉덩관절 앞뒤 + 무릎 접기
    L.pitch += sw * 0.75 * run * Math.abs(fwd) * Math.sign(fwd || 1);
    L.knee += lift * 1.1 * run * Math.abs(fwd);
    // 옆 스텝(셔플): 다리 벌렸다 모으기
    const side = i === 0 ? -1 : 1;
    L.roll += side * sw * 0.22 * run * Math.abs(lat);
    L.knee += lift * 0.45 * run * Math.abs(lat);
  }
  // 정지 시 가볍게 들썩이는 준비 자세 (스플릿 스텝 느낌)
  const idle = 1 - run;
  p.legs.forEach((L) => (L.knee += Math.sin(ch.idleT * 5) * 0.06 * idle));

  // 몸통: 달릴 때 앞으로 숙이고 진행 방향으로 기울임
  p.spineX += -0.2 * run * Math.max(0, fwd) + 0.12 * run * Math.max(0, -fwd);
  p.spineZ = -lat * 0.12 * run;
  // 팔: 달릴 때 왼팔 흔들기, 라켓 팔은 조금만
  p.armL.x += -Math.sin(ph) * 0.6 * run;
  p.armR.x += Math.sin(ph) * 0.2 * run;

  // 준비 동작: 공 쪽으로 어깨를 돌리고 라켓을 뒤로 뺌 (어느 손으로 칠지 미리 보여줌)
  if (st.swing === null && st.prep && st.prep > 0) {
    const k0 = (st.hand === 'fore' ? FORE : BACK)[0];
    const w = st.prep * 0.85;
    p.spineY = lerp(p.spineY, k0.spineY, w);
    for (const key of ['x', 'y', 'z', 'elbow', 'wrist'] as const) p.armR[key] = lerp(p.armR[key], k0.arm[key], w);
    p.yaw = lerp(p.yaw, 0, w);
  }

  if (st.swing !== null) {
    const keys = st.hand === 'fore' ? FORE : BACK;
    const k = swingKey(keys, st.swing);
    p.spineY = k.spineY;
    p.spineX = k.spineX;
    p.armR = k.arm;
    p.armL = { x: 0.6, z: st.hand === 'fore' ? -0.9 : -0.3, elbow: 1.0 };
    // 런지: 공 쪽 다리를 내딛고 낮게
    const out = st.hand === 'fore' ? 1 : 0;
    const L = p.legs[out];
    const O = p.legs[1 - out];
    L.pitch = lerp(L.pitch, 0.8, k.lunge);
    L.roll = lerp(L.roll, (out ? 1 : -1) * 0.35, k.lunge);
    L.knee = lerp(L.knee, 1.25, k.lunge);
    O.pitch = lerp(O.pitch, -0.25, k.lunge);
    O.knee = lerp(O.knee, 0.9, k.lunge);
  }
  if (st.contact && st.contact.w > 0) contactBody(ch, p, st);
  return p;
}

/**
 * 임팩트 순간 몸 자세: 공이 멀수록 공 쪽으로 몸을 기울이고 다리를 크게 내딛으며,
 * 반대쪽 다리는 뒤로 뻗어 균형을 잡는다. 공이 낮으면 무릎을 굽혀 골반을 낮춘다.
 */
function contactBody(ch: Character, p: Pose, st: AnimState): void {
  const c = st.contact!;
  const w = c.w;
  const rx = c.ball.x - ch.root.position.x; // 오른쪽 +
  const rf = ch.root.position.z - c.ball.z; // 앞 +
  const h = c.ball.y;
  const dist = Math.hypot(rx, rf);
  const far = Math.min(1, Math.max(0, (dist - 0.45) / 0.9)); // 0 가까움 → 1 멀다
  const low = Math.min(1, Math.max(0, (1.0 - h) / 0.8)); // 0 높음 → 1 낮다
  const side = st.hand === 'fore' ? 1 : -1;
  // 상체: 공 쪽으로 옆 기울기 + 앞으로 숙임 (멀고 낮을수록)
  p.spineZ = lerp(p.spineZ, -Math.sign(rx || side) * (0.12 + 0.38 * far), w);
  p.spineX = lerp(p.spineX, -0.35 - 0.35 * low - 0.2 * far * Math.max(0, rf / Math.max(dist, 0.01)), w);
  p.spineY = lerp(p.spineY, st.hand === 'fore' ? -0.1 : 0.45, w);
  // 다리: 공 쪽 다리가 공 방향으로 런지, 반대 다리는 뒤로 뻗어 무게중심
  const lead = p.legs[side > 0 ? 1 : 0];
  const back = p.legs[side > 0 ? 0 : 1];
  const fwdK = Math.max(-0.3, rf / Math.max(dist, 0.01));
  const latK = Math.abs(rx) / Math.max(dist, 0.01);
  lead.pitch = lerp(lead.pitch, 0.35 + (0.55 + 0.3 * fwdK) * (0.4 + 0.6 * far), w);
  lead.roll = lerp(lead.roll, side * (0.15 + 0.5 * latK * far), w);
  lead.knee = lerp(lead.knee, 0.9 + 0.5 * far + 0.5 * low, w);
  back.pitch = lerp(back.pitch, -0.2 - 0.35 * far, w);
  back.roll = lerp(back.roll, -side * 0.08, w);
  back.knee = lerp(back.knee, 0.45 + 0.6 * low, w);
  p.yaw = lerp(p.yaw, 0, w);
}

const _v = new THREE.Vector3();
const _S = new THREE.Vector3();
const _T = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const UPPER = UPPER_ARM;
const LOWER = FOREARM + HAND_TO_HEAD; // 아래팔 + 라켓을 일직선으로 본 길이

/**
 * 2-본 IK: 어깨 → 팔꿈치 → (손 + 라켓) 끝이 공에 닿도록 팔을 맞추고, 라켓 면을 친 방향(aim)으로 돌린다.
 * 팔이 닿지 않을 만큼 멀면 몸 전체(루트)를 공 쪽으로 살짝 내딛게 해서 메운다.
 */
function solveArmIK(ch: Character, st: AnimState): void {
  const c = st.contact!;
  const w = c.w;
  ch.root.updateMatrixWorld(true);
  const sh = ch.armR.shoulder;
  sh.getWorldPosition(_S);
  _T.copy(c.ball);
  const maxReach = UPPER + LOWER - 0.01;
  const short = _S.distanceTo(_T) - maxReach;
  if (short > 0) {
    // 모자란 만큼 (최대 0.35m) 몸을 공 쪽 수평으로 내딛음
    _v.set(_T.x - _S.x, 0, _T.z - _S.z).normalize().multiplyScalar(Math.min(0.35, short) * w);
    ch.lunge.copy(_v);
    ch.root.position.add(_v);
    ch.root.updateMatrixWorld(true);
    sh.getWorldPosition(_S);
  }

  // 어깨 부모(척추) 공간에서 계산
  const spine = ch.spine;
  const Sl = sh.position.clone();
  const Tl = spine.worldToLocal(_T.clone());
  const toT = Tl.clone().sub(Sl);
  const d = Math.min(maxReach, Math.max(Math.abs(UPPER - LOWER) + 0.02, toT.length()));
  const dir = toT.normalize();
  // 팔꿈치가 향할 쪽 (포핸드: 아래·뒤 / 백핸드: 아래·앞)
  const pole = st.hand === 'fore' ? new THREE.Vector3(0.3, -1, 0.5) : new THREE.Vector3(-0.2, -1, -0.6);
  const pPerp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (pPerp.lengthSq() < 1e-6) pPerp.set(0, -1, 0);
  pPerp.normalize();
  const alpha = Math.acos(Math.min(1, Math.max(-1, (UPPER * UPPER + d * d - LOWER * LOWER) / (2 * UPPER * d))));
  const u = dir.clone().multiplyScalar(Math.cos(alpha)).add(pPerp.clone().multiplyScalar(Math.sin(alpha))).normalize();
  const E = Sl.clone().add(u.clone().multiplyScalar(UPPER));
  const f = Sl.clone().add(dir.clone().multiplyScalar(d)).sub(E).normalize();
  // 위팔 로컬 축: -y = u, -z = (u에 수직인 f 성분) → 팔꿈치 굽힘(+x 회전)이 f 쪽으로
  let q = f.clone().sub(u.clone().multiplyScalar(f.dot(u)));
  if (q.lengthSq() < 1e-6) q = pPerp.clone().negate();
  q.normalize();
  const Y = u.clone().negate();
  const Z = q.clone().negate();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  _m.makeBasis(X, Y, Z);
  _q.setFromRotationMatrix(_m);
  sh.quaternion.slerp(_q, w);
  ch.armR.elbow.rotation.x = lerp(ch.armR.elbow.rotation.x, Math.acos(Math.min(1, Math.max(-1, u.dot(f)))), w);

  // 라켓: 아래팔과 일직선, 면(로컬 +x)을 친 방향으로
  ch.racket.rotation.x = lerp(ch.racket.rotation.x, 0, w);
  ch.root.updateMatrixWorld(true);
  const n = c.aim.clone().sub(c.ball).normalize();
  ch.armR.hand.getWorldQuaternion(_q);
  n.applyQuaternion(_q.invert());
  const theta = Math.atan2(-n.z, n.x);
  ch.racket.rotation.y = lerp(0, theta, w);
}

function blend(cur: Pose, tgt: Pose, k: number): void {
  cur.yaw = lerp(cur.yaw, tgt.yaw, k);
  cur.spineX = lerp(cur.spineX, tgt.spineX, k);
  cur.spineY = lerp(cur.spineY, tgt.spineY, k);
  cur.spineZ = lerp(cur.spineZ, tgt.spineZ, k);
  for (let i = 0; i < 2; i++) {
    cur.legs[i].pitch = lerp(cur.legs[i].pitch, tgt.legs[i].pitch, k);
    cur.legs[i].roll = lerp(cur.legs[i].roll, tgt.legs[i].roll, k);
    cur.legs[i].knee = lerp(cur.legs[i].knee, tgt.legs[i].knee, k);
  }
  for (const key of ['x', 'y', 'z', 'elbow', 'wrist'] as const) cur.armR[key] = lerp(cur.armR[key], tgt.armR[key], k);
  for (const key of ['x', 'z', 'elbow'] as const) cur.armL[key] = lerp(cur.armL[key], tgt.armL[key], k);
}

/** 포즈를 관절에 적용하고, 디딘 발이 바닥에 닿도록 골반 높이를 맞춘다 */
function applyPose(ch: Character): void {
  const p = ch.pose;
  ch.root.rotation.y = p.yaw;
  let reach = 0;
  ch.legs.forEach((leg, i) => {
    const L = p.legs[i];
    leg.hip.rotation.set(L.pitch, 0, L.roll);
    leg.knee.rotation.x = -L.knee;
    leg.foot.rotation.x = -(L.pitch - L.knee); // 발바닥은 바닥과 평행
    const ext = (THIGH * Math.cos(L.pitch) + SHIN * Math.cos(L.pitch - L.knee)) * Math.cos(L.roll);
    reach = Math.max(reach, ext);
  });
  ch.pelvis.position.y = reach + FOOT_H + 0.02;
  ch.spine.rotation.set(p.spineX, p.spineY, p.spineZ, 'YXZ');
  const R = p.armR;
  ch.armR.shoulder.rotation.set(R.x, R.y, R.z, 'YXZ');
  ch.armR.elbow.rotation.x = R.elbow;
  ch.racket.rotation.set(R.wrist, 0, 0);
  const A = p.armL;
  ch.armL.shoulder.rotation.set(A.x, 0, A.z, 'YXZ');
  ch.armL.elbow.rotation.x = A.elbow;
}

/** 프레임마다 호출: 목표 자세로 부드럽게 블렌딩 (스윙 중엔 빠르게). 히트스톱 중엔 그대로 멈춤. */
export function animateCharacter(ch: Character, dt: number, st: AnimState): void {
  if (st.frozen && !st.snap) return;
  const tgt = targetPose(ch, dt, st);
  const rate = st.swing !== null ? 40 : 16;
  blend(ch.pose, tgt, st.snap ? 1 : 1 - Math.exp(-rate * dt));
  applyPose(ch);
  ch.lunge.set(0, 0, 0);
  if (st.contact && st.contact.w > 0) solveArmIK(ch, st);
}
