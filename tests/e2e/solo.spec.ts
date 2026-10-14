import { test, expect, type Page } from '@playwright/test';

// M2~M3: 메뉴 흐름 → 1인 모드 → 봇 자동 플레이로 랠리 루프 검증 → 마우스 제스처 → 일시정지 → 결과
type Win = {
  __game: () => {
    session: { hits: number; combo: number; perfects: number; misses: number; bestThisRun: number };
    world: { ball: { pos: { x: number; y: number; z: number } } | null; rally: { phase: string } };
    playerPos: { x: number; z: number };
  } | null;
  __tuning: { debug: { autoplay: boolean; autoplayErrorMs: number } };
  __stats: { fps: number };
};

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/shots/m3_${name}.png` });

async function session(page: Page) {
  return page.evaluate(() => (window as unknown as Win).__game()!.session);
}

test('menu → solo → autoplay rally → pause → results', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);
  await shot(page, '01_title');
  await page.getByText('시작하기').click();
  await shot(page, '02_main');
  await page.getByText('1인 모드').click();
  await shot(page, '03_difficulty');
  await page.getByRole('button', { name: /^쉬움/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, '04_tutorial');

  // 봇으로 랠리가 계속 이어지는지
  await page.evaluate(() => ((window as unknown as Win).__tuning.debug.autoplay = true));
  let captured = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const s = await session(page);
    if (!captured && s.hits >= 3) {
      await shot(page, '05_rally');
      captured = true;
    }
  }
  const s1 = await session(page);
  console.log('[easy autoplay 10s]', JSON.stringify(s1));
  expect(s1.hits).toBeGreaterThanOrEqual(6);
  expect(s1.combo).toBeGreaterThanOrEqual(4);
  expect(s1.perfects / s1.hits).toBeGreaterThan(0.8);

  // 일부러 늦게 치면 PERFECT가 안 나와야 함
  await page.evaluate(() => ((window as unknown as Win).__tuning.debug.autoplayErrorMs = 100));
  const before = await session(page);
  await page.waitForTimeout(5000);
  const after = await session(page);
  console.log('[late +100ms]', JSON.stringify(after));
  expect(after.hits).toBeGreaterThan(before.hits);
  expect(after.perfects).toBe(before.perfects);

  // 봇을 끄면 결국 놓쳐서 콤보 리셋
  await page.evaluate(() => {
    const t = (window as unknown as Win).__tuning;
    t.debug.autoplay = false;
    t.debug.autoplayErrorMs = 0;
  });
  await page.waitForTimeout(5000);
  await shot(page, '06_miss');
  const missed = await session(page);
  expect(missed.misses).toBeGreaterThan(s1.misses);

  // 우클릭/좌클릭이 스윙을 일으키는지 (헛스윙/타격 팝업)
  await page.mouse.move(800, 400);
  await page.mouse.click(800, 400, { button: 'right' });
  await expect(page.locator('.popup').first()).toBeVisible({ timeout: 1000 });
  await page.waitForTimeout(600);
  await page.mouse.click(800, 400, { button: 'left' });
  await expect(page.locator('.popup').first()).toBeVisible({ timeout: 1000 });

  // 수동 이동 + 달리기 자세 (봇 꺼진 상태)
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(260);
  await shot(page, '11_run_side');
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(260);
  await shot(page, '12_run_forward');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(300);
  await shot(page, '13_run_back');
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(600);
  await shot(page, '14_ready');

  const fps = await page.evaluate(() => (window as unknown as Win).__stats.fps);
  console.log(`[fps] ${fps.toFixed(1)}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await shot(page, '07_pause');
  await page.getByText('그만하기').click();
  await page.waitForTimeout(300);
  await shot(page, '08_results');
  await expect(page.getByText('총 타구')).toBeVisible();
});

test('hard: autoplay keeps a rally on the small court', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('./');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const w = window as unknown as Win & { __startSolo: (d: string) => void };
    w.__tuning.debug.autoplay = true;
    w.__startSolo('hard');
  });
  // 타격 직후 프레임 (스윙 트레일·섬광·팝업 확인)
  const h0 = (await session(page)).hits;
  for (let i = 0; i < 200; i++) {
    if ((await session(page)).hits > h0) break;
    await page.waitForTimeout(15);
  }
  await page.waitForTimeout(60);
  await shot(page, '10_swing');
  await page.waitForTimeout(6000);
  await shot(page, '09_hard');
  const s = await session(page);
  console.log('[hard autoplay 8s]', JSON.stringify(s));
  expect(s.hits).toBeGreaterThanOrEqual(4);
  expect(s.misses).toBe(0);
});
