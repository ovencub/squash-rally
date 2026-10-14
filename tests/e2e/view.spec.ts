import { test, expect } from '@playwright/test';

// 화면비별로 코트 전체가 보이는지 스크린샷으로 확인하고 FPS를 기록한다.
const VIEWPORTS = [
  { name: '16x9', width: 1600, height: 900 },
  { name: '4x3', width: 1200, height: 900 },
  { name: '21x9', width: 2100, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`view ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('./');
    await page.waitForTimeout(1500);
    for (const [key, name] of [['Digit1', 'easy'], ['Digit2', 'normal'], ['Digit3', 'hard']] as const) {
      await page.keyboard.press(key);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/shots/${vp.name}_${name}.png` });
    }
    // 플레이어를 오른쪽 앞으로 이동시켜 카메라 추종 확인
    await page.keyboard.press('Digit1');
    await page.keyboard.down('KeyD');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/shots/${vp.name}_moved.png` });
    const fps = await page.evaluate(() => (window as unknown as { __stats: { fps: number } }).__stats.fps);
    console.log(`[${vp.name}] fps=${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(0);
  });
}
