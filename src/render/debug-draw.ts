import * as THREE from 'three';
import { type BallContact, type Surface } from '../physics/ball';
import { type Prediction } from '../physics/predict';

const SURFACE_COLOR: Record<Surface, number> = {
  front: 0x3ddc84,
  tin: 0xff3355,
  left: 0x4da3ff,
  right: 0x4da3ff,
  back: 0x7fe7ff,
  floor: 0xffd23c,
};

/** 접촉 면에 붙는 링 마커 */
function ringFor(ct: BallContact, color: number, size: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(size * 0.6, size, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }),
  );
  m.renderOrder = 20;
  const p = ct.point;
  const off = 0.01;
  switch (ct.surface) {
    case 'floor':
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, off, p.z);
      break;
    case 'front':
    case 'tin':
      m.position.set(p.x, p.y, off + 0.03);
      break;
    case 'left':
    case 'right':
      m.rotation.y = Math.PI / 2;
      m.position.set(p.x, p.y, p.z);
      break;
    case 'back':
      m.position.set(p.x, p.y, p.z);
      break;
  }
  return m;
}

/** 디버그용: 궤적 예측선, 예측 충돌점, 실제 충돌 자국, 판정 위치 */
export class DebugDraw {
  readonly group = new THREE.Group();
  private line: THREE.Line;
  private predicted = new THREE.Group();
  private actual = new THREE.Group();

  constructor() {
    this.line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.8, depthTest: false }),
    );
    this.line.renderOrder = 19;
    this.group.add(this.line, this.predicted, this.actual);
  }

  setPrediction(pred: Prediction | null, show: { line: boolean; contacts: boolean }): void {
    this.predicted.clear();
    this.line.visible = !!pred && show.line;
    if (!pred) return;
    const pts = pred.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.line.computeLineDistances();
    if (show.contacts) {
      for (const ct of pred.contacts.slice(0, 8)) this.predicted.add(ringFor(ct, SURFACE_COLOR[ct.surface], 0.09));
    }
  }

  addActual(ct: BallContact, show: boolean): void {
    if (!show) return;
    const m = ringFor(ct, SURFACE_COLOR[ct.surface], 0.14);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.5;
    this.actual.add(m);
    while (this.actual.children.length > 12) this.actual.remove(this.actual.children[0]);
  }

  markResult(ct: BallContact | undefined): void {
    if (!ct) return;
    this.actual.add(ringFor(ct, 0xff2244, 0.32));
  }

  clearActual(): void {
    this.actual.clear();
  }
}
