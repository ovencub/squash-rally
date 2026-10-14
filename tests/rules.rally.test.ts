import { describe, expect, it } from 'vitest';
import { buildCourt, sideOutHeight } from '../src/config/court';
import { tuning } from '../src/config/tuning';
import { applyContact, applyHit, inReceiveQuarter, newRally, type RallyState } from '../src/rules/rally';
import { contact } from './helpers';

const court = buildCourt('easy');
const r = tuning.physics.ballRadius;

function rallyAfterHit(serve = false): RallyState {
  return applyHit(newRally(2, 'A', 'right'), 'A', serve);
}
function run(s: RallyState, ...cts: Parameters<typeof applyContact>[1][]): RallyState {
  for (const ct of cts) s = applyContact(s, ct, court);
  return s;
}

describe('앞벽', () => {
  it('정상 타구는 returning으로 전환', () => {
    const s = run(rallyAfterHit(), contact('front', { y: 2 }));
    expect(s.phase).toBe('returning');
    expect(s.result).toBeNull();
  });
  it('아웃 라인에 닿으면 아웃 (라인 위 = 아웃)', () => {
    const s = run(rallyAfterHit(), contact('front', { y: court.frontOutHeight - r }));
    expect(s.result?.reason).toBe('OUT');
    expect(s.result?.loser).toBe('A');
  });
  it('아웃 라인 바로 아래는 유효', () => {
    const s = run(rallyAfterHit(), contact('front', { y: court.frontOutHeight - r - 0.001 }));
    expect(s.result).toBeNull();
  });
  it('틴 접촉은 틴', () => {
    const s = run(rallyAfterHit(), contact('tin', { y: 0.3 }));
    expect(s.result?.reason).toBe('TIN');
  });
});

describe('옆벽/뒷벽 아웃', () => {
  it('옆벽 사선 아웃 라인: 앞쪽은 높고 뒤쪽은 낮다', () => {
    const zBack = court.length * 0.9;
    const hBack = sideOutHeight(court, zBack);
    expect(run(rallyAfterHit(), contact('left', { y: hBack - r, z: zBack })).result?.reason).toBe('OUT');
    expect(run(rallyAfterHit(), contact('left', { y: hBack - r - 0.01, z: zBack })).result).toBeNull();
    // 같은 높이라도 앞쪽에서는 유효
    expect(run(rallyAfterHit(), contact('right', { y: hBack - r, z: 0.5 })).result).toBeNull();
  });
  it('뒷벽 아웃 라인', () => {
    expect(run(rallyAfterHit(), contact('back', { y: court.backOutHeight - r })).result?.reason).toBe('OUT');
  });
  it('앞벽 가는 길에 옆벽을 먼저 맞는 건 허용', () => {
    const s = run(rallyAfterHit(), contact('left', { y: 1.5, z: 3 }), contact('front', { y: 1.5 }));
    expect(s.phase).toBe('returning');
  });
});

describe('바닥', () => {
  it('앞벽 전에 바닥 → DOWN', () => {
    const s = run(rallyAfterHit(), contact('floor', { y: r, z: 3 }));
    expect(s.result?.reason).toBe('DOWN');
    expect(s.result?.loser).toBe('A');
  });
  it('두 번 바운드 → DOUBLE_BOUNCE, 받지 못한 쪽 실점', () => {
    const s = run(rallyAfterHit(), contact('front', { y: 2 }), contact('floor', { z: 6 }), contact('floor', { z: 8 }));
    expect(s.result?.reason).toBe('DOUBLE_BOUNCE');
    expect(s.result?.loser).toBe('B');
    expect(s.result?.winner).toBe('A');
  });
  it('구르기 시작 알림도 바운드로 센다', () => {
    const s = run(
      rallyAfterHit(),
      contact('front', { y: 2 }),
      contact('floor', { z: 6 }),
      contact('floor', { z: 6 }, { rolling: true }),
    );
    expect(s.result?.reason).toBe('DOUBLE_BOUNCE');
  });
  it('한 번 바운드 후 상대가 치면 계속', () => {
    let s = run(rallyAfterHit(), contact('front', { y: 2 }), contact('floor', { z: 6 }));
    s = applyHit(s, 'B');
    s = run(s, contact('front', { y: 1 }));
    expect(s.result).toBeNull();
    expect(s.lastHitter).toBe('B');
    expect(s.floorBounces).toBe(0);
  });
  it('1인 모드: 투바운드는 본인 실점', () => {
    let s = applyHit(newRally(1), 'A');
    s = run(s, contact('front', { y: 2 }), contact('floor', { z: 6 }), contact('floor', { z: 7 }));
    expect(s.result?.loser).toBe('A');
  });
});

describe('서브', () => {
  const goodLanding = { x: -1.5, z: court.shortLineZ + 1 }; // 오른쪽 박스 서브 → 왼쪽 뒤 사각형
  it('정상 서브', () => {
    const s = run(rallyAfterHit(true), contact('front', { y: 2.5 }), contact('floor', goodLanding));
    expect(s.result).toBeNull();
    expect(s.floorBounces).toBe(1);
  });
  it('서비스 라인 위(라인 포함)는 폴트', () => {
    const s = run(rallyAfterHit(true), contact('front', { y: court.serviceLineHeight + r }));
    expect(s.result?.reason).toBe('FAULT');
  });
  it('서비스 라인 바로 위는 유효', () => {
    const s = run(rallyAfterHit(true), contact('front', { y: court.serviceLineHeight + r + 0.001 }));
    expect(s.result).toBeNull();
  });
  it('같은 편 사각형에 떨어지면 폴트', () => {
    const s = run(rallyAfterHit(true), contact('front', { y: 2.5 }), contact('floor', { x: 1.5, z: court.shortLineZ + 1 }));
    expect(s.result?.reason).toBe('FAULT');
  });
  it('숏 라인 앞(또는 라인 위)에 떨어지면 폴트', () => {
    const s = run(rallyAfterHit(true), contact('front', { y: 2.5 }), contact('floor', { x: -1.5, z: court.shortLineZ }));
    expect(s.result?.reason).toBe('FAULT');
  });
  it('리시버가 바운드 전에 발리하면 서브 유효', () => {
    let s = run(rallyAfterHit(true), contact('front', { y: 2.5 }));
    s = applyHit(s, 'B');
    s = run(s, contact('front', { y: 1.5 }), contact('floor', { x: 1.5, z: court.shortLineZ - 1 }));
    expect(s.result).toBeNull();
    expect(s.isServe).toBe(false);
  });
  it('서브가 옆벽을 먼저 맞으면 폴트', () => {
    const s = run(rallyAfterHit(true), contact('left', { y: 2, z: 4 }));
    expect(s.result?.reason).toBe('FAULT');
  });
  it('서브가 틴/아웃이면 폴트', () => {
    expect(run(rallyAfterHit(true), contact('tin', { y: 0.2 })).result?.reason).toBe('FAULT');
    expect(run(rallyAfterHit(true), contact('front', { y: 5 })).result?.reason).toBe('FAULT');
  });
  it('왼쪽 박스 서브는 오른쪽 뒤 사각형', () => {
    expect(inReceiveQuarter(1.5, court.shortLineZ + 1, 'left', court)).toBe(true);
    expect(inReceiveQuarter(-1.5, court.shortLineZ + 1, 'left', court)).toBe(false);
    expect(inReceiveQuarter(0, court.shortLineZ + 1, 'left', court)).toBe(false); // 하프코트 라인 위
  });
});

it('종료 후 접촉은 무시', () => {
  const s = run(rallyAfterHit(), contact('tin', { y: 0.2 }), contact('front', { y: 2 }));
  expect(s.result?.reason).toBe('TIN');
  expect(s.phase).toBe('over');
});
