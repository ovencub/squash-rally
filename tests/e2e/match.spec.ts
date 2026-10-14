import { test, expect, type Page } from '@playwright/test';

// M4: AI 대전 — 봇(사람 자리) vs AI로 서브·랠리·득점·게임 진행 확인
type G = {
  match: { points: { A: number; B: number }; games: { A: number; B: number }; history: unknown[]; winner: string | null } | null;
  matchPhase: string;
  matchStats: { hits: number; perfects: number; longestRally: number };
  world: { rally: { lastHitter: string | null } };
};
type W = {
  __game: () => G | null;
  __startMatch: (d: string) => void;
  __tuning: { debug: { autoplay: boolean; timeScale: number } };
};

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/shots/m4_${name}.png` });
const state = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as W).__game()!;
    return { m: g.match!, phase: g.matchPhase, stats: g.matchStats };
  });

test('AI match flow (bot vs AI)', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('./');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__startMatch('normal');
    document.querySelector('.tutorial')?.remove();
  });
  await page.waitForTimeout(600);
  await shot(page, '01_serve_wait');
  expect((await state(page)).phase).toBe('serveWait');

  // 사람 서브는 클릭
  await page.mouse.click(800, 450, { button: 'right' });
  await page.waitForTimeout(700);
  await shot(page, '02_after_serve');
  expect((await state(page)).phase).toBe('rally');

  // 봇으로 진행, 3배속
  await page.evaluate(() => {
    const t = (window as unknown as W).__tuning;
    t.debug.autoplay = true;
    t.debug.timeScale = 3;
  });
  let pointShot = false;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(300);
    const s = await state(page);
    if (!pointShot && s.phase === 'pointEnd') {
      await shot(page, '03_point');
      pointShot = true;
    }
    if (s.m.points.A + s.m.points.B >= 2) break;
  }
  const natural = await state(page);
  console.log('[natural points]', JSON.stringify(natural));
  expect(natural.m.points.A + natural.m.points.B).toBeGreaterThanOrEqual(2);
  expect(natural.stats.longestRally).toBeGreaterThanOrEqual(3);

  // 듀스 표시 확인: 10:10으로 설정
  await page.evaluate(() => {
    const g = (window as unknown as W).__game()!;
    g.match!.points = { A: 10, B: 10 };
  });
  await page.waitForTimeout(200);
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(300);
    if ((await state(page)).phase === 'serveWait') break;
  }
  await shot(page, '04_deuce');

  // 매치 종료 확인: 게임 1:0, 10:0에서 한 점 더
  await page.evaluate(() => {
    const g = (window as unknown as W).__game()!;
    g.match!.games = { A: 1, B: 0 };
    g.match!.history = [{ A: 11, B: 7 }];
    g.match!.points = { A: 10, B: 0 };
  });
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(300);
    if ((await state(page)).m.winner) break;
  }
  const s = await state(page);
  console.log('[match]', JSON.stringify(s));
  expect(s.m.winner).not.toBeNull();
  expect(s.m.history.length).toBe(2);
  await page.waitForTimeout(3500);
  await shot(page, '05_match_result');
  await expect(page.getByText('재대결')).toBeVisible();
});
