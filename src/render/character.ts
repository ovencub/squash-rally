import * as THREE from 'three';
import { palette } from './palette';
import { addOutline, toon } from './scene';

export interface Character {
  root: THREE.Group;
  racket: THREE.Group;
  rightArm: THREE.Group;
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

  for (const s of [-1, 1]) {
    const leg = limb(0.82, 0.045, palette.limb);
    leg.position.set(s * 0.11, 0.86, 0);
    leg.rotation.z = s * 0.12;
    root.add(leg);
    const shoe = part(new THREE.BoxGeometry(0.11, 0.07, 0.22), palette.shorts);
    shoe.position.set(s * 0.2, 0.04, -0.03);
    root.add(shoe);
  }

  const shorts = part(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 10), palette.shorts);
  shorts.position.y = 0.92;
  root.add(shorts);

  const torso = part(new THREE.CylinderGeometry(0.2, 0.17, 0.5, 10), shirt);
  torso.position.y = 1.28;
  root.add(torso);

  const head = part(new THREE.SphereGeometry(0.17, 16, 12), palette.skin);
  head.position.y = 1.7;
  root.add(head);
  const hair = part(new THREE.SphereGeometry(0.172, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), palette.shorts, 0.006);
  hair.position.y = 1.71;
  root.add(hair);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.176, 0.176, 0.05, 16), toon(palette.headband));
  band.position.y = 1.73;
  root.add(band);

  const leftArm = limb(0.62, 0.035, palette.limb);
  leftArm.position.set(-0.25, 1.48, 0);
  leftArm.rotation.z = -0.35;
  root.add(leftArm);

  const rightArm = limb(0.62, 0.035, palette.limb);
  rightArm.position.set(0.25, 1.48, 0);
  rightArm.rotation.set(-0.5, 0, 0.45);
  root.add(rightArm);

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
  racket.position.y = -0.62;
  rightArm.add(racket);

  return { root, racket, rightArm };
}
