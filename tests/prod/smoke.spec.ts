import { test, expect } from '@playwright/test';

// 실제 배포 빌드에서: 로딩 → 메뉴 → 1인 모드 플레이(봇) → AI 대전 진입, 콘솔 에러 없음, 로딩 시간·FPS 기록
type W = {
  __game: () => { session: { hits: number } } | null;
  __tuning: { debug: { autoplay: boolean } };
  __stats: { fps: number };
  __sfx: { unlock: () => void; loaded: number };
};

test('production smoke', async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewportSize({ width: 1440, height: 810 });

  const t0 = Date.now();
  await page.goto('./');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 15000 });
  const loadMs = Date.now() - t0;
  await expect(page.getByText('시작하기')).toBeVisible();
  await page.screenshot({ path: `test-results/prod/${browserName}_title.png` });

  await page.getByText('시작하기').click();
  await page.getByText('1인 모드').click();
  await page.getByRole('button', { name: /^쉬움/ }).click();
  await page.evaluate(() => ((window as unknown as W).__tuning.debug.autoplay = true));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__game()?.session.hits ?? 0), { timeout: 20000 })
    .toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(1500);
  const fps = await page.evaluate(() => (window as unknown as W).__stats.fps);
  const sounds = await page.evaluate(() => (window as unknown as W).__sfx.loaded);
  await page.screenshot({ path: `test-results/prod/${browserName}_solo.png` });

  await page.keyboard.press('Escape');
  await page.getByText('그만하기').click();
  await page.getByText('메인으로').click();
  await page.getByText('AI 대전').click();
  await page.getByRole('button', { name: /^보통/ }).click();
  await page.waitForTimeout(1000);
  await expect(page.locator('#scoreboard')).toBeVisible();
  await page.screenshot({ path: `test-results/prod/${browserName}_match.png` });

  console.log(`[${browserName}] load=${loadMs}ms fps=${fps.toFixed(0)} soundBanks=${sounds}`);
  expect(errors).toEqual([]);
});
