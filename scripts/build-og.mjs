// 공유 썸네일: GPT 이미지(자리표시 문구 "TAGLINE HERE")에 실제 문구를 웹폰트로 덮어 public/og.jpg 생성 (용량 때문에 JPEG)
//   node scripts/build-og.mjs   (먼저 python scripts/build_design.py)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const base = readFileSync('public/img/og-base.jpg').toString('base64');
const TAGLINE = '브라우저에서 바로 플레이!';
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  .bg{position:absolute;inset:0;background:url(data:image/jpeg;base64,${base}) 0 0/1200px 630px}
  .tag{position:absolute;left:158px;top:408px;width:372px;height:44px;border-radius:22px;transform:rotate(-5.4deg);
    background:linear-gradient(#ffdc4a,#f9c62a);display:flex;align-items:center;justify-content:center;
    font:28px 'Black Han Sans',sans-serif;color:#2a1f52;letter-spacing:.01em}
</style></head><body><div class="bg"></div><div class="tag">${TAGLINE}</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 88 });
await browser.close();
console.log('public/og.jpg');
