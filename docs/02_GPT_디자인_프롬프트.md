# GPT 이미지 생성 프롬프트 — 스쿼시 게임 디자인 리소스

ChatGPT(이미지 생성)에 아래 프롬프트를 **순서대로** 넣으세요.
생성한 이미지는 지정한 파일명으로 `assets/design/` 폴더에 저장하면 Claude Code가 디자인 기준으로 사용합니다.

## 사용 요령

1. **①번 키 이미지를 가장 먼저** 만들고, 마음에 들 때까지 다시 뽑으세요. 이게 모든 리소스의 "기준"입니다.
2. ②번부터는 **①에서 확정한 이미지를 함께 첨부**하고 프롬프트를 넣으세요. (첫 줄의 `Match the attached key image` 문장이 그 역할)
3. 레퍼런스 영상 캡처(`references/keyframes/ref_08_t22.0s.png` 등)를 ①번에 같이 첨부하면 톤 맞추기가 쉬워집니다. 단, "똑같이 그려달라"가 아니라 "이런 분위기"로만 쓰세요.
4. 투명 배경이 필요한 리소스(UI, 이펙트, 로고)는 결과가 체크무늬 배경으로 나오면 "make the background truly transparent PNG"라고 한 번 더 요청하세요.
5. 텍스트는 이미지 생성에서 잘 깨지니, 화면 목업 속 글자는 **분위기 참고용**입니다. 실제 글자는 Claude Code가 폰트로 넣습니다.

### 공통 스타일 문장 (모든 프롬프트에 포함되어 있음)

```
STYLE: clean flat-shaded 3D cartoon, low-poly with smooth simple shapes, cel shading with crisp thin black outlines, minimal texture noise, bold readable silhouettes, soft even arena lighting, saturated but limited palette (deep violet, lavender, off-white, coral red, teal, warm yellow accents), casual mobile sports game aesthetic, simple and tidy
```

---

## ① 키 이미지 — 인게임 화면 (가로 16:9) ★가장 먼저

저장: `assets/design/01_key_gameplay_16x9.png`

```
A gameplay screenshot of a casual 3D squash video game, 16:9 landscape.

CAMERA: third-person view from behind and slightly above the player character, positioned just outside a transparent glass back wall, looking straight at the front wall. The entire court is visible: front wall, both side walls, the whole floor.

COURT: a regulation-proportioned squash court. Off-white walls with a faint lavender tint, coral-red court lines (front wall out line, service line, side wall diagonal out lines, short line, half-court line, two square service boxes). A dark navy metal "tin" strip along the bottom of the front wall. Floor in deep violet with a subtle fine diagonal stripe pattern. The arena outside the court is dark purple with soft simple crowd silhouettes and a row of plain sponsor boards with fictional abstract logos.

CHARACTERS: two simple cartoon athletes with slender white limbs, black outlines, slightly large heads, headbands. The player (seen from the back, bottom-center of the frame) wears a teal jersey and black shorts, mid-swing with a squash racket. The opponent stands farther forward on the right in a coral-red jersey.

ACTION & FX: a small dark squash ball just leaving the player's racket with a short white motion trail; a white curved swing-trail arc following the racket; a small bright impact flash with tiny radial sparks at the contact point; a small "PERFECT" text pop-up near the contact point in bold yellow with a dark outline; a red dashed shrinking timing ring on the floor where the ball is expected.

HUD: top-center minimal scoreboard bar (two player names, game score, current points, small serve indicator triangle), small pause icon top-right, one thin line of control hints at the bottom center. Flat, rounded, high-contrast UI.

STYLE: clean flat-shaded 3D cartoon, low-poly with smooth simple shapes, cel shading with crisp thin black outlines, minimal texture noise, bold readable silhouettes, soft even arena lighting, saturated but limited palette (deep violet, lavender, off-white, coral red, teal, warm yellow accents), casual mobile sports game aesthetic, simple and tidy.

No real brand names, no real logos, no watermark.
```

## ② 키 이미지 — 세로 화면 (9:16, 모바일 대비)

저장: `assets/design/02_key_gameplay_9x16.png`

```
Match the attached key image exactly in art style, palette, characters and UI style.
Recompose the same squash gameplay scene as a 9:16 portrait mobile screenshot. Camera behind and above the player outside the glass back wall, the whole court visible, front wall in the upper half. Big current score painted softly on the front wall in white bold numbers (e.g. "5 - 7"). Pause and menu icons at the top corners. Same flat cel-shaded 3D cartoon style with thin black outlines. No real brands, no watermark.
```

## ③ 캐릭터 시트 — 플레이어

저장: `assets/design/03_char_player_sheet.png`

```
Match the attached key image's art style.
Character turnaround sheet of the player athlete for a 3D squash game: front view, side view, back view, and a 3/4 view, all in a neutral A-pose, full body, evenly spaced on a plain light grey background. Plus two small action poses below: forehand drive follow-through and a low lunge for a drop shot.
Design: simple cartoon athlete, slender white limbs, slightly large round head, short black hair, white headband, teal sports jersey with a small number, black shorts, white-and-teal sneakers, holding a squash racket (teal frame, white strings). Crisp thin black outlines, flat cel shading, very few details, readable silhouette from behind (the back view matters most because the camera is behind the player).
Clean model-sheet layout, no text except small view labels.
```

## ④ 캐릭터 시트 — AI 상대

저장: `assets/design/04_char_ai_sheet.png`

```
Match the attached key image's art style and the attached player sheet's proportions.
Character turnaround sheet of the AI opponent athlete: front, side, back and 3/4 views in a neutral A-pose, full body, plain light grey background, plus two small action poses (backhand drive, ready stance).
Design: same body proportions as the player but clearly different: coral-red jersey, dark navy shorts, red wristbands, short spiky dark hair, coral-and-white sneakers, racket with coral frame. Crisp thin black outlines, flat cel shading, very few details.
Clean model-sheet layout, no text except small view labels.
```

## ⑤ 소품 — 라켓 · 공

저장: `assets/design/05_props_racket_ball.png`

```
Match the attached key image's art style.
Prop sheet on plain light grey background: two squash rackets (teal version and coral version) shown front and side, a squash ball (small dark rubber ball with two tiny yellow dots) shown large and small, and a stylized ball motion-trail shape. Flat cel shading, crisp thin black outlines, simple low-poly shapes. No text.
```

## ⑥ 코트 디자인 레이아웃

저장: `assets/design/06_court_layout.png`

```
Match the attached key image's palette and style.
A clean isometric cutaway illustration of the squash court used in the game, showing all four walls (front, two sides, glass back wall), the floor and every line clearly: front wall out line, service line, tin strip at the bottom of the front wall, diagonal side wall out lines, back wall out line, short line, half-court line and the two square service boxes. Off-white walls with faint lavender tint, coral-red lines, navy tin, deep violet floor with fine diagonal stripe pattern, slightly bluish transparent glass back wall. Minimal, flat cel-shaded, thin black outlines. No text.
```

## ⑦ 바닥 · 벽 텍스처 (반복 타일)

저장: `assets/design/07_tex_floor.png`, `assets/design/07_tex_wall.png`

```
Seamless tileable square texture, top-down flat view, for a stylized 3D game floor: deep violet base with a subtle fine diagonal stripe / micro check pattern in slightly lighter violet and faint magenta, very low contrast, no lighting, no shadows, no perspective, no objects. 1024x1024, must tile perfectly on all edges.
```

```
Seamless tileable square texture, flat front view, for a stylized 3D squash court wall: off-white with a very faint lavender tint and an extremely subtle plaster grain, almost flat, no lighting, no shadows, no lines, no objects. 1024x1024, must tile perfectly on all edges.
```

## ⑧ UI 킷 (투명 배경)

저장: `assets/design/08_ui_kit.png`

```
Match the attached key image's UI style.
A game UI kit sheet on a transparent background: primary button (warm yellow), secondary button (lavender), disabled button, each in normal and pressed state; rounded panel/card in deep violet with a thin light border; small modal window; toggle switch on/off; slider; round icon buttons (pause, resume, restart, home, settings, sound on, sound off, back arrow, close); difficulty badges for EASY / NORMAL / HARD (green-ish teal, yellow, coral); a small serve-indicator triangle; star and trophy icons.
Flat design, rounded corners, bold dark outlines, slight drop shadow, high contrast, clean and simple, consistent with a casual sports game. Text labels are placeholders.
```

## ⑨ 스코어보드 HUD (투명 배경)

저장: `assets/design/09_hud_scoreboard.png`

```
Match the attached key image's UI style.
A top-center scoreboard HUD bar for a squash game on a transparent background, shown in three states stacked vertically: (1) normal match state with two player names (YOU / CPU), small color chips (teal and coral), game score boxes, big current point numbers, and a small yellow serve-indicator triangle; (2) "GAME POINT" highlight state; (3) "MATCH POINT" highlight state.
Broadcast sports-graphic style but simple: dark violet bars, warm yellow score boxes, white bold numbers, thin outlines. Also include a separate small combo counter widget for solo mode ("COMBO 23", "BEST 41").
```

## ⑩ 메뉴 화면 목업

저장: `assets/design/10_screen_title.png`, `10_screen_mode.png`, `10_screen_difficulty.png`, `10_screen_result.png`

```
Match the attached key image and UI kit style.
Title screen for a casual 3D squash web game, 16:9. The game logo "SQUASH RALLY" large in the upper middle, behind it a stylized view of the court with the two cartoon athletes (teal player and coral opponent) in dynamic poses mid-rally, ball with motion trail. Big yellow "PLAY" button below the logo, small settings and sound icons in the corner. Deep violet arena background, clean and uncluttered.
```

```
Match the attached key image and UI kit style.
Mode select screen, 16:9: two large cards side by side — "SOLO" (single athlete hitting against the front wall, combo icon) and "VS CPU" (two athletes facing the front wall, trophy icon). Each card has a short one-line description placeholder. Back button top-left. Deep violet background, clean flat UI.
```

```
Match the attached key image and UI kit style.
Difficulty select screen, 16:9: three cards EASY / NORMAL / HARD. Each card shows a small top-down court diagram that gets visibly smaller from EASY to HARD (the court shrinks as difficulty rises), with teal / yellow / coral color coding. Back button top-left. Clean flat UI.
```

```
Match the attached key image and UI kit style.
Match result screen, 16:9: big "VICTORY" banner (alternate version "DEFEAT" in muted colors), final game score "2 - 1" with per-game scores below (11-8, 9-11, 12-10), small stats row (rallies, perfect hits, longest rally), two buttons "REMATCH" and "MENU". The winning cartoon athlete in a celebrating pose on the side.
```

## ⑪ 게임 로고 (투명 배경)

저장: `assets/design/11_logo.png`

```
Game logo "SQUASH RALLY" on a transparent background. Chunky bold rounded sans-serif lettering in off-white with a thick deep-violet outline and a subtle warm-yellow drop shadow, slightly tilted for energy. A small squash ball with a speed trail swooshing through the letters and a tiny racket accent. Flat, clean, readable at small sizes. No other text.
```

## ⑫ 타격 이펙트 스프라이트 시트 (투명 배경)

저장: `assets/design/12_fx_sheet.png`

```
Match the attached key image's FX style.
A 2D game effects sprite sheet on a transparent background, arranged in a clean grid, each row an animation sequence of 6 frames: (1) impact flash burst, white core with warm yellow edge and short radial sparks; (2) expanding impact ring shockwave; (3) wall hit dust puff, small and soft lavender-white; (4) white curved swing-trail arc, tapering; (5) "PERFECT" text pop-up in bold yellow with dark outline, scaling up then fading; (6) "GOOD" text pop-up in white. Flat cel-shaded, crisp edges, no background, no glow haze.
```

## ⑬ 스폰서 보드 (가상 브랜드)

저장: `assets/design/13_sponsor_boards.png`

```
Match the attached key image's palette.
A sheet of six wide horizontal arena sponsor boards for a fictional squash tournament, each with a different invented simple logo and name (e.g. "WALLOP", "BOUNCE LAB", "RALLY+", "TINLINE", "COURT 9", "SPINWAVE"). Dark violet and navy boards with white and yellow minimal logos, flat design, evenly spaced, no real brands.
```

## ⑭ 링크 공유 썸네일 · 파비콘

저장: `assets/design/14_og_thumbnail.png` (1200×630), `assets/design/14_favicon.png`

```
Match the attached key image and logo style.
Social share thumbnail, 1200x630: the "SQUASH RALLY" logo on the left, on the right the teal cartoon athlete swinging hard with a big impact flash and the ball flying toward a squash front wall, deep violet background, short tagline placeholder "Play in your browser". Bold, readable at small size.
```

```
Simple app icon / favicon, square, transparent rounded-square background in deep violet: a white squash ball with a short yellow speed trail and a small teal racket head behind it. Flat, thick outlines, readable at 32x32.
```

---

## 생성 후 체크

- [ ] ①의 색감·캐릭터·UI가 마음에 드는지 (나머지가 다 이걸 따라감)
- [ ] 캐릭터 뒷모습(③④ back view)이 잘 나왔는지 — 게임 내내 보이는 건 등
- [ ] 텍스처(⑦)가 이어붙였을 때 이음새가 보이지 않는지
- [ ] 실존 브랜드/로고가 들어가지 않았는지
- [ ] 파일명대로 `assets/design/`에 저장했는지
