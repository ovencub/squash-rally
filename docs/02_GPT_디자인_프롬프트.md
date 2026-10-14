# GPT 이미지 생성 프롬프트 — SQUASH RALLY 디자인 리소스 (M6 2차용)

> 2026-10-15 개정: 현재 게임 상태(드라이브 전용·클릭 스윙, 관절 캐릭터, 관중석 아레나)에 맞춰 다시 정리했습니다.
> 생성한 이미지는 지정한 파일명으로 `assets/design/` 폴더에 저장하면 Claude Code가 그 톤에 맞춰 게임을 조정합니다.

## 사용 요령

1. **①번 키 이미지를 가장 먼저** 만들고, 마음에 들 때까지 다시 뽑으세요. 나머지는 전부 이걸 따라갑니다.
2. ①번을 만들 때 **현재 게임 스크린샷 `references/current_game/game_match_view.png`를 함께 첨부**하세요. 구도·카메라·코트 비율을 그대로 유지하면서 그림체만 끌어올리는 용도입니다.
3. ②번부터는 **①에서 확정한 이미지를 함께 첨부**하고 프롬프트를 넣으세요 (첫 줄 `Match the attached key image ...`).
4. 캐릭터 시트(③④)는 `references/current_game/character_front.png`, `character_back_swing.png`도 같이 첨부하면 비율이 게임과 맞습니다.
5. 투명 배경이 필요한 리소스(로고·UI·이펙트)가 체크무늬 배경으로 나오면 "make the background truly transparent PNG"라고 한 번 더 요청하세요.
6. 이미지 속 글자는 잘 깨지니 **분위기 참고용**입니다. 실제 글자는 게임에서 폰트로 넣습니다.

### 무엇부터 만들면 되나 (우선순위)

| 우선 | 번호 | 게임에서 쓰는 방식 |
|---|---|---|
| ★★★ 필수 | ① 키 이미지 | 전체 색감·조명·캐릭터·UI 톤의 기준 |
| ★★★ 필수 | ⑪ 로고, ⑭ 썸네일·파비콘 | **그대로 게임에 들어감** (타이틀, 링크 공유 미리보기, 브라우저 탭) |
| ★★ 권장 | ③④ 캐릭터 시트 | 3D 캐릭터 색·비율·디테일 조정 기준 |
| ★★ 권장 | ⑦ 바닥·벽 텍스처 | **그대로 게임에 들어감** (반복 타일) |
| ★★ 권장 | ⑬ 스폰서 보드 | **그대로 게임에 들어감** (앞벽 위·관중석 앞 광고판) |
| ★ 선택 | ⑧⑨⑩ UI 킷·스코어보드·메뉴 화면 | CSS 스타일 조정 기준 |
| ★ 선택 | ⑤ 소품, ⑥ 코트 레이아웃, ⑫ 이펙트 | 참고용 |
| (보류) | ② 세로 화면 | 모바일 지원은 MVP 이후 |

### 공통 스타일 문장 (모든 프롬프트에 포함되어 있음)

```
STYLE: clean flat-shaded 3D cartoon, low-poly with smooth simple shapes, cel shading with crisp thick black outlines, minimal texture noise, bold readable silhouettes, soft even arena lighting, saturated but limited palette (deep violet, lavender, off-white, coral red, teal, warm yellow accents), casual sports game aesthetic, simple and tidy
```

---

## ① 키 이미지 — 인게임 화면 (가로 16:9) ★가장 먼저

저장: `assets/design/01_key_gameplay_16x9.png`
첨부: `references/current_game/game_match_view.png` (현재 게임 화면)

```
Redraw the attached gameplay screenshot of my 3D squash web game as a polished, final-quality key art screenshot. Keep exactly the same camera, composition, court proportions, HUD layout and character positions; only raise the art quality and charm.

CAMERA: third-person view from behind and above the player, just outside a transparent glass back wall, looking straight at the front wall. The whole court is visible: front wall, both side walls (their top edge slopes down toward the back), the whole floor.

COURT: regulation-proportioned squash court. Off-white walls with a faint lavender tint and very subtle ball scuff marks, coral-red court lines (front wall out line, service line, diagonal side wall out lines, short line, half-court line, two square service boxes). Dark navy metal "tin" strip along the bottom of the front wall. Deep violet floor with a fine diagonal stripe pattern. A big soft semi-transparent score "0 - 0" painted on the front wall. A row of four fictional sponsor boards above the front wall.

ARENA: dark purple arena. Three-step tiered stands on the left and right outside the court with simple rounded crowd silhouettes in muted purple, teal, coral and mustard tones (low contrast so the ball stays readable), low fictional ad boards in front of the stands, soft violet light glow around the court.

CHARACTERS: two simple cartoon squash players with slender white limbs with visible knees and elbows, thick black outlines, slightly large round heads, short black hair, red headbands, white sneakers with colored soles. The main player (the one the user controls) wears a teal jersey with a yellow chest stripe and black shorts, standing in the right service box about to serve. The AI opponent wears a coral-red jersey with a white chest stripe and black shorts, waiting in the left back area closer to the camera, seen from behind. Both hold squash rackets with yellow strings.

GAMEPLAY OVERLAYS: around the teal player's feet a faint white circle (hitting range) split into a right half and left half, with a dashed yellow circle at half its radius (sweet spot). A small dark squash ball with a short white motion trail flying toward the front wall.

HUD: top-center compact scoreboard (left name "나" in teal, right name "AI" in coral, two yellow rounded score boxes, small game-dot indicators, a thin info line underneath), a "이동 속도" slider pill and a pause button at the top right, one thin rounded control-hint bar at the bottom center. Flat, rounded, high-contrast UI in dark violet with warm yellow accents.

STYLE: clean flat-shaded 3D cartoon, low-poly with smooth simple shapes, cel shading with crisp thick black outlines, minimal texture noise, bold readable silhouettes, soft even arena lighting, saturated but limited palette (deep violet, lavender, off-white, coral red, teal, warm yellow accents), casual sports game aesthetic, simple and tidy.

No real brand names, no real logos, no watermark.
```

## ② (보류) 키 이미지 — 세로 화면 9:16

저장: `assets/design/02_key_gameplay_9x16.png` — 모바일 지원을 시작할 때 만드세요.

```
Match the attached key image exactly in art style, palette, characters and UI style.
Recompose the same squash gameplay scene as a 9:16 portrait mobile screenshot. Camera behind and above the player outside the glass back wall, the whole court visible, front wall in the upper half. Big current score painted softly on the front wall. Scoreboard at the top center, pause button top-right, a virtual joystick bottom-left and two round swing buttons bottom-right labeled with left/right arrows. Same flat cel-shaded 3D cartoon style with thick black outlines. No real brands, no watermark.
```

## ③ 캐릭터 시트 — 플레이어 (청록)

저장: `assets/design/03_char_player_sheet.png`
첨부: ①번 확정 이미지 + `references/current_game/character_front.png`, `character_back_swing.png`

```
Match the attached key image's art style and the attached in-game character screenshots' proportions.
Character turnaround sheet of the player athlete for a 3D squash game: front, side, back and 3/4 views in a neutral athletic ready stance (knees slightly bent, racket up), full body, evenly spaced on a plain light grey background. Plus three small action poses below: forehand drive at impact (low lunge, arm extended to the right side), backhand drive at impact (arm across to the left side), and a running side-step.
Design: simple cartoon athlete, slender white limbs with clear knee and elbow joints, slightly large round head, short black hair, red headband, two small dot eyes, teal sports jersey with a yellow horizontal chest stripe and yellow collar, yellow wristband on the racket hand, black shorts, short white socks, white sneakers with yellow soles, squash racket with dark frame and yellow strings. Crisp thick black outlines, flat cel shading, very few details, readable silhouette from behind (the back view matters most because the camera is behind the player).
Clean model-sheet layout, no text except small view labels.
```

## ④ 캐릭터 시트 — AI 상대 (코랄)

저장: `assets/design/04_char_ai_sheet.png`
첨부: ①번 확정 이미지 + ③번 결과

```
Match the attached key image's art style and the attached player sheet's proportions exactly.
Character turnaround sheet of the AI opponent athlete: front, side, back and 3/4 views in the same athletic ready stance, full body, plain light grey background, plus two small action poses (backhand drive at impact, serving pose).
Design: same body proportions and face style as the player but clearly the rival: coral-red jersey with a white chest stripe and white collar, black shorts, white wristband, red headband, short black hair, white sneakers with white soles, squash racket with dark frame and yellow strings. Crisp thick black outlines, flat cel shading, very few details. The front view matters (this character faces the camera most of the time).
Clean model-sheet layout, no text except small view labels.
```

## ⑤ 소품 — 라켓 · 공 (선택)

저장: `assets/design/05_props_racket_ball.png`

```
Match the attached key image's art style.
Prop sheet on plain light grey background: a squash racket shown front and side (dark frame, yellow strings, coral grip), a squash ball (small dark rubber ball with two tiny yellow dots) shown large and small, and a stylized ball motion-trail shape. Flat cel shading, crisp thick black outlines, simple low-poly shapes. No text.
```

## ⑥ 코트 디자인 레이아웃 (선택)

저장: `assets/design/06_court_layout.png`

```
Match the attached key image's palette and style.
A clean isometric cutaway illustration of the squash court used in the game, showing all four walls (front, two sides with sloped top edges, glass back wall), the floor and every line clearly: front wall out line, service line, tin strip at the bottom of the front wall, diagonal side wall out lines, back wall out line, short line, half-court line and the two square service boxes. Off-white walls with faint lavender tint, coral-red lines, navy tin, deep violet floor with fine diagonal stripe pattern, slightly bluish transparent glass back wall, tiered stands with crowd silhouettes on both sides. Minimal, flat cel-shaded, thick black outlines. No text.
```

## ⑦ 바닥 · 벽 텍스처 (반복 타일)

저장: `assets/design/07_tex_floor.png`, `assets/design/07_tex_wall.png`

```
Seamless tileable square texture, top-down flat view, for a stylized 3D game floor: deep violet base (#5b3fc4) with a subtle fine diagonal stripe pattern in slightly lighter violet, very low contrast, no lighting, no shadows, no perspective, no objects. 1024x1024, must tile perfectly on all edges.
```

```
Seamless tileable square texture, flat front view, for a stylized 3D squash court wall: off-white with a very faint lavender tint (#f1edf8) and an extremely subtle plaster grain, almost flat, no lighting, no shadows, no lines, no objects. 1024x1024, must tile perfectly on all edges.
```

## ⑧ UI 킷 (투명 배경, 선택)

저장: `assets/design/08_ui_kit.png`

```
Match the attached key image's UI style.
A game UI kit sheet on a transparent background: primary button (warm yellow), secondary button (outlined, transparent), disabled button, each in normal and pressed state; rounded panel/card in deep violet gradient with a thin warm-yellow border; small modal window; segmented toggle (3 options); horizontal slider with yellow knob; round icon buttons (pause, resume, restart, home, settings, sound on, sound off, back arrow, close); difficulty cards for EASY / NORMAL / HARD; a small serve-indicator triangle; star and trophy icons.
Flat design, rounded corners, bold dark outlines, slight drop shadow, high contrast, clean and simple, consistent with a casual sports game. Text labels are placeholders.
```

## ⑨ 스코어보드 HUD (투명 배경, 선택)

저장: `assets/design/09_hud_scoreboard.png`

```
Match the attached key image's UI style.
A top-center scoreboard HUD bar for a squash game on a transparent background, shown in three states stacked vertically: (1) normal match state with two player names (left teal, right coral), small game-won dots, big current point numbers in warm yellow rounded boxes, a thin info line below with a small serve-indicator triangle; (2) "GAME POINT" highlight state; (3) "DEUCE" highlight state.
Broadcast sports-graphic style but simple: dark violet bars, warm yellow score boxes, dark bold numbers, thin outlines. Also include a separate small combo counter widget for solo mode ("COMBO 23", "BEST 41") aligned top-left.
```

## ⑩ 메뉴 화면 목업 (선택)

저장: `assets/design/10_screen_title.png`, `10_screen_mode.png`, `10_screen_difficulty.png`, `10_screen_result.png`

```
Match the attached key image and UI kit style.
Title screen for a casual 3D squash web game, 16:9. The game logo "SQUASH RALLY" large in the middle with a small racket icon, a short tagline below, a big yellow start button. Behind it, a blurred view of the court and the crowd stands with the two cartoon athletes (teal and coral) in dynamic poses mid-rally. Deep violet arena, clean and uncluttered.
```

```
Match the attached key image and UI kit style.
Main menu screen, 16:9: a vertical stack of large rounded buttons — "1인 모드" (solo wall practice, combo icon), "AI 대전" (vs computer, trophy icon), "조작법", "설정". Logo with racket icon on top. Deep violet blurred court background, clean flat UI.
```

```
Match the attached key image and UI kit style.
Difficulty select screen, 16:9: three cards EASY / NORMAL / HARD. Each card shows a small top-down court diagram that gets visibly smaller from EASY to HARD (the court shrinks and the game gets faster as difficulty rises), with teal / yellow / coral color coding. Back button below. Clean flat UI.
```

```
Match the attached key image and UI kit style.
Match result screen, 16:9: big "YOU WIN!" banner in yellow (alternate muted version "AI WIN"), final game score "2 : 1" with per-game score tiles below (11-8, 9-11, 12-10), a stats row (my hits, PERFECT rate, longest rally), two buttons "재대결" and "메인으로". The winning cartoon athlete in a celebrating pose on the side.
```

## ⑪ 게임 로고 (투명 배경) ★필수

저장: `assets/design/11_logo.png`

```
Game logo "SQUASH RALLY" on a transparent background. Two lines: "SQUASH" above "RALLY". Chunky bold rounded display lettering in warm yellow (#ffc93c) with a thick deep-violet (#1a1238) outline and a solid deep-violet drop shadow below, slightly tilted for energy. A squash racket (dark frame, yellow strings, coral grip) on the left side and a small dark squash ball with a white speed trail swooshing through the letters. Flat, clean, readable at small sizes. No other text.
```

## ⑫ 타격 이펙트 스프라이트 시트 (투명 배경, 선택)

저장: `assets/design/12_fx_sheet.png`

```
Match the attached key image's FX style.
A 2D game effects sprite sheet on a transparent background, arranged in a clean grid, each row an animation sequence of 6 frames: (1) impact flash burst, white core with warm yellow edge and short radial sparks; (2) expanding impact ring shockwave; (3) wall hit dust puff, small and soft lavender-white; (4) white curved swing-trail arc, tapering; (5) "PERFECT!" text pop-up in bold yellow with dark outline, scaling up then fading; (6) "GOOD" text pop-up in teal. Flat cel-shaded, crisp edges, no background, no glow haze.
```

## ⑬ 스폰서 보드 (가상 브랜드) ★권장

저장: `assets/design/13_sponsor_boards.png`

```
Match the attached key image's palette.
A sheet of six wide horizontal arena sponsor boards (each about 4:1) for a fictional squash tournament, stacked vertically with even gaps, each with a different invented simple logo mark and name: "ZEPHRA", "KORVO", "LUMEN-9", "TALLIX", "BRIQ", "NOVAPEAK". Dark violet and navy boards with white, warm-yellow and teal minimal logos, flat design, no real brands.
```

## ⑭ 링크 공유 썸네일 · 파비콘 ★필수

저장: `assets/design/14_og_thumbnail.png` (1200×630), `assets/design/14_favicon.png`

```
Match the attached key image and logo style.
Social share thumbnail, exactly 1200x630: the "SQUASH RALLY" logo on the left, on the right the teal cartoon athlete in a low lunge hitting a forehand drive with a big impact flash and the ball flying toward a squash front wall, a few crowd silhouettes in the dark violet background, a short tagline placeholder below the logo. Bold, readable at small size. No real brands.
```

```
Simple app icon / favicon, square, rounded-square background in deep violet (#2a1f52): a dark squash ball with a short yellow speed trail and a small racket head with yellow strings behind it. Flat, thick outlines, readable at 32x32.
```

---

## 생성 후 체크

- [ ] ①이 현재 게임 구도(카메라·코트 비율·HUD 위치)를 유지하면서 그림체만 좋아졌는지
- [ ] 캐릭터 뒷모습(③ back view)이 잘 나왔는지 — 게임 내내 보이는 건 등
- [ ] 텍스처(⑦)를 이어붙였을 때 이음새가 보이지 않는지
- [ ] 실존 브랜드/로고가 들어가지 않았는지
- [ ] 파일명대로 `assets/design/`에 저장했는지 → 저장 후 Claude Code에 "assets/design에 이미지 넣었어, M6 2차 진행해줘"
