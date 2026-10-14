import * as THREE from 'three';
import { palette } from './palette';
import { addOutline, toon } from './scene';

export interface Character {
  root: THREE.Group;
  /** 몸통 회전(스윙 비틀기)용 */
  body: THREE.Group;
  legs: THREE.Group[];
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  /** 라켓 헤드 중심 (트레일/타점 위치용) */
  racketHead: THREE.Object3D;
  /** 손 위치 (트레일 안쪽 끝) */
  hand: THREE.Object3D;
  runPhase: number;
}

function part(geo: THREE.BufferGeometry, color: number, outline = 0.012): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color));
  addOutline(m, outline);
  return m;
}

function limb(len: number, radius: number, color: number): THREE.Group {
  // 피벗이 위쪽 끝에 오는 팔다리
  const g = new THREE.Group();
  const m = part(new THREE.CapsuleGeometry(radius, len - radius * 2, 4, 8), color, 0.01);
  m.position.y = -len / 2;
  g.add(m);
  return g;
}

/** 기본 도형 캐릭터. 로컬 -z 방향(앞벽)을 바라본다. 키 약 1.75m */
export function createCharacter(shirt: number): Character {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = limb(0.82, 0.045, palette.limb);
    leg.position.set(s * 0.11, 0.86, 0);
    leg.rotation.z = s * 0.12;
    const shoe = part(new THREE.BoxGeometry(0.11, 0.07, 0.22), palette.shorts);
    shoe.position.set(0, -0.8, -0.03);
    leg.add(shoe);
    root.add(leg);
    legs.push(leg);
  }

  const shorts = part(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 10), palette.shorts);
  shorts.position.y = 0.92;
  body.add(shorts);

  const torso = part(new THREE.CylinderGeometry(0.2, 0.17, 0.5, 10), shirt);
  torso.position.y = 1.28;
  body.add(torso);

  const head = part(new THREE.SphereGeometry(0.17, 16, 12), palette.skin);
  head.position.y = 1.7;
  body.add(head);
  const hair = part(new THREE.SphereGeometry(0.172, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), palette.shorts, 0.006);
  hair.position.y = 1.71;
  body.add(hair);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.176, 0.176, 0.05, 16), toon(palette.headband));
  band.position.y = 1.73;
  body.add(band);

  const leftArm = limb(0.62, 0.035, palette.limb);
  leftArm.position.set(-0.25, 1.48, 0);
  leftArm.rotation.z = -0.35;
  body.add(leftArm);

  const rightArm = limb(0.62, 0.035, palette.limb);
  rightArm.position.set(0.25, 1.48, 0);
  body.add(rightArm);

  const hand = new THREE.Object3D();
  hand.position.y = -0.6;
  rightArm.add(hand);

  const racket = new THREE.Group();
  const handle = part(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), palette.racketFrame, 0.006);
  handle.position.y = -0.15;
  racket.add(handle);
  const frame = part(new THREE.TorusGeometry(0.11, 0.012, 6, 20), palette.racketFrame, 0.006);
  frame.scale.set(0.85, 1.15, 1);
  frame.position.y = -0.42;
  racket.add(frame);
  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(0.105, 20),
    new THREE.MeshBasicMaterial({ color: palette.racketString, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  strings.scale.copy(frame.scale);
  strings.position.copy(frame.position);
  racket.add(strings);
  const racketHead = new THREE.Object3D();
  racketHead.position.copy(frame.position);
  racket.add(racketHead);
  racket.position.y = -0.62;
  rightArm.add(racket);

  return { root, body, legs, leftArm, rightArm, racketHead, hand, runPhase: 0 };
}

export interface AnimState {
  /** 이동 속도 (m/s) */
  speed: number;
  /** 스윙 진행 0..1, 스윙 중이 아니면 null */
  swing: number | null;
  /** +1 포핸드, -1 백핸드 */
  side: 1 | -1;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** 절차 애니메이션: 달리기(다리 흔들기) + 스윙(몸 비틀기 + 팔 휘두르기) */
export function animateCharacter(ch: Character, dt: number, st: AnimState): void {
  ch.runPhase += dt * (4 + st.speed * 2.2);
  const run = Math.min(1, st.speed / 3);
  ch.legs[0].rotation.x = Math.sin(ch.runPhase) * 0.7 * run;
  ch.legs[1].rotation.x = -Math.sin(ch.runPhase) * 0.7 * run;
  ch.root.position.y = Math.abs(Math.sin(ch.runPhase)) * 0.05 * run;
  ch.leftArm.rotation.x = -Math.sin(ch.runPhase) * 0.5 * run;

  const arm = ch.rightArm;
  if (st.swing === null) {
    // 준비 자세: 라켓을 들고 있음
    ch.body.rotation.y = lerp(ch.body.rotation.y, 0, Math.min(1, dt * 10));
    arm.rotation.set(lerp(arm.rotation.x, -0.9, Math.min(1, dt * 10)), 0, lerp(arm.rotation.z, 0.55, Math.min(1, dt * 10)));
    return;
  }
  const t = ease(st.swing);
  if (st.side === 1) {
    // 포핸드: 오른쪽 뒤 → 앞으로 휘두르며 몸을 왼쪽으로 비틈
    ch.body.rotation.y = lerp(-0.7, 0.7, t);
    arm.rotation.set(lerp(0.4, -1.9, t), lerp(-0.6, 0.6, t), lerp(1.4, 0.4, t));
  } else {
    // 백핸드: 왼쪽 어깨 위 → 오른쪽 앞으로
    ch.body.rotation.y = lerp(0.9, -0.5, t);
    arm.rotation.set(lerp(-1.2, -1.6, t), lerp(1.2, -0.4, t), lerp(-0.6, 1.2, t));
  }
}
