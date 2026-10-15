import { test, expect, devices } from '@playwright/test';

// 모바일 터치 조작: 가로 휴대폰 화면 + 터치 에뮬레이션
type W = {
  __game: () => { playerPos: { x: number; z: number }; session: { hits: number }; paused: boolean } | null;
  __tuning: { debug: { autoplay: boolean } };
  __stats: { fps: number };
};

test.use({ ...devices['Pixel 7 landscape'] });

/** 터치 포인터 이벤트 보내기 (조이스틱 드래그용) */
async function touchPointer(page: import('@playwright/test').Page, type: string, x: number, y: number, id = 11) {
  await page.evaluate(
    ([t, px, py, pid]) => {
      const el = document.elementFromPoint(px as number, py as number) ?? document.body;
      const target = t === 'pointerdown' ? el : window;
      target.dispatchEvent(
        new PointerEvent(t as string, { pointerId: pid as number, pointerType: 'touch', clientX: px as number, clientY: py as number, bubbles: true, isPrimary: true }),
      );
    },
    [type, x, y, id],
  );
}

test('mobile touch controls', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/mobile/01_title.png' });
  await page.getByText('시작하기').tap();
  await page.getByText('1인 모드').tap();
  await page.getByRole('button', { name: /^쉬움/ }).tap();
  await page.waitForTimeout(600);
  await expect(page.locator('.touch')).toBeVisible();
  await expect(page.locator('#ctlKeys')).toBeHidden(); // PC용 시각화는 숨김
  await page.evaluate(() => document.querySelector('.tutorial')?.remove());

  // 조이스틱: 왼쪽 아래를 누르고 오른쪽으로 끌면 캐릭터가 오른쪽으로
  const vp = page.viewportSize()!;
  const x0 = vp.width * 0.18;
  const y0 = vp.height * 0.72;
  const before = await page.evaluate(() => (window as unknown as W).__game()!.playerPos);
  await touchPointer(page, 'pointerdown', x0, y0);
  await touchPointer(page, 'pointermove', x0 + 60, y0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/mobile/02_joystick.png' });
  await touchPointer(page, 'pointerup', x0 + 60, y0);
  const after = await page.evaluate(() => (window as unknown as W).__game()!.playerPos);
  console.log('[move]', JSON.stringify(before), '→', JSON.stringify(after));
  expect(after.x).toBeGreaterThan(before.x + 0.5);

  // 더블탭 확대 방지: 화면 어디든 두 번 빠르게 탭해도 확대 배율 1 유지
  for (const [x, y] of [[vp.width * 0.5, vp.height * 0.4], [vp.width * 0.5, vp.height * 0.05], [x0, y0]]) {
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(400);
  }
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).toBe('manipulation');

  // 버튼: 포핸드/백핸드 탭 → 스윙(헛스윙 팝업이라도 떠야 함)
  await page.locator('.t-btn.fore').tap();
  await expect(page.locator('.popup').first()).toBeVisible({ timeout: 1000 });

  // 봇 이동 + 버튼 대신 자동 스윙으로 랠리가 도는지 (모바일 성능 확인)
  await page.evaluate(() => ((window as unknown as W).__tuning.debug.autoplay = true));
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__game()!.session.hits), { timeout: 20000 }).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: 'test-results/mobile/03_rally.png' });
  console.log('[mobile fps]', await page.evaluate(() => (window as unknown as W).__stats.fps.toFixed(0)));

  // 세로로 돌리면 안내
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(300);
  await expect(page.locator('.rotate-note')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile/04_portrait.png' });
});
