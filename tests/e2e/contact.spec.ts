import { test } from '@playwright/test';

// 임팩트 순간 스윙이 공 위치와 맞는지 확인: 히트스톱을 길게 늘려 멈춘 장면을 여러 각도로 찍는다
type W = {
  __startSolo: (d: string) => void;
  __game: () => { session: { hits: number } } | null;
  __tuning: {
    debug: { autoplay: boolean; closeup: string; autoplayErrorMs: number };
    fx: { hitstopMs: { perfect: number; good: number; off: number } };
  };
};

test('swing meets the ball at impact', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__tuning.fx.hitstopMs = { perfect: 2500, good: 2500, off: 2500 };
    w.__tuning.debug.autoplay = true;
    w.__startSolo('easy');
    document.querySelector('.tutorial')?.remove();
  });
  const views = ['off', 'back', 'side', 'front', 'back', 'side'];
  for (let i = 0; i < views.length; i++) {
    await page.evaluate((v) => ((window as unknown as W).__tuning.debug.closeup = v), views[i]);
    const h0 = await page.evaluate(() => (window as unknown as W).__game()!.session.hits);
    for (let k = 0; k < 400; k++) {
      if ((await page.evaluate(() => (window as unknown as W).__game()!.session.hits)) > h0) break;
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/contact/${i}_${views[i]}.png` });
    await page.waitForTimeout(2600);
  }
});
