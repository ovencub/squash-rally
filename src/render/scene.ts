import * as THREE from 'three';
import { palette } from './palette';

let toonGradient: THREE.Texture | null = null;

/** 3단 셀 셰이딩용 그라디언트 맵 */
function getToonGradient(): THREE.Texture {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  toonGradient = tex;
  return tex;
}

export function toon(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: getToonGradient() });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: palette.outline, side: THREE.BackSide });

/** 역면 확대 방식 외곽선을 메시에 붙인다 (thickness = 노멀 방향 확대량, m) */
export function addOutline(mesh: THREE.Mesh, thickness = 0.015): THREE.Mesh {
  const geo = mesh.geometry.clone();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nrm.getX(i) * thickness,
      pos.getY(i) + nrm.getY(i) * thickness,
      pos.getZ(i) + nrm.getZ(i) * thickness,
    );
  }
  const outline = new THREE.Mesh(geo, outlineMat);
  outline.raycast = () => {};
  mesh.add(outline);
  return outline;
}

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.sky);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6655aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 10, 8);
  scene.add(sun);
  return scene;
}
