import { test } from '@playwright/test';

// 캐릭터 관절 동작 확인용 근접 스크린샷 (자세 튜닝 보조)
type W = {
  __startSolo: (d: string) => void;
  __tuning: { debug: { closeup: string } };
  __game: () => { debugPose: (h: string, t: number | null) => void; paused: boolean } | null;
};

test('character poses', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('./');
  await page.waitForTimeout(400);
  await page.evaluate(() => (window as unknown as W).__startSolo('easy'));
  await page.evaluate(() => document.querySelector('.tutorial')?.remove());
  for (const view of ['side', 'back', 'front']) {
    await page.evaluate((v) => ((window as unknown as W).__tuning.debug.closeup = v), view);
    for (const [hand, t] of [['fore', null], ['fore', 0], ['fore', 0.3], ['fore', 0.9], ['back', 0], ['back', 0.3], ['back', 0.9]] as const) {
      await page.evaluate(([h, tt]) => (window as unknown as W).__game()!.debugPose(h as string, tt as number | null), [hand, t]);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `test-results/pose/${view}_${hand}_${t ?? 'ready'}.png` });
    }
    await page.evaluate(() => (window as unknown as W).__game()!.debugPose('fore', null));
    for (const key of ['KeyA', 'KeyW', 'KeyS']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(230);
      await page.screenshot({ path: `test-results/pose/${view}_run_${key}.png` });
      await page.keyboard.up(key);
      await page.waitForTimeout(300);
    }
  }
});
