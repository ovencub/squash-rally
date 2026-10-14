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

function makeArm(spine: THREE.Group, x: number, accent: number | null): Arm {
  const shoulder = bone(UPPER_ARM, 0.036, palette.limb);
  shoulder.position.set(x, 0.47, 0);
  spine.add(shoulder);
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
  const hair = part(new THREE.SphereGeometry(0.172, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), palette.shorts, 0.006);
  hair.position.y = 0.69;
  spine.add(hair);
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
  const armL = makeArm(spine, -0.22, null);
  const armR = makeArm(spine, 0.22, trim);

  // 라켓: 손에서 아래팔 방향으로 뻗음
  const racket = new THREE.Group();
  const handle = part(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6), palette.racketFrame, 0.006);
  handle.position.y = -0.14;
  racket.add(handle);
  const frame = part(new THREE.TorusGeometry(0.11, 0.012, 6, 20), palette.racketFrame, 0.006);
  frame.scale.set(0.85, 1.15, 1);
  frame.position.y = -0.4;
  frame.rotation.y = Math.PI / 2;
  racket.add(frame);
  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(0.105, 20),
    new THREE.MeshBasicMaterial({ color: palette.racketString, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  strings.scale.copy(frame.scale);
  strings.position.copy(frame.position);
  strings.rotation.copy(frame.rotation);
  racket.add(strings);
  const racketHead = new THREE.Object3D();
  racketHead.position.copy(frame.position);
  racket.add(racketHead);
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
  return p;
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
  if (st.frozen) return;
  const tgt = targetPose(ch, dt, st);
  const rate = st.swing !== null ? 40 : 16;
  blend(ch.pose, tgt, 1 - Math.exp(-rate * dt));
  applyPose(ch);
}
