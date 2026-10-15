import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// 플레이 영상 촬영 (RECORD=1 일 때만): AI 대전(보통) — 사람 자리는 자동 플레이 봇.
// 화면은 Playwright 녹화, 소리는 게임 최종 출력을 페이지 안에서 따로 녹음 → recordings/ 에 저장 후 ffmpeg로 합침.
test('record AI match', async ({ browser }) => {
  test.skip(!process.env.RECORD, 'RECORD=1 일 때만');
  const seconds = Number(process.env.RECORD_SECONDS ?? 22);
  test.setTimeout((seconds + 40) * 1000);
  mkdirSync('recordings/raw', { recursive: true });
  const t0 = Date.now();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: 'recordings/raw', size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  await page.goto('./');
  await page.waitForTimeout(1500);
  await page.mouse.click(640, 360); // 오디오 잠금 해제
  await page.waitForTimeout(300);
  const marks = await page.evaluate(() => {
    type W = {
      __sfx: { unlock: () => void; captureStream: () => MediaStream | null };
      __startMatch: (d: string) => void;
      __tuning: { debug: { autoplay: boolean } };
      __rec: { chunks: Blob[]; rec: MediaRecorder };
    };
    const w = window as unknown as W;
    w.__sfx.unlock();
    const stream = w.__sfx.captureStream()!;
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start(250);
    const recStart = Date.now();
    w.__rec = { chunks, rec };
    return { recStart };
  });
  // 싱크 마커: 화면 전체 흰색 번쩍 + 같은 순간 징글 → 영상·소리에서 찾아 정확히 맞춤 (편집 때 잘라냄)
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const f = document.createElement('div');
    f.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999';
    document.body.appendChild(f);
    (window as unknown as { __sfx: { play: (n: string, v?: number) => void } }).__sfx.play('point_win', 1);
    setTimeout(() => f.remove(), 200);
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const w = window as unknown as { __startMatch: (d: string) => void; __tuning: { debug: { autoplay: boolean } } };
    w.__tuning.debug.autoplay = true;
    w.__startMatch('normal');
    document.querySelector('.tutorial')?.remove();
  });
  const matchStart = Date.now();
  // 내가 서브할 차례면 클릭으로 서브 (봇은 서브를 안 함)
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const serveMine = await page.evaluate(() => {
      const g = (window as unknown as { __game: () => { matchPhase: string; match: { server: string } | null } | null }).__game();
      return !!g && g.matchPhase === 'serveWait' && g.match?.server === 'A';
    });
    if (serveMine) {
      await page.waitForTimeout(700);
      await page.mouse.click(700, 360, { button: 'right' });
    }
    await page.waitForTimeout(300);
  }
  const fps = await page.evaluate(() => (window as unknown as { __stats: { fps: number } }).__stats.fps);
  const b64 = await page.evaluate(async () => {
    const r = (window as unknown as { __rec: { chunks: Blob[]; rec: MediaRecorder } }).__rec;
    await new Promise<void>((res) => {
      r.rec.onstop = () => res();
      r.rec.stop();
    });
    const buf = new Uint8Array(await new Blob(r.chunks, { type: 'audio/webm' }).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  writeFileSync('recordings/raw/audio.webm', Buffer.from(b64, 'base64'));
  const video = page.video()!;
  await ctx.close();
  const vpath = await video.path();
  writeFileSync(
    'recordings/raw/sync.json',
    JSON.stringify({ video: vpath, audioOffset: (marks.recStart - t0) / 1000, matchStart: (matchStart - t0) / 1000, seconds, fps }),
  );
  console.log('[record]', JSON.stringify({ vpath, audioOffset: (marks.recStart - t0) / 1000, fps }));
});
