import { test } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
type L = { ids: () => string[]; render: (id: string, s: string, lv: number) => Promise<Float32Array> };
function wav(samples: number[], sr = 44100): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return b;
}
// 사운드 비교 페이지(?sfxlab)의 모든 버전·면·세기를 게임과 같은 체인으로 렌더 → test-results/lab (실제 경기 분석과 비교용)
test('render lab variants', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?sfxlab');
  await page.waitForTimeout(1500);
  await page.getByText('소리 켜기').click();
  await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent?.includes('준비'), null, { timeout: 15000 });
  const out = process.env.LAB_OUT ?? 'test-results/lab';
  mkdirSync(out, { recursive: true });
  const ids = await page.evaluate(() => (window as unknown as { __sfxlab: L }).__sfxlab.ids());
  for (const id of ids)
    for (const s of ['racket', 'wall', 'floor'])
      for (const lv of [0, 1, 2]) {
        const d = await page.evaluate(async ([a, b, c]) => Array.from(await (window as unknown as { __sfxlab: L }).__sfxlab.render(a as string, b as string, c as number)), [id, s, lv] as const);
        writeFileSync(`${out}/v${id}_${s}_${lv}.wav`, wav(d));
      }
});
