import { test, expect } from '@playwright/test';

// M1: 디버그 프리셋을 실제 브라우저에서 쏴서 판정과 화면(예측선·충돌점·판정 배너)을 확인한다.
type W = { __firePreset: (i: number) => void; __world: { rally: { result: { reason: string } | null } } };

const CASES = [
  { i: 0, name: 'drive', expect: 'DOUBLE_BOUNCE' },
  { i: 2, name: 'drop', expect: 'DOUBLE_BOUNCE' },
  { i: 3, name: 'out', expect: 'OUT' },
  { i: 4, name: 'tin', expect: 'TIN' },
  { i: 6, name: 'serve', expect: 'DOUBLE_BOUNCE' },
  { i: 8, name: 'serve_fault', expect: 'FAULT' },
];

test('presets in browser', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('./');
  await page.waitForTimeout(1000);
  for (const c of CASES) {
    await page.evaluate((i) => (window as unknown as W).__firePreset(i), c.i);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/shots/m1_${c.name}_flight.png` });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/shots/m1_${c.name}_mid.png` });
    await page.waitForTimeout(1700);
    await page.screenshot({ path: `test-results/shots/m1_${c.name}_result.png` });
    const reason = await page.evaluate(() => (window as unknown as W).__world.rally.result?.reason);
    expect(reason, c.name).toBe(c.expect);
  }
});
