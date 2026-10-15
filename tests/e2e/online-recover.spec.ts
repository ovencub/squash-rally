import { test, expect, type Page } from '@playwright/test';

// 실제 실패 상황 재현: 방장이 휴대폰에서 링크를 보내려고 다른 앱으로 가면 연결 서버와 끊겨 방이 사라진다.
// → 같은 코드로 자동 재등록되어 친구가 들어올 수 있어야 한다. 잘못된 코드는 "방을 찾지 못했어요" 안내.
type W = { __game: () => { me: string } | null; __net: () => { peer: { disconnect: () => void; disconnected: boolean } } | null };

async function createRoom(host: Page): Promise<string> {
  await host.goto('./');
  await host.getByText('시작하기').click();
  await host.getByText('친구와 대전').click();
  await host.getByRole('button', { name: /^방 만들기/ }).click();
  await expect(host.locator('.room-code')).toBeVisible({ timeout: 20000 });
  return (await host.locator('.room-code').textContent())!.trim();
}

test('room survives host losing the signaling server', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  const code = await createRoom(host);

  // 방장 쪽 연결 서버 접속을 강제로 끊음 (앱 전환 상황)
  await host.evaluate(() => (window as unknown as W).__net()!.peer.disconnect());
  await expect(host.locator('.wait-status')).toContainText('다시 여는 중', { timeout: 3000 });
  await expect(host.locator('.wait-status')).toContainText('방 열림', { timeout: 15000 });

  // 친구가 코드로 참가 → 성공해야 함
  await guest.goto('./');
  await guest.getByText('시작하기').click();
  await guest.getByText('친구와 대전').click();
  await guest.locator('.code-input').fill(code.toLowerCase()); // 소문자로 입력해도 됨
  await guest.getByRole('button', { name: '참가' }).click();
  await expect.poll(async () => guest.evaluate(() => (window as unknown as W).__game()?.me), { timeout: 30000 }).toBe('B');
  await expect.poll(async () => host.evaluate(() => (window as unknown as W).__game()?.me), { timeout: 10000 }).toBe('A');
});

test('wrong code shows a clear message', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./?room=ZZZZZZ');
  await page.getByText('시작하기').click();
  await expect(page.locator('.join-status')).toContainText('번째 시도', { timeout: 15000 });
  await expect(page.getByText('방을 찾지 못했어요')).toBeVisible({ timeout: 40000 });
  await page.screenshot({ path: 'test-results/online/10_not_found.png' });
});
