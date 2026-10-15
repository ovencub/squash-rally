import { test, expect, devices } from '@playwright/test';

// iOS 오디오 경로 점검: 아이폰 UA/터치 환경을 흉내 내고(엔진은 크롬), 탭 이후 오디오가 실제로 켜지는지
// (무음 스위치 우회용 무음 <audio>, 무음 버퍼 잠금 해제, 음원 로딩) 에러 없이 동작하는지 확인
const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13 landscape'];
void _ignored;
test.use({ ...iphone, browserName: 'chromium' });

type W = { __sfx: { loaded: number } };

test('iOS audio unlock path', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  await page.getByText('시작하기').tap(); // touchend → 오디오 깨움
  const st = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const audio = document.querySelector('audio');
    return {
      ios: /iPhone/.test(navigator.userAgent),
      silentAudio: !!audio && !audio.paused,
      loaded: (window as unknown as W).__sfx.loaded,
    };
  });
  console.log('[ios]', JSON.stringify(st));
  expect(st.ios).toBe(true);
  expect(st.silentAudio).toBe(true); // 무음 스위치 우회용 무음 오디오 재생 중
  expect(st.loaded).toBeGreaterThanOrEqual(14);
  expect(errors).toEqual([]);
});
