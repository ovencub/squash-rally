import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

// M5: 음원 로딩 확인 + 타격/벽 소리를 오프라인 렌더링해 WAV로 저장 (분석 스크립트로 실제 경기음과 비교)
type S = { unlock: () => void; loaded: number; renderDry: (n: string, s?: number, parts?: string, k?: number) => Promise<Float32Array> };

function wav(samples: number[], sr = 44100): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return b;
}

test('sound bank loads and renders', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./');
  await page.mouse.click(10, 10); // 오디오 잠금 해제용 사용자 입력
  await page.evaluate(() => (window as unknown as { __sfx: S }).__sfx.unlock());
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sfx: S }).__sfx.loaded), { timeout: 10000 }).toBeGreaterThanOrEqual(14);
  mkdirSync('test-results/sound/parts', { recursive: true });
  mkdirSync('test-results/sound/k', { recursive: true });
  for (const n of ['hit_soft', 'hit_hard', 'hit_perfect', 'bounce_front', 'bounce_glass', 'bounce_floor', 'tin', 'squeak', 'step', 'plant']) {
    const data = await page.evaluate(async (name) => Array.from(await (window as unknown as { __sfx: S }).__sfx.renderDry(name)), n);
    writeFileSync(`test-results/sound/${n}.wav`, wav(data));
    // 세기별 (약하게 / 세게)
    for (const k of [0.15, 1]) {
      const dk = await page.evaluate(async ([name, kk]) => Array.from(await (window as unknown as { __sfx: S }).__sfx.renderDry(name as string, 0.5, 'both', kk as number)), [n, k] as const);
      writeFileSync(`test-results/sound/k/${n}_k${k}.wav`, wav(dk));
    }
    for (const part of ['file', 'layer']) {
      const d2 = await page.evaluate(async ([name, pt]) => Array.from(await (window as unknown as { __sfx: S }).__sfx.renderDry(name, 0.5, pt)), [n, part]);
      writeFileSync(`test-results/sound/parts/${n}_${part}.wav`, wav(d2));
    }
  }
  expect(errors).toEqual([]);
});
