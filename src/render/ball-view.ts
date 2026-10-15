import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { type BallState } from '../physics/ball';
import { addOutline, toon } from './scene';

/** 공 + 바닥 그림자(높이 읽기용). 표시 크기 = 실제 반지름 × 설정 배율 (settings.ballSize → tuning.fx.ballVisualScale) */
export class BallView {
  readonly group = new THREE.Group();
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;

  constructor() {
    // 실제 경기용 공(WSF 더블 옐로 닷): 지름 40mm 무광 검정 고무 + 작은 노란 점 2개
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), toon(0x24242c));
    addOutline(this.ball, 0.08);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd23c });
    const dotGeo = new THREE.CircleGeometry(0.16, 12);
    for (const dir of [new THREE.Vector3(0.35, 0.35, 0.87), new THREE.Vector3(0.62, 0.2, 0.76)]) {
      const n = dir.normalize();
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(n).multiplyScalar(1.005);
      dot.lookAt(n.clone().multiplyScalar(2));
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
