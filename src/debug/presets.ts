import { type CourtDims } from '../config/court';
import { aimAtFrontWall, aimForLanding } from '../physics/aim';
import { type Vec3 } from '../physics/ball';
import { launchVelocity } from '../physics/predict';
import { serviceBoxCenter, type FaultReason } from '../rules/rally';

export interface LaunchPreset {
  label: string;
  from: Vec3;
  vel: Vec3;
  serve: boolean;
  /** 기대 판정. VALID = 앞벽까지 유효 (받지 않으면 DOUBLE_BOUNCE로 친 쪽 득점) */
  expect: FaultReason | 'VALID';
}

/** 디버그 발사기 프리셋. tests/physics.test.ts에서 모든 난이도로 기대 판정을 검증한다. */
export function launchPresets(c: CourtDims): LaunchPreset[] {
  const back: Vec3 = { x: 0.8, y: 0.9, z: c.shortLineZ + Math.min(1.4, (c.length - c.shortLineZ) * 0.4) };
  const front: Vec3 = { x: 0.4, y: 0.7, z: Math.max(2.2, c.shortLineZ - 1.5) };
  const box = serviceBoxCenter('right', c);
  const serveFrom: Vec3 = { x: box.x, y: 1.3, z: box.z };
  const serveDepth = c.shortLineZ + (c.length - c.shortLineZ) * 0.5;
  const sl = c.serviceLineHeight;
  return [
    { label: '드라이브', from: back, vel: aimAtFrontWall(back, { x: 0.4, y: 2.4 }, 18, c), serve: false, expect: 'VALID' },
    { label: '크로스 드라이브', from: back, vel: aimAtFrontWall(back, { x: -1.0, y: 2.2 }, 18, c), serve: false, expect: 'VALID' },
    { label: '드롭', from: front, vel: aimAtFrontWall(front, { x: 0.3, y: c.tinHeight + 0.25 }, 8, c), serve: false, expect: 'VALID' },
    { label: '아웃(높게)', from: back, vel: aimAtFrontWall(back, { x: 0.4, y: c.frontOutHeight + 0.3 }, 18, c), serve: false, expect: 'OUT' },
    { label: '틴(낮게)', from: back, vel: aimAtFrontWall(back, { x: 0.4, y: c.tinHeight * 0.5 }, 18, c), serve: false, expect: 'TIN' },
    { label: '다운(바닥 먼저)', from: back, vel: launchVelocity(14, -20, 0), serve: false, expect: 'DOWN' },
    { label: '서브(정상)', from: serveFrom, vel: aimForLanding(serveFrom, { x: -0.3, y: sl + 1.1 }, serveDepth, c), serve: true, expect: 'VALID' },
    { label: '서브 폴트(라인 아래)', from: serveFrom, vel: aimAtFrontWall(serveFrom, { x: -0.3, y: sl - 0.3 }, 14, c), serve: true, expect: 'FAULT' },
    { label: '서브 폴트(같은 편)', from: serveFrom, vel: aimForLanding(serveFrom, { x: box.x + 0.6, y: sl + 1.1 }, serveDepth, c), serve: true, expect: 'FAULT' },
  ];
}
