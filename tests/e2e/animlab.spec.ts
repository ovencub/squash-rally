import { test } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

// 애니메이션 확인: 시나리오(달리다 급정지, 옆 스텝, 서서/뛰면서 스윙 …)를 고정 간격으로 돌려 프레임 시트로 저장 → test-results/anim
type L = { renderSheet: (n: string, v: string, every?: number) => string; names: () => string[] };
test('animation sheets', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?animlab');
  await page.waitForFunction(() => !!(window as unknown as { __animlab?: L }).__animlab);
  const out = process.env.ANIM_OUT ?? 'test-results/anim';
  mkdirSync(out, { recursive: true });
  const only = process.env.ANIM_ONLY?.split(',');
  const views = (process.env.ANIM_VIEWS ?? 'side,diag').split(',');
  const names = await page.evaluate(() => (window as unknown as { __animlab: L }).__animlab.names());
  for (const n of names) {
    if (only && !only.includes(n)) continue;
    for (const v of views) {
      const every = Number(process.env.ANIM_EVERY ?? 4);
      const url = await page.evaluate(([a, b, e]) => (window as unknown as { __animlab: L }).__animlab.renderSheet(a as string, b as string, e as number), [n, v, every] as const);
      writeFileSync(`${out}/${n}_${v}.png`, Buffer.from(url.split(',')[1], 'base64'));
    }
  }
});
