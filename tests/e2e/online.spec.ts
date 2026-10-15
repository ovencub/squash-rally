import { test, expect, type Page } from '@playwright/test';

// 친구와 대전(온라인): 브라우저 두 개(호스트/참가자)가 실제로 PeerJS로 연결되어 대전하는지.
// 양쪽 모두 봇으로 치다가 번갈아 한쪽 봇을 꺼서 놓치게 만들고, 두 화면의 점수(PAR)가 항상 같은지 확인한다.
type G = {
  me: string;
  match: { points: { A: number; B: number }; games: { A: number; B: number }; history: unknown[] } | null;
  matchPhase: string;
  matchStats: { hits: number; longestRally: number };
};
type W = { __game: () => G | null; __tuning: { debug: { autoplay: boolean } } };

const state = (p: Page) =>
  p.evaluate(() => {
    const g = (window as unknown as W).__game();
    return g ? { me: g.me, m: g.match, phase: g.matchPhase, stats: g.matchStats } : null;
  });
const pts = (s: Awaited<ReturnType<typeof state>>) => (s?.m?.points.A ?? 0) + (s?.m?.points.B ?? 0);
const setBot = (p: Page, on: boolean) => p.evaluate((v) => ((window as unknown as W).__tuning.debug.autoplay = v), on);

test('online 1v1 via invite link', async ({ browser }) => {
  test.setTimeout(180_000);
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  // 호스트: 방 만들기
  await host.goto('./');
  await host.getByText('시작하기').click();
  await host.getByText('친구와 대전').click();
  await host.screenshot({ path: 'test-results/online/01_menu.png' });
  await host.getByRole('button', { name: /^방 만들기/ }).click();
  const codeEl = host.locator('.room-code');
  await expect(codeEl).toBeVisible({ timeout: 20000 });
  const code = (await codeEl.textContent())!.trim();
  console.log('[room]', code, (await host.locator('.link-text').textContent())!.trim());
  await host.screenshot({ path: 'test-results/online/02_waiting.png' });

  // 참가자: 초대 링크로 접속
  await guest.goto(`./?room=${code}`);
  await guest.getByText('시작하기').click();
  await expect.poll(async () => (await state(guest))?.me, { timeout: 30000 }).toBe('B');
  await expect.poll(async () => (await state(host))?.me, { timeout: 10000 }).toBe('A');
  for (const p of [host, guest]) await p.evaluate(() => document.querySelector('.tutorial')?.remove());
  await host.screenshot({ path: 'test-results/online/03_host_start.png' });
  await guest.screenshot({ path: 'test-results/online/04_guest_start.png' });

  // 양쪽 봇으로 랠리
  await setBot(host, true);
  await setBot(guest, true);
  for (let i = 0; i < 150; i++) {
    const hs = await state(host);
    const gs = await state(guest);
    if ((hs?.stats.hits ?? 0) + (gs?.stats.hits ?? 0) >= 4) break;
    await host.waitForTimeout(200);
  }
  await host.screenshot({ path: 'test-results/online/05_host_rally.png' });
  await guest.screenshot({ path: 'test-results/online/06_guest_rally.png' });

  // 번갈아 한쪽 봇을 꺼서 실점 → 양쪽 점수가 같아야 함
  let want = 0;
  for (const loser of [guest, host, guest]) {
    // 서브가 들어가 랠리 중일 때 끈다 (서브 대기 중에 끄면 서브를 못 해서 멈춤)
    for (let i = 0; i < 100; i++) {
      if ((await state(host))?.phase === 'rally' && (await state(guest))?.phase === 'rally') break;
      await host.waitForTimeout(150);
    }
    await host.waitForTimeout(1200);
    await setBot(loser, false);
    want++;
    for (let i = 0; i < 150; i++) {
      if (pts(await state(host)) >= want && pts(await state(guest)) >= want) break;
      await host.waitForTimeout(200);
    }
    await setBot(loser, true);
    await host.waitForTimeout(400);
    const hs = await state(host);
    const gs = await state(guest);
    console.log(`[point ${want}] host=${JSON.stringify(hs?.m?.points)} guest=${JSON.stringify(gs?.m?.points)}`);
    expect(hs?.m?.points).toEqual(gs?.m?.points);
  }
  await host.screenshot({ path: 'test-results/online/07_host_score.png' });
  await guest.screenshot({ path: 'test-results/online/08_guest_score.png' });

  const h = await state(host);
  const g = await state(guest);
  expect(h!.m).toEqual(g!.m);
  expect(pts(h)).toBe(3);
  expect(h!.m!.points.A).toBe(2); // 참가자가 2번, 호스트가 1번 놓침
  expect(h!.m!.points.B).toBe(1);

  // 호스트가 나가면 참가자에게 안내
  await host.keyboard.press('Escape');
  await host.getByText('대전 나가기').click();
  await expect(guest.getByText('대전 종료')).toBeVisible({ timeout: 10000 });
  await guest.screenshot({ path: 'test-results/online/09_guest_left.png' });
  await hostCtx.close();
  await guestCtx.close();
});
