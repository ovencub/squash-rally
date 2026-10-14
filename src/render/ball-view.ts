import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { type BallState } from '../physics/ball';
import { addOutline, toon } from './scene';

/** 공 + 바닥 그림자(높이 읽기용). 공은 판정 반지름보다 크게 그린다 (tuning.fx.ballVisualScale) */
export class BallView {
  readonly group = new THREE.Group();
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;

  constructor() {
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), toon(0x1a1a22));
    addOutline(this.ball, 0.12);
    // 노란 점 2개 (실제 스쿼시 공 표식)
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffc93c });
    for (const s of [-1, 1]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), dotMat);
      dot.position.set(s * 0.55, 0.55, 0.62);
      this.ball.add(dot);
    }
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.ball, this.shadow);
    this.group.visible = false;
  }

  update(b: BallState | null): void {
    this.group.visible = !!b;
    if (!b) return;
    const r = tuning.physics.ballRadius * tuning.fx.ballVisualScale;
    this.ball.scale.setScalar(r);
    // 판정 반지름보다 크게 그리므로 바닥/벽에 묻히지 않게 표시 위치만 살짝 띄움
    const lift = r - tuning.physics.ballRadius;
    this.ball.position.set(b.pos.x, b.pos.y + lift, b.pos.z);
    this.ball.rotation.x -= b.vel.z * 0.02;
    this.ball.rotation.z += b.vel.x * 0.02;
    const h = b.pos.y;
    this.shadow.position.set(b.pos.x, 0.006, b.pos.z);
    this.shadow.scale.setScalar(r * (1.1 + h * 0.15));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.4 - h * 0.06);
  }
}
