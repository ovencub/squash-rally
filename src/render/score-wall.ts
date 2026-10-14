import * as THREE from 'three';
import { type CourtDims } from '../config/court';

/** 앞벽에 비치는 큰 점수 (기획서 3-10, 시점 예시 이미지). 공 읽기를 방해하지 않게 반투명. */
export class ScoreWall {
  readonly mesh: THREE.Mesh;
  private cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private last = '';

  constructor(c: CourtDims) {
    this.cv.width = 1024;
    this.cv.height = 384;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const w = Math.min(3.2, c.width * 0.55);
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, (w * 384) / 1024),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    // 서비스 라인과 아웃 라인 사이
    this.mesh.position.set(0, (c.serviceLineHeight + c.frontOutHeight) / 2 + 0.1, 0.02);
    this.mesh.renderOrder = 5;
  }

  set(a: number, b: number): void {
    const text = `${a} - ${b}`;
    if (text === this.last) return;
    this.last = text;
    const g = this.cv.getContext('2d')!;
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.font = '900 300px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#2a1f52';
    g.fillText(text, 512, 200);
    this.tex.needsUpdate = true;
  }
}
