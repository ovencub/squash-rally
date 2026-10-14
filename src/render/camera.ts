import * as THREE from 'three';
import { type CourtDims } from '../config/court';
import { tuning } from '../config/tuning';

/**
 * 등 뒤 3인칭 카메라. 기준 위치는 유리 뒷벽 바깥 위.
 * 방향(pitch)과 FOV는 리사이즈/코트 변경 시 "추종 범위의 모든 위치에서 코트 전체가 보이도록" 계산하고,
 * 플레이 중에는 카메라를 평행 이동만 시킨다 → 줌 흔들림 없이 코트가 화면 밖으로 나가지 않음.
 */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  private base = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private shake = new THREE.Vector3();
  private court!: CourtDims;

  fit(court: CourtDims, aspect: number): void {
    this.court = court;
    const cam = tuning.camera;
    this.base.set(0, cam.height, court.length + cam.backOffset);
    this.camera.aspect = aspect;

    const frontTop = court.frontOutHeight + tuning.court.wallMarginAbove + cam.fitTopExtra;
    const hw = court.width / 2;
    const corners = [
      new THREE.Vector3(-hw, 0, 0),
      new THREE.Vector3(hw, 0, 0),
      new THREE.Vector3(-hw, 0, court.length),
      new THREE.Vector3(hw, 0, court.length),
      new THREE.Vector3(-hw, frontTop, 0),
      new THREE.Vector3(hw, frontTop, 0),
    ];
    const offsets = [
      [-cam.followMaxX, -cam.followMaxZ],
      [cam.followMaxX, -cam.followMaxZ],
      [-cam.followMaxX, cam.followMaxZ],
      [cam.followMaxX, cam.followMaxZ],
    ];

    // pitch 반복 보정: 위/아래 극단이 화면 중앙 기준 대칭이 되도록
    let pitch = -Math.atan2(cam.height - cam.lookAtHeight, court.length * (1 - cam.lookAtZRatio) + cam.backOffset);
    let tanHalf = 0.5;
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    for (let iter = 0; iter < 8; iter++) {
      q.setFromEuler(new THREE.Euler(pitch, 0, 0, 'YXZ')).invert();
      let top = -Infinity;
      let bottom = Infinity;
      let side = 0;
      for (const [ox, oz] of offsets) {
        for (const c of corners) {
          v.copy(c).sub(this.base).sub(new THREE.Vector3(ox, 0, oz)).applyQuaternion(q);
          const depth = -v.z;
          top = Math.max(top, v.y / depth);
          bottom = Math.min(bottom, v.y / depth);
          side = Math.max(side, Math.abs(v.x / depth));
        }
      }
      const mid = (top + bottom) / 2;
      pitch += Math.atan(mid);
      tanHalf = Math.max((top - bottom) / 2, side / aspect);
    }
    tanHalf *= 1 + cam.fitMargin;
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf));
    this.camera.fov = THREE.MathUtils.clamp(fov, cam.minFov, cam.maxFov);
    this.camera.rotation.set(pitch, 0, 0, 'YXZ');
    this.camera.updateProjectionMatrix();
    this.apply();
  }

  /** 플레이어 위치를 부드럽게, 조금만 따라간다 */
  update(dt: number, player: { x: number; z: number }): void {
    const cam = tuning.camera;
    const tx = THREE.MathUtils.clamp(player.x * cam.followX, -cam.followMaxX, cam.followMaxX);
    const tz = THREE.MathUtils.clamp((player.z - this.court.shortLineZ) * cam.followZ, -cam.followMaxZ, cam.followMaxZ);
    const k = 1 - Math.exp(-cam.followSmoothing * dt);
    this.offset.x += (tx - this.offset.x) * k;
    this.offset.z += (tz - this.offset.z) * k;
    this.apply();
  }

  setShake(x: number, y: number): void {
    this.shake.set(x, y, 0);
  }

  private apply(): void {
    this.camera.position.copy(this.base).add(this.offset).add(this.shake);
  }
}
