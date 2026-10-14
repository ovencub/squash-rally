import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { type Vec3 } from '../physics/ball';

// 타격감 FX (기획서 3-8). 플레이(공과 라인 읽기)를 방해하지 않게 짧고 작게.
// 장식용이므로 Math.random 사용 허용.

/** 라켓 궤적을 따라 그려지는 흰 호 (레퍼런스 스윙 트레일) */
export class SwingTrail {
  readonly mesh: THREE.Mesh;
  private pts: { inner: THREE.Vector3; outer: THREE.Vector3; age: number }[] = [];
  private readonly max = 24;
  private width = 1;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.max * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.max * 2 * 4), 4));
    const idx: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
  }

  /** width: 1 = 기본, 판정이 좋을수록 굵게 */
  setWidth(w: number): void {
    this.width = w;
  }

  push(hand: THREE.Vector3, head: THREE.Vector3): void {
    const dir = head.clone().sub(hand);
    const inner = hand.clone().addScaledVector(dir, 1 - 0.55 * this.width);
    this.pts.unshift({ inner, outer: head.clone().addScaledVector(dir, 0.15), age: 0 });
    if (this.pts.length > this.max) this.pts.pop();
  }

  update(dt: number): void {
    const life = tuning.fx.swingTrailMs / 1000;
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].age > life) this.pts.pop();
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.mesh.geometry.attributes.color as THREE.BufferAttribute;
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      if (!p) {
        pos.setXYZ(i * 2, 0, -100, 0);
        pos.setXYZ(i * 2 + 1, 0, -100, 0);
        continue;
      }
      pos.setXYZ(i * 2, p.inner.x, p.inner.y, p.inner.z);
      pos.setXYZ(i * 2 + 1, p.outer.x, p.outer.y, p.outer.z);
      const a = i < n ? Math.max(0, 1 - p.age / life) * (1 - i / this.max) : 0;
      col.setXYZW(i * 2, 1, 1, 1, a * 0.35);
      col.setXYZW(i * 2 + 1, 1, 1, 1, a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }
}

function radialTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,240,170,0.9)');
  grad.addColorStop(1, 'rgba(255,200,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

/** 타점 섬광 + 방사형 스파크 */
export class ImpactFx {
  readonly group = new THREE.Group();
  private tex = radialTexture();
  private items: { obj: THREE.Object3D; age: number; life: number; kind: 'flash' | 'spark'; vel?: THREE.Vector3; size: number }[] = [];

  burst(at: Vec3, strength: number): void {
    const life = tuning.fx.flashMs / 1000;
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
    );
    sp.position.set(at.x, at.y, at.z);
    sp.renderOrder = 30;
    this.group.add(sp);
    this.items.push({ obj: sp, age: 0, life, kind: 'flash', size: 0.35 + 0.35 * strength });
    const n = Math.round(5 + 5 * strength);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(0.12)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff2a8, transparent: true, depthTest: false }));
      line.position.set(at.x, at.y, at.z);
      line.renderOrder = 31;
      this.group.add(line);
      this.items.push({ obj: line, age: 0, life: life * 1.6, kind: 'spark', vel: dir.multiplyScalar(3 + 4 * strength), size: 1 });
    }
  }

  update(dt: number): void {
    for (const it of this.items) {
      it.age += dt;
      const k = it.age / it.life;
      const mat = (it.obj as THREE.Sprite | THREE.Line).material as THREE.Material & { opacity: number };
      mat.opacity = Math.max(0, 1 - k);
      if (it.kind === 'flash') it.obj.scale.setScalar(it.size * (0.6 + 0.8 * k));
      else it.obj.position.addScaledVector(it.vel!, dt);
    }
    for (const it of this.items.filter((i) => i.age >= i.life)) {
      this.group.remove(it.obj);
      ((it.obj as THREE.Mesh).material as THREE.Material).dispose();
    }
    this.items = this.items.filter((i) => i.age < i.life);
  }
}

/** 공 잔상: 빠를수록 길게 */
export class BallTrail {
  readonly group = new THREE.Group();
  private ghosts: THREE.Mesh[] = [];
  private hist: THREE.Vector3[] = [];

  constructor() {
    for (let i = 0; i < tuning.fx.ballTrailMaxLen; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }),
      );
      m.visible = false;
      this.ghosts.push(m);
      this.group.add(m);
    }
  }

  update(pos: Vec3 | null, speed: number): void {
    if (!pos) {
      this.hist = [];
      this.ghosts.forEach((g) => (g.visible = false));
      return;
    }
    this.hist.unshift(new THREE.Vector3(pos.x, pos.y, pos.z));
    if (this.hist.length > this.ghosts.length + 1) this.hist.pop();
    const len = Math.min(this.ghosts.length, Math.floor(speed / 1.6));
    const r = tuning.physics.ballRadius * tuning.fx.ballVisualScale;
    this.ghosts.forEach((g, i) => {
      const p = this.hist[i + 1];
      g.visible = !!p && i < len;
      if (!g.visible) return;
      const k = 1 - i / Math.max(1, len);
      g.position.copy(p);
      g.scale.setScalar(r * (0.4 + 0.5 * k));
      (g.material as THREE.MeshBasicMaterial).opacity = 0.45 * k;
    });
  }
}

function dashedRing(segments: number, fill: number): THREE.BufferGeometry {
  // 바닥(XZ) 위 점선 원: 반지름 1, 두께 0.12
  const pos: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = a0 + (fill / segments) * Math.PI * 2;
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      const b0 = a0 + ((a1 - a0) * s) / steps;
      const b1 = a0 + ((a1 - a0) * (s + 1)) / steps;
      const p = (a: number, r: number) => [Math.cos(a) * r, 0, Math.sin(a) * r];
      pos.push(...p(b0, 0.88), ...p(b0, 1), ...p(b1, 1), ...p(b0, 0.88), ...p(b1, 1), ...p(b1, 0.88));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** 타이밍 가이드: 예상 타점 바닥에 좁혀지는 빨간 점선 링 + 캐릭터 타격 범위 원 */
export class TimingGuide {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private dot: THREE.Mesh;
  private reach: THREE.Mesh;

  constructor() {
    const mat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(dashedRing(18, 0.6), mat(0xff3b4e, 0.95));
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), mat(0xff3b4e, 0.45));
    this.reach = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 48).rotateX(-Math.PI / 2), mat(0x58b8ff, 0.3));
    for (const m of [this.ring, this.dot, this.reach]) m.renderOrder = 12;
    this.group.add(this.ring, this.dot, this.reach);
  }

  /** target: 예상 타점, remain: 남은 시간(s), good: 캐릭터가 제자리에 있음 */
  update(target: Vec3 | null, remain: number, good: boolean, player: { x: number; z: number }, showReach: boolean): void {
    this.ring.visible = this.dot.visible = !!target;
    if (target) {
      const k = Math.max(0, Math.min(1, remain / 0.9));
      const r = 0.16 + (tuning.fx.timingRingStartRadius - 0.16) * k;
      this.ring.position.set(target.x, 0.012, target.z);
      this.ring.scale.setScalar(r);
      this.ring.rotation.y += 0.02;
      this.dot.position.set(target.x, 0.011, target.z);
      this.dot.scale.setScalar(0.14);
      const color = good ? 0x3ddc84 : 0xff3b4e;
      (this.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
      (this.dot.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
    this.reach.visible = showReach;
    this.reach.position.set(player.x, 0.01, player.z);
    this.reach.scale.setScalar(tuning.timing.reach);
  }
}

/** 앞벽에 공 맞은 자리 먼지 링 */
export class WallMarks {
  readonly group = new THREE.Group();
  private items: { m: THREE.Mesh; age: number }[] = [];

  add(at: Vec3): void {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.11, 20),
      new THREE.MeshBasicMaterial({ color: 0x8a7fb0, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    m.position.set(at.x, at.y, 0.035);
    m.renderOrder = 11;
    this.group.add(m);
    this.items.push({ m, age: 0 });
  }

  update(dt: number): void {
    const life = tuning.fx.wallMarkMs / 1000;
    for (const it of this.items) {
      it.age += dt;
      const k = it.age / life;
      (it.m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
      it.m.scale.setScalar(1 + k * 0.8);
    }
    for (const it of this.items.filter((i) => i.age >= life)) {
      this.group.remove(it.m);
      (it.m.material as THREE.Material).dispose();
      it.m.geometry.dispose();
    }
    this.items = this.items.filter((i) => i.age < life);
  }
}

/** 미세 화면 진동: 빠르게 감쇠 */
export class Shake {
  private amp = 0;
  private t = 0;
  private dur = 0.1;

  kick(amp: number): void {
    this.amp = Math.max(this.amp, amp);
    this.t = 0;
    this.dur = tuning.fx.shake.durationMs / 1000;
  }

  update(dt: number): { x: number; y: number } {
    if (this.amp <= 0) return { x: 0, y: 0 };
    this.t += dt;
    const k = Math.max(0, 1 - this.t / this.dur);
    if (k === 0) {
      this.amp = 0;
      return { x: 0, y: 0 };
    }
    const a = this.amp * k * k;
    return { x: (Math.random() * 2 - 1) * a, y: (Math.random() * 2 - 1) * a };
  }
}
