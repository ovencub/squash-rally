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
  idleT: number;
  /** 하체·기울기 움직임 기억 (발 디딤, 가속, 스프링) */
  loco: Loco;
  /** 임팩트 때 공 쪽으로 내딛는 시각적 이동량 (월드, 게임 위치에 더해서 그림) */
  lunge: THREE.Vector3;
}

/** 블렌딩되는 상체 관절 각도 묶음 (하체는 발 디딤 + IK) */
interface Pose {
  spineX: number; // 앞으로 숙임(음수)
  spineY: number; // 몸통 비틀기
  spineZ: number; // 옆으로 기울기
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
    spineX: -0.22,
    spineY: 0,
    spineZ: 0,
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
    idleT: 0,
    lunge: new THREE.Vector3(),
    loco: createLoco(),
  };
  applyUpper(ch);
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
  /** 준비 동작 중 예상 타점(월드) — 공이 오기 전에 그쪽으로 미리 발을 내딛음 */
  aimBall?: THREE.Vector3 | null;
}

/** 스윙 진행도에서 임팩트 순간 (맞히면 이 지점부터 재생) */
export const SWING_CONTACT = 0.3;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type ArmKey = Pose['armR'];
/** 스윙 키: 상체 비틀기·숙임, 골반(엉덩이) 회전, 체중 이동(0 뒷발 → 1 앞발), 라켓 팔, 왼팔 */
type SwingKey = { spineY: number; spineX: number; hipY: number; weight: number; arm: ArmKey; armL: Pose['armL'] };

// 스윙 키프레임: [백스윙, 임팩트, 팔로스루]. 골반이 어깨보다 먼저 돌고(꼬임), 왼팔은 반대로 뻗어 균형.
const FORE: SwingKey[] = [
  {
    spineY: -0.95,
    spineX: -0.22,
    hipY: -0.45,
    weight: 0.2,
    arm: { x: -0.2, y: 0.3, z: 1.4, elbow: 1.7, wrist: 1.2 },
    armL: { x: 0.9, z: -0.25, elbow: 0.5 },
  },
  {
    spineY: 0.1,
    spineX: -0.45,
    hipY: 0.25,
    weight: 0.85,
    arm: { x: 0.5, y: 0, z: 0.85, elbow: 0.25, wrist: 0.4 },
    armL: { x: 0.35, z: -1.05, elbow: 0.35 },
  },
  {
    spineY: 1.05,
    spineX: -0.32,
    hipY: 0.5,
    weight: 1,
    arm: { x: 1.7, y: -0.4, z: 0.4, elbow: 1.5, wrist: 0.6 },
    armL: { x: 0.2, z: -0.7, elbow: 1.1 },
  },
];
const BACK: SwingKey[] = [
  {
    spineY: 1.05,
    spineX: -0.22,
    hipY: 0.5,
    weight: 0.2,
    arm: { x: 1.3, y: -0.6, z: -0.6, elbow: 1.9, wrist: 1.3 },
    armL: { x: 0.85, z: 0.25, elbow: 1.5 },
  },
  {
    spineY: -0.1,
    spineX: -0.45,
    hipY: -0.2,
    weight: 0.85,
    arm: { x: 0.6, y: 0.2, z: -0.8, elbow: 0.25, wrist: 0.4 },
    armL: { x: -0.35, z: -0.9, elbow: 0.3 },
  },
  {
    spineY: -0.95,
    spineX: -0.28,
    hipY: -0.45,
    weight: 1,
    arm: { x: 1.4, y: 0.5, z: 1.0, elbow: 0.7, wrist: 0.5 },
    armL: { x: -0.2, z: -0.5, elbow: 0.8 },
  },
];

function swingKey(keys: SwingKey[], t: number): SwingKey {
  const [A, B, k] = t < SWING_CONTACT ? [keys[0], keys[1], smooth(t / SWING_CONTACT)] : [keys[1], keys[2], smooth((t - SWING_CONTACT) / (1 - SWING_CONTACT))];
  return {
    spineY: lerp(A.spineY, B.spineY, k),
    spineX: lerp(A.spineX, B.spineX, k),
    hipY: lerp(A.hipY, B.hipY, k),
    weight: lerp(A.weight, B.weight, k),
    arm: {
      x: lerp(A.arm.x, B.arm.x, k),
      y: lerp(A.arm.y, B.arm.y, k),
      z: lerp(A.arm.z, B.arm.z, k),
      elbow: lerp(A.arm.elbow, B.arm.elbow, k),
      wrist: lerp(A.arm.wrist, B.arm.wrist, k),
    },
    armL: { x: lerp(A.armL.x, B.armL.x, k), z: lerp(A.armL.z, B.armL.z, k), elbow: lerp(A.armL.elbow, B.armL.elbow, k) },
  };
}

// ── 하체: 발 디딤 + 다리 IK ──
// 발은 월드에 디딘 채 고정되고, 몸이 멀어지면 그때 한 발씩 내딛는다(미끄러짐 없음).
// 출발 첫걸음, 급정지 때 앞에 박는 브레이크 발 + 따라붙는 마무리 걸음, 방향 전환 스텝 같은 '연결 동작'이 여기서 저절로 나온다.

/** 발 하나의 상태 (월드 좌표) */
export interface Foot {
  x: number;
  z: number;
  /** 바닥에서 든 높이 */
  h: number;
  air: boolean;
  fromX: number;
  fromZ: number;
  t: number;
  dur: number;
  lift: number;
}

/** 프레임 사이에 이어지는 움직임 기억 (가속도, 스프링, 발) */
export interface Loco {
  init: boolean;
  feet: [Foot, Foot];
  vx: number;
  vz: number;
  ax: number;
  az: number;
  yaw: number;
  /** 몸 기울기 스프링 (앞 +, 오른쪽 +) — 덜 감쇠시켜 멈출 때 한 번 출렁이고 자리 잡음 */
  leanF: number;
  leanFv: number;
  leanS: number;
  leanSv: number;
  /** 골반 눌림 스프링 (착지·브레이크 충격 흡수) */
  drop: number;
  dropV: number;
  pelvisY: number;
  /** 골반 수평 이동 (체중 이동, 루트 로컬) */
  shiftX: number;
  shiftZ: number;
  hipY: number;
  /** 스윙 시작 순간의 달리기 기세 (0 서서 → 1 전력질주) 와 진행 방향(로컬) */
  swingMom: number;
  swingDirX: number;
  swingDirF: number;
  wasSwing: boolean;
  lastX: number;
  lastZ: number;
  /** 급정지 전환 (1 → 0, 약 0.45초): 브레이크 발을 앞에 박고 낮게 버텼다가 일어남. 방향 = 멈추기 전 진행 방향(로컬) */
  stopK: number;
  stopX: number;
  stopF: number;
  /** 최근 최고 속력 (급정지 세기 판단) */
  recentSpeed: number;
}

export function createLoco(): Loco {
  const foot = (): Foot => ({ x: 0, z: 0, h: 0, air: false, fromX: 0, fromZ: 0, t: 0, dur: 0.2, lift: 0 });
  return {
    init: false,
    feet: [foot(), foot()],
    vx: 0,
    vz: 0,
    ax: 0,
    az: 0,
    yaw: 0,
    leanF: 0,
    leanFv: 0,
    leanS: 0,
    leanSv: 0,
    drop: 0,
    dropV: 0,
    pelvisY: 0.82,
    shiftX: 0,
    shiftZ: 0,
    hipY: 0,
    swingMom: 0,
    swingDirX: 0,
    swingDirF: 0,
    wasSwing: false,
    lastX: 0,
    lastZ: 0,
    stopK: 0,
    stopX: 0,
    stopF: 0,
    recentSpeed: 0,
  };
}

/** 감쇠 스프링 한 스텝: 목표 x0로, 고유진동수 w(rad/s), 감쇠비 z */
function spring(x: number, v: number, x0: number, w: number, z: number, dt: number): [number, number] {
  v += (w * w * (x0 - x) - 2 * z * w * v) * dt;
  return [x + v * dt, v];
}

// 걸음·자세 튜닝 (렌더 전용)
const LEG = THIGH + SHIN;
const STANCE_W = 0.19; // 준비 자세 발 간격(반)
const RUN_W = 0.1;
const READY_Y = 0.8; // 준비 자세 골반 높이 (무릎 굽힘)
const RUN_Y = 0.84;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _e = new THREE.Euler();

/** 루트 로컬(x 오른쪽, f 앞) → 월드 xz */
function toWorld(ch: Character, yaw: number, x: number, f: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // 로컬 (x, z=-f) 를 yaw만큼 회전
  const lz = -f;
  return [ch.root.position.x + x * c + lz * s, ch.root.position.z - x * s + lz * c];
}
/** 월드 xz → 루트 로컬 (x 오른쪽, f 앞) */
function toLocal(ch: Character, yaw: number, wx: number, wz: number): [number, number] {
  const dx = wx - ch.root.position.x;
  const dz = wz - ch.root.position.z;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [dx * c - dz * s, -(dx * s + dz * c)];
}

/**
 * 하체 목표: 각 발의 '있어야 할 자리'(루트 로컬)와 골반 높이.
 * 준비 자세(넓게) ↔ 달리기(좁게), 준비 동작/스윙 때는 칠 쪽 발을 공 방향으로 내딛음(런지).
 */
function footHomes(ch: Character, st: AnimState, run: number, swingW: number, lead: number, reach: { x: number; f: number; far: number }): [number, number][] {
  // (reach는 준비 동작 중 예상 타점으로 바뀔 수 있음)
  const L = ch.loco;
  const w = lerp(STANCE_W, RUN_W, run);
  const homes: [number, number][] = [
    [-w, 0.02],
    [w, -0.02],
  ];
  // 준비 동작: 예상 타점 쪽으로 미리 내딛어(스텝 인) 공이 올 때 이미 런지 자세. 타점을 모르면 칠 쪽 발만 살짝 엶
  const prep = st.swing === null ? (st.prep ?? 0) : 0;
  let lungeW = swingW;
  if (prep > 0) {
    if (st.aimBall) {
      const [bx, bf] = toLocal(ch, L.yaw, st.aimBall.x, st.aimBall.z);
      reach = { x: bx, f: bf, far: clamp((Math.hypot(bx, bf) - 0.45) / 0.9, 0, 1) };
      lungeW = Math.max(lungeW, smooth(clamp((prep - 0.35) / 0.65, 0, 1)) * 0.9);
    } else {
      const side = lead === 1 ? 1 : -1;
      homes[lead] = [lerp(homes[lead][0], side * 0.26, prep * 0.6), lerp(homes[lead][1], 0.14, prep * 0.6)];
      homes[1 - lead] = [lerp(homes[1 - lead][0], -side * 0.2, prep * 0.6), lerp(homes[1 - lead][1], -0.12, prep * 0.6)];
    }
  }
  // 급정지: 진행 방향으로 브레이크 발을 앞에 박고 뒷발은 뒤에 두어 넓게 버팀 (앞쪽에 있던 발이 브레이크 발)
  if (L.stopK > 0 && lungeW === 0) {
    const k = L.stopK;
    const [l0x, l0f] = toLocal(ch, L.yaw, L.feet[0].x, L.feet[0].z);
    const [l1x, l1f] = toLocal(ch, L.yaw, L.feet[1].x, L.feet[1].z);
    const brake = l0x * L.stopX + l0f * L.stopF > l1x * L.stopX + l1f * L.stopF ? 0 : 1;
    homes[brake] = [homes[brake][0] + L.stopX * 0.38 * k, homes[brake][1] + L.stopF * 0.38 * k];
    homes[1 - brake] = [homes[1 - brake][0] - L.stopX * 0.22 * k, homes[1 - brake][1] - L.stopF * 0.22 * k];
  }
  if (lungeW > 0) {
    // 런지: 공 쪽으로 크게 내딛고(멀수록), 뒷발은 뒤로 빼서 무게중심
    const side = lead === 1 ? 1 : -1;
    const mom = L.swingMom;
    const lungeLen = 0.35 + 0.4 * reach.far + 0.2 * mom;
    const dl = Math.hypot(reach.x, reach.f) || 1;
    let ux = reach.x / dl;
    let uf = reach.f / dl;
    // 달리면서 칠 때는 진행 방향으로 더 쏠림 (관성)
    ux = lerp(ux, L.swingDirX, mom * 0.5);
    uf = lerp(uf, L.swingDirF, mom * 0.5);
    const n = Math.hypot(ux, uf) || 1;
    const leadX = side * 0.12 + (ux / n) * lungeLen;
    const leadF = (uf / n) * lungeLen + 0.08;
    const backX = -side * 0.16 - (ux / n) * 0.18;
    const backF = -(uf / n) * 0.28 - 0.12;
    homes[lead] = [lerp(homes[lead][0], leadX, lungeW), lerp(homes[lead][1], leadF, lungeW)];
    homes[1 - lead] = [lerp(homes[1 - lead][0], backX, lungeW), lerp(homes[1 - lead][1], backF, lungeW)];
  }
  return homes;
}

/**
 * 발 디딤 갱신. 서 있을 자리(home)에서 너무 멀어진 발부터 한 발씩 내딛는다.
 * - 디딘 발은 월드에 고정 → 몸이 지나가며 발이 뒤로 빠짐. 반 보폭(속도 × 걸음 시간의 절반)보다 뒤처지면 다시 내딛음
 * - 내딛는 발의 착지점 = 착지 순간의 몸 위치 + 디딘 동안 몸이 지나갈 거리의 절반 → 발이 몸 아래를 지나감
 * - 브레이크 중엔 착지점을 더 앞에 박아 버팀 (급정지 첫 발) → 몸이 멈추면 뒷발이 따라붙어 마무리
 */
function stepFeet(ch: Character, dt: number, homesLocal: [number, number][], speed: number, braking: number, swingW: number): void {
  const L = ch.loco;
  const sp = clamp(speed / 6.5, 0, 1);
  const dur = lerp(0.23, 0.115, sp) * (swingW > 0 ? 0.8 : 1);
  const halfStride = speed * dur * 0.5;
  const stand = homesLocal.map(([x, f]) => toWorld(ch, L.yaw, x, f));
  const err = L.feet.map((ft, i) => Math.hypot(ft.x - stand[i][0], ft.z - stand[i][1]));
  const order = err[0] >= err[1] ? [0, 1] : [1, 0];
  const thresh = Math.max(speed > 0.6 ? 0.06 : 0.1, halfStride + 0.03);
  for (const i of order) {
    const ft = L.feet[i];
    const other = L.feet[1 - i];
    if (!ft.air) {
      const canStep = !other.air || other.t > (speed > 3 ? 0.55 : 0.8);
      if ((err[i] > thresh && canStep) || err[i] > 0.9) {
        ft.air = true;
        ft.fromX = ft.x;
        ft.fromZ = ft.z;
        ft.t = 0;
        ft.dur = dur;
        ft.lift = 0.04 + 0.11 * sp;
      }
    }
    if (ft.air) {
      ft.t = Math.min(1, ft.t + dt / ft.dur);
      // 남은 비행 시간 + 디딤 절반 동안 몸이 갈 거리만큼 앞 (브레이크면 더 앞)
      const ahead = (1 - ft.t) * ft.dur + ft.dur * (0.5 + 0.5 * braking);
      const tx = stand[i][0] + L.vx * ahead;
      const tz = stand[i][1] + L.vz * ahead;
      const s = smooth(ft.t);
      ft.x = lerp(ft.fromX, tx, s);
      ft.z = lerp(ft.fromZ, tz, s);
      ft.h = ft.lift * Math.sin(Math.PI * ft.t);
      if (ft.t >= 1) {
        ft.air = false;
        ft.h = 0;
        // 착지 충격: 골반이 살짝 눌렸다 올라옴 (빠를수록, 브레이크일수록 크게)
        L.dropV -= 0.3 + 0.8 * sp + 0.8 * braking;
      }
    }
  }
}

/** 다리 2-본 IK: 골반 → 발목이 목표점에 닿도록 엉덩관절(쿼터니언)·무릎을 맞추고 발바닥은 바닥과 평행 */
function solveLeg(ch: Character, i: number, ankleW: THREE.Vector3, footYaw: number, toe: number): void {
  const leg = ch.legs[i];
  const pelvis = ch.pelvis;
  // 골반 로컬에서 계산
  const T = _a.copy(ankleW);
  pelvis.worldToLocal(T);
  const H = leg.hip.position;
  const D = _b.copy(T).sub(H);
  const len = clamp(D.length(), 0.2, LEG - 0.004);
  const dir = D.normalize();
  // 무릎은 앞(-z)·약간 바깥쪽
  const side = i === 0 ? -1 : 1;
  const pole = _c.set(side * 0.18, 0, -1);
  pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (pole.lengthSq() < 1e-6) pole.set(0, 0, -1);
  pole.normalize();
  const a1 = Math.acos(clamp((THIGH * THIGH + len * len - SHIN * SHIN) / (2 * THIGH * len), -1, 1));
  const u = dir.clone().multiplyScalar(Math.cos(a1)).add(pole.clone().multiplyScalar(Math.sin(a1))).normalize();
  const K = H.clone().add(u.clone().multiplyScalar(THIGH));
  const F = H.clone().add(dir.clone().multiplyScalar(len));
  const s = F.sub(K).normalize();
  let zAxis = s.clone().sub(u.clone().multiplyScalar(s.dot(u)));
  if (zAxis.lengthSq() < 1e-6) zAxis = pole.clone().negate();
  zAxis.normalize();
  const Y = u.clone().negate();
  const X = new THREE.Vector3().crossVectors(Y, zAxis).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  _m.makeBasis(X, Y, Z);
  leg.hip.quaternion.setFromRotationMatrix(_m);
  const knee = Math.acos(clamp(u.dot(s), -1, 1));
  leg.knee.rotation.set(-knee, 0, 0);
  // 발: 월드에서 (몸 방향 + footYaw)으로 바닥과 평행, toe = 발끝 들기(-)/찍기(+)
  ch.root.updateMatrixWorld(true);
  leg.knee.getWorldQuaternion(_qa);
  _qb.setFromEuler(_e.set(toe, ch.root.rotation.y + footYaw, 0, 'YXZ'));
  leg.foot.quaternion.copy(_qa.invert().multiply(_qb));
}

// ── 목표 자세 (상체) ──

function targetPose(ch: Character, dt: number, st: AnimState, run: number): Pose {
  const p = basePose();
  const L = ch.loco;
  ch.idleT += dt;

  // 달릴 때 팔 흔들기: 발 위치와 반대로 (왼발이 앞이면 왼팔은 뒤)
  const lf = toLocal(ch, L.yaw, L.feet[0].x, L.feet[0].z)[1];
  const rf = toLocal(ch, L.yaw, L.feet[1].x, L.feet[1].z)[1];
  const swingArm = clamp((rf - lf) * 1.6, -1, 1);
  p.armL.x += swingArm * 1.1 * run;
  p.armL.elbow += 0.45 * run;
  p.armR.x += -swingArm * 0.35 * run;
  // 급정지: 왼팔을 옆으로 벌려 균형
  p.armL.z -= 0.7 * L.stopK;
  p.armL.x += 0.3 * L.stopK;
  // 몸통: 달리기 쪽으로 어깨가 살짝 비틀림
  p.spineY += -swingArm * 0.12 * run;

  // 정지 시 숨쉬듯 들썩이는 준비 자세 + 라켓 끝 까딱
  const idle = 1 - run;
  p.armR.wrist += Math.sin(ch.idleT * 3.1) * 0.06 * idle;
  p.spineX += Math.sin(ch.idleT * 2.2) * 0.025 * idle;

  // 준비 동작: 공 쪽으로 어깨를 돌리고 라켓을 뒤로 뺌 (어느 손으로 칠지 미리 보여줌)
  if (st.swing === null && st.prep && st.prep > 0) {
    const k0 = (st.hand === 'fore' ? FORE : BACK)[0];
    const w = smooth(st.prep) * 0.9;
    p.spineY = lerp(p.spineY, k0.spineY, w);
    for (const key of ['x', 'y', 'z', 'elbow', 'wrist'] as const) p.armR[key] = lerp(p.armR[key], k0.arm[key], w);
    for (const key of ['x', 'z', 'elbow'] as const) p.armL[key] = lerp(p.armL[key], k0.armL[key], w * 0.8);
  }

  if (st.swing !== null) {
    const keys = st.hand === 'fore' ? FORE : BACK;
    const k = swingKey(keys, st.swing);
    const mom = L.swingMom;
    // 뛰면서 칠 때: 몸이 앞으로 쏠린 채 짧고 간결하게 휘두르고(팔로스루 덜 돎) 균형 팔을 크게 벌림
    p.spineY = k.spineY * (1 - 0.25 * mom);
    p.spineX = k.spineX - 0.12 * mom;
    p.armR = k.arm;
    p.armL = { x: k.armL.x, z: k.armL.z - 0.25 * mom, elbow: k.armL.elbow * (1 - 0.4 * mom) };
  }
  if (st.contact && st.contact.w > 0) contactBody(ch, p, st);
  return p;
}

/**
 * 임팩트 순간 상체: 공이 멀수록 공 쪽으로 몸을 기울이고, 낮을수록 더 숙인다. (하체 런지는 footHomes가 담당)
 */
function contactBody(ch: Character, p: Pose, st: AnimState): void {
  const c = st.contact!;
  const w = c.w;
  const [rx, rf] = toLocal(ch, ch.loco.yaw, c.ball.x, c.ball.z);
  const h = c.ball.y;
  const dist = Math.hypot(rx, rf);
  const far = clamp((dist - 0.45) / 0.9, 0, 1);
  const low = clamp((1.0 - h) / 0.8, 0, 1);
  const side = st.hand === 'fore' ? 1 : -1;
  p.spineZ = lerp(p.spineZ, -Math.sign(rx || side) * (0.12 + 0.38 * far), w);
  p.spineX = lerp(p.spineX, -0.35 - 0.35 * low - 0.2 * far * Math.max(0, rf / Math.max(dist, 0.01)), w);
  p.spineY = lerp(p.spineY, st.hand === 'fore' ? -0.1 : 0.45, w);
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
    ch.pelvis.position.x += _v.x * Math.cos(ch.root.rotation.y) - _v.z * Math.sin(ch.root.rotation.y);
    ch.pelvis.position.z += _v.x * Math.sin(ch.root.rotation.y) + _v.z * Math.cos(ch.root.rotation.y);
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
  cur.spineX = lerp(cur.spineX, tgt.spineX, k);
  cur.spineY = lerp(cur.spineY, tgt.spineY, k);
  cur.spineZ = lerp(cur.spineZ, tgt.spineZ, k);
  for (const key of ['x', 'y', 'z', 'elbow', 'wrist'] as const) cur.armR[key] = lerp(cur.armR[key], tgt.armR[key], k);
  for (const key of ['x', 'z', 'elbow'] as const) cur.armL[key] = lerp(cur.armL[key], tgt.armL[key], k);
}

/** 상체 포즈를 관절에 적용 */
function applyUpper(ch: Character): void {
  const p = ch.pose;
  const L = ch.loco;
  // 가속 기울기: 골반이 절반, 척추가 절반 (앞 + → 앞으로 숙임)
  ch.spine.rotation.set(p.spineX - L.leanF * 0.55, p.spineY - L.hipY, p.spineZ - L.leanS * 0.6, 'YXZ');
  const R = p.armR;
  ch.armR.shoulder.rotation.set(R.x, R.y, R.z, 'YXZ');
  ch.armR.elbow.rotation.x = R.elbow;
  ch.racket.rotation.set(R.wrist, 0, 0);
  const A = p.armL;
  ch.armL.shoulder.rotation.set(A.x, 0, A.z, 'YXZ');
  ch.armL.elbow.rotation.x = A.elbow;
}

/**
 * 프레임마다 호출.
 * 1) 속도 변화로 가속도를 구해 몸을 기울이고(출발: 앞으로 쏠림, 급정지: 뒤로 버팀 → 스프링으로 한 번 출렁이고 자리 잡음)
 * 2) 발을 월드에 디딘 채 필요할 때만 내딛게 하고 다리는 IK로 그 발에 맞춤
 * 3) 상체는 목표 자세로 블렌딩, 스윙·임팩트 IK는 그 위에.
 * 히트스톱 중엔 그대로 멈춤.
 */
export function animateCharacter(ch: Character, dtIn: number, st: AnimState): void {
  if (st.frozen && !st.snap) return;
  const L = ch.loco;
  const dt = Math.min(dtIn, 1 / 30);
  const root = ch.root;

  // 처음이거나 순간이동(새 랠리 배치 등)이면 발을 제자리로
  const jumped = Math.hypot(root.position.x - L.lastX, root.position.z - L.lastZ) > 1.2;
  if (!L.init || jumped) {
    L.init = true;
    L.yaw = 0;
    root.rotation.y = 0;
    L.feet.forEach((ft, i) => {
      [ft.x, ft.z] = toWorld(ch, 0, i === 0 ? -STANCE_W : STANCE_W, 0);
      ft.air = false;
      ft.h = 0;
    });
    L.vx = st.vx;
    L.vz = st.vz;
  }
  L.lastX = root.position.x;
  L.lastZ = root.position.z;

  if (dt > 0) {
    // 가속도 (살짝 거른 값)
    const k = 1 - Math.exp(-dt / 0.04);
    L.ax += ((st.vx - L.vx) / dt - L.ax) * k;
    L.az += ((st.vz - L.vz) / dt - L.az) * k;
    L.vx = st.vx;
    L.vz = st.vz;
  }
  const speed = Math.hypot(st.vx, st.vz);
  const run = clamp(speed / (st.maxSpeed * 0.6), 0, 1);

  // 스윙 시작 순간의 기세를 기억 (서서 친 건지, 달려오며 친 건지)
  const swinging = st.swing !== null;
  if (swinging && !L.wasSwing) {
    L.swingMom = clamp(speed / (st.maxSpeed * 0.75), 0, 1);
    const [dx, df] = toLocal(ch, L.yaw, root.position.x + st.vx, root.position.z + st.vz);
    const n = Math.hypot(dx, df) || 1;
    L.swingDirX = dx / n;
    L.swingDirF = df / n;
  }
  L.wasSwing = swinging;

  // 몸 방향: 크게 앞/옆으로 달릴 때만 진행 방향으로 돌림 (뒤로는 앞벽을 보며 백페달). 스윙·준비 땐 앞벽 쪽
  let heading = Math.atan2(-st.vx, -st.vz);
  if (heading > Math.PI / 2) heading -= Math.PI;
  if (heading < -Math.PI / 2) heading += Math.PI;
  const face = swinging ? 0 : 1 - (st.prep ?? 0) * 0.8;
  const yawT = clamp(heading, -0.7, 0.7) * run * face;
  L.yaw += (yawT - L.yaw) * (1 - Math.exp(-10 * dt));
  root.rotation.y = L.yaw;

  // 로컬 속도·가속 (앞 +, 오른쪽 +)
  const [vxL, vfL] = toLocal(ch, L.yaw, root.position.x + st.vx, root.position.z + st.vz);
  const [axL, afL] = toLocal(ch, L.yaw, root.position.x + L.ax, root.position.z + L.az);
  const fwd = speed > 0.05 ? vfL / speed : 0;
  const lat = speed > 0.05 ? vxL / speed : 0;
  // 브레이크 정도: 가속이 진행 반대 방향일 때
  const braking = speed > 0.3 ? clamp(-(axL * vxL + afL * vfL) / speed / 30, 0, 1) : 0;

  // 기울기 스프링: 가속에 비례 + 달리는 동안 앞으로 살짝 (전력질주 자세)
  // 급정지 감지: 빠르게 달리다(최근 3m/s 이상) 세게 감속하면 정지 전환 시작
  L.recentSpeed = Math.max(speed, L.recentSpeed - dt * 8);
  if (braking > 0.5 && L.recentSpeed > 3 && L.stopK < 0.2) {
    const k = clamp((L.recentSpeed - 2) / 4.5, 0.35, 1);
    L.stopK = k;
    const n = Math.hypot(vxL, vfL) || 1;
    L.stopX = vxL / n;
    L.stopF = vfL / n;
    // 버티며 뒤로 젖혀짐 + 낮게 눌림 (스프링이 이후 앞으로 한 번 출렁이고 자리 잡게 함)
    L.leanFv -= 3.2 * k * L.stopF;
    L.leanSv -= 2.6 * k * L.stopX;
    L.dropV -= 1.4 * k;
  }
  L.stopK = Math.max(0, L.stopK - dt / 0.45);
  // 가속은 기울기 스프링에 '힘'으로 들어감: 짧은 급정지(0.14초)도 몸이 크게 뒤로 버텼다가 앞으로 한 번 출렁이고 자리 잡음
  const leanFT = 0.3 * run * Math.max(0, fwd) - 0.06 * run * Math.max(0, -fwd) + 0.05 * run * Math.abs(lat);
  const leanST = 0.12 * run * lat;
  L.leanFv += clamp(afL, -60, 60) * 0.8 * dt;
  L.leanSv += clamp(axL, -60, 60) * 0.6 * dt;
  [L.leanF, L.leanFv] = spring(L.leanF, L.leanFv, leanFT, 11, 0.38, dt);
  [L.leanS, L.leanSv] = spring(L.leanS, L.leanSv, leanST, 11, 0.42, dt);
  L.leanF = clamp(L.leanF, -0.5, 0.55);
  L.leanS = clamp(L.leanS, -0.4, 0.4);

  // 스윙 하체: 칠 쪽 발, 공 방향·거리
  const lead = st.hand === 'fore' ? 1 : 0;
  let swingW = 0;
  let reach = { x: lead === 1 ? 0.8 : -0.8, f: 0.3, far: 0.3 };
  let low = 0;
  if (st.contact && st.contact.w > 0) {
    const [bx, bf] = toLocal(ch, L.yaw, st.contact.ball.x, st.contact.ball.z);
    reach = { x: bx, f: bf, far: clamp((Math.hypot(bx, bf) - 0.45) / 0.9, 0, 1) };
    low = clamp((1.0 - st.contact.ball.y) / 0.8, 0, 1);
  }
  if (swinging) {
    const s = st.swing!;
    // 임팩트 직전부터 내딛고, 팔로스루 끝무렵 풀림
    swingW = s < SWING_CONTACT ? smooth(clamp(s / SWING_CONTACT, 0, 1)) : 1 - smooth(clamp((s - 0.75) / 0.25, 0, 1));
  }

  // 발 디딤
  const homes = footHomes(ch, st, run, swingW, lead, reach);
  if (dt > 0) stepFeet(ch, dt, homes, speed, braking, swingW);

  // 골반 높이: 준비(낮게) ↔ 달리기(조금 높게), 스윙 런지·낮은 공이면 더 낮게, 착지·브레이크 충격 스프링
  const prep = st.swing === null ? (st.prep ?? 0) : 0;
  const baseY = lerp(READY_Y, RUN_Y, run) - 0.05 * prep - (0.08 + 0.1 * low + 0.06 * reach.far) * swingW;
  if (dt > 0) {
    L.dropV -= braking * 3 * dt; // 브레이크 중 계속 눌러 앉음
    [L.drop, L.dropV] = spring(L.drop, L.dropV, 0, 16, 0.38, dt);
  }
  // 체중 이동: 스윙 무게(뒷발 → 앞발)를 따라 골반이 칠 쪽 발 위로
  let shiftX = 0;
  let shiftF = 0;
  let hipY = 0;
  if (swinging) {
    const k = swingKey(st.hand === 'fore' ? FORE : BACK, st.swing!);
    const [lx, lf2] = toLocal(ch, L.yaw, L.feet[lead].x, L.feet[lead].z);
    const [bx, bf] = toLocal(ch, L.yaw, L.feet[1 - lead].x, L.feet[1 - lead].z);
    const mid = 0.5;
    const wgt = lerp(mid, k.weight, swingW);
    shiftX = lerp(bx, lx, wgt) * 0.75;
    shiftF = lerp(bf, lf2, wgt) * 0.75;
    hipY = k.hipY * swingW;
  } else if (prep > 0) {
    hipY = (st.hand === 'fore' ? -0.3 : 0.35) * prep;
  }
  const ks = 1 - Math.exp(-14 * dt);
  L.shiftX += (shiftX - L.shiftX) * ks;
  L.shiftZ += (shiftF - L.shiftZ) * ks;
  L.hipY += (hipY - L.hipY) * ks;
  // 브레이크: 엉덩이가 뒤로 빠지며 버팀
  const sitBack = -0.16 * braking;
  const stopEnv = L.stopK > 0 ? Math.sin(Math.PI * Math.min(1, (1 - L.stopK) * 1.6 + 0.15)) * L.stopK : 0;

  // 골반 배치 (루트 로컬)
  const pelvis = ch.pelvis;
  let py = baseY + L.drop - 0.1 * stopEnv;
  pelvis.position.set(L.shiftX - L.stopX * 0.1 * stopEnv, py, -(L.shiftZ + sitBack - L.stopF * 0.1 * stopEnv));
  pelvis.rotation.set(-L.leanF * 0.45, L.hipY, -L.leanS * 0.4, 'YXZ');
  // 다리가 닿도록 골반을 낮춤 (디딘 발 기준)
  root.updateMatrixWorld(true);
  pelvis.getWorldPosition(_T);
  for (let i = 0; i < 2; i++) {
    const ft = L.feet[i];
    ch.legs[i].hip.getWorldPosition(_S);
    const dh = Math.hypot(_S.x - ft.x, _S.z - ft.z);
    // 뒤로 빠진 채 곧 떼어질 발은 골반을 끌어내리지 않음 (다리가 쭉 펴지고 발끝이 떠서 차고 나가는 모양)
    if (dh > 0.42 && speed > 2) continue;
    // 엉덩관절 → 발목 거리가 다리 길이를 넘지 않게
    const maxY = FOOT_H + ft.h + Math.sqrt(Math.max(0.04, (LEG - 0.03) ** 2 - dh * dh)) - (_S.y - _T.y);
    if (py > maxY) py = maxY;
  }
  py = Math.max(0.6, py);
  pelvis.position.y = py;
  L.pelvisY = py;

  // 상체
  const tgt = targetPose(ch, dt, st, run);
  const rate = swinging ? 40 : 16;
  blend(ch.pose, tgt, st.snap ? 1 : 1 - Math.exp(-rate * dt));
  applyUpper(ch);

  // 다리 IK (발목 목표 = 디딘 발 + 높이). 발끝: 걸음 중엔 차고 나가며 살짝 듦
  root.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    const ft = L.feet[i];
    const toe = ft.air ? -0.35 * Math.sin(Math.PI * ft.t) * (0.5 + 0.5 * run) : 0;
    _v.set(ft.x, FOOT_H + ft.h, ft.z);
    solveLeg(ch, i, _v, 0, toe);
  }

  ch.lunge.set(0, 0, 0);
  if (st.contact && st.contact.w > 0) solveArmIK(ch, st);
}
