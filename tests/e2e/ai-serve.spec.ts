import { test, expect } from '@playwright/test';

// 회귀 테스트: 예전에는 고정 시드 때문에 플레이어의 첫 서브를 AI가 항상 놓쳤다.
// 경기를 여러 번 새로 시작해 첫 서브를 넣고, AI가 대부분 받아 치는지 확인.
type G = {
  matchPhase: string;
  world: { rally: { lastHitter: string } };
  swing: (i: { hand: string; aim: null }) => void;
  ai: { lastDecision: { pressure: number; speedK: number; missProb: number; willMiss: boolean } | null };
};
type W = { __game: () => G; __startMatch: (d: string) => void };

test('AI returns the first serve', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('./');
  await page.waitForTimeout(300);
  for (const d of ['easy', 'normal', 'hard']) {
    let returned = 0;
    const trials = 6;
    for (let t = 0; t < trials; t++) {
      await page.evaluate((dd) => (window as unknown as W).__startMatch(dd), d);
      await page.waitForTimeout(400);
      await page.evaluate(() => (window as unknown as W).__game().swing({ hand: 'fore', aim: null }));
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(100);
        const s = await page.evaluate(() => {
          const g = (window as unknown as W).__game();
          return { lh: g.world.rally.lastHitter, ph: g.matchPhase };
        });
        if (s.lh === 'B') {
          returned++;
          break;
        }
        if (s.ph === 'pointEnd') break;
      }
      if (t === 0) console.log(`[${d}] decision`, JSON.stringify(await page.evaluate(() => (window as unknown as W).__game().ai.lastDecision)));
    }
    console.log(`[${d}] AI returned first serve ${returned}/${trials}`);
    expect(returned).toBeGreaterThanOrEqual(4);
  }
});
