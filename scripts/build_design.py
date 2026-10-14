# assets/design 의 GPT 이미지 → 게임용 리소스 (public/img, public/)
#   python scripts/build_design.py
import os
from PIL import Image, ImageDraw

SRC = 'assets/design'
OUT = 'public/img'
os.makedirs(OUT, exist_ok=True)

# 로고: 투명 배경 유지, 폭 960으로 축소
logo = Image.open(f'{SRC}/11_logo.png').convert('RGBA')
bbox = logo.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
logo = logo.crop(bbox)
logo.thumbnail((960, 960), Image.LANCZOS)
logo.save(f'{OUT}/logo.webp', quality=88, method=6)

# 파비콘: 모서리 흰 배경 → 둥근 사각형 알파 마스크
fav = Image.open(f'{SRC}/14_favicon.png').convert('RGBA')
s = min(fav.size)
fav = fav.crop((0, 0, s, s))
mask = Image.new('L', (s, s), 0)
ImageDraw.Draw(mask).rounded_rectangle((6, 6, s - 6, s - 6), radius=int(s * 0.2), fill=255)
fav.putalpha(mask)
for size, name in ((32, 'favicon-32.png'), (180, 'apple-touch-icon.png'), (512, 'icon-512.png')):
    fav.resize((size, size), Image.LANCZOS).save(f'public/{name}', optimize=True)

# 공유 썸네일 베이스: 1200x630 (가운데 기준 크롭). 자리표시 문구는 tests/e2e/og.spec.ts가 실제 문구로 덮어 public/og.png 생성
og = Image.open(f'{SRC}/14_og_thumbnail.png').convert('RGB')
w, h = og.size
tw = int(h * 1200 / 630)
if tw <= w:
    x0 = (w - tw) // 2
    og = og.crop((x0, 0, x0 + tw, h))
else:
    th = int(w * 630 / 1200)
    y0 = (h - th) // 2
    og = og.crop((0, y0, w, y0 + th))
og.resize((1200, 630), Image.LANCZOS).save(f'{OUT}/og-base.jpg', quality=90)
print('ok', logo.size)
