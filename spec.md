# SQUASH RALLY — 구현 스펙

> 기준 문서: `docs/01_기획서_설계의도.md` (설계 의도). 이 문서는 그것을 실제 코드 구조로 옮긴 것.
> 기획서와 충돌하면 기획서가 우선이며, 바꿔야 하면 사용자에게 먼저 묻는다.

## 1. 기술 스택

| 항목 | 선택 | 근거 |
|---|---|---|
| 언어/빌드 | TypeScript + Vite | 정적 빌드(`dist/`), HMR, 타입 안정성 |
| 3D | Three.js | 툰 셰이딩·외곽선·저폴리 표현이 간단, 번들 작음 |
| 물리 | 자체 탄도 모델 | 축 정렬 평면 6개뿐 → 엔진 불필요, 판정 결정성 확보 |
| UI | DOM 오버레이 | 폰트 렌더링 선명, 3D와 분리 |
| 디버그 | lil-gui | 튜닝값 실시간 조절 |
| 테스트 | Vitest(단위) + Playwright(스크린샷/FPS) | |
| 배포 | GitHub Pages (Actions), `ovencub/squash-rally` | `base: '/squash-rally/'` |

## 2. 좌표계 / 단위

- 단위: 미터, 초, 라디안.
- 원점: **앞벽 바닥 중앙**. `x` = 좌(-)→우(+), `y` = 위, `z` = 앞벽(0) → 뒷벽(`L`).
- 앞벽은 `z=0` 평면, 뒷벽(유리)은 `z=L`, 옆벽은 `x=±W/2`, 바닥은 `y=0`.
- 카메라는 `z > L`(뒷벽 바깥)에서 `-z` 방향(앞벽)을 본다. 화면 오른쪽 = `+x`.

## 3. 코트 (`src/config/court.ts`)

WSF 기준값(배율 1.0):

| 키 | 값 | 비고 |
|---|---|---|
| length | 9.75 | 앞벽→뒷벽 |
| width | 6.40 | |
| frontOutHeight | 4.57 | |
| backOutHeight | 2.13 | |
| serviceLineHeight | 1.78 | |
| tinHeight | 0.48 | 윗선 |
| shortLineZ | 5.44 | 앞벽에서 |
| serviceBoxSize | 1.60 | |

`buildCourt(difficulty)`가 배율을 적용한 `CourtDims`를 반환한다.
- 길이 관련(length, shortLineZ, serviceBoxSize의 z 성분)은 `lengthScale`, 폭 관련은 `widthScale`.
- 서비스 박스는 길이·폭 배율 중 작은 값으로 정사각형 유지.
- 높이 라인은 `tuning.court.scaleHeightLines`가 `true`일 때만 `lengthScale`로 축소(기본 `false`, 기획서 6-3 미결정).
- 옆벽 아웃 라인 높이: `sideOutHeight(z) = lerp(frontOutHeight, backOutHeight, z / length)`.

## 4. 설정 (`src/config/tuning.ts`)

모든 튜닝값은 이 파일 하나의 `tuning` 객체에 둔다. 다른 모듈은 숫자 상수를 직접 쓰지 않는다.
디버그 패널이 이 객체를 직접 수정하므로 값은 매 프레임 읽는다(캐시 금지).

섹션: `game`(이름, 시드), `court`(난이도 배율, scaleHeightLines), `physics`, `shots`(drive/drop/block), `timing`(판정 창), `input`(제스처 임계값, invertDriveDrop, 입력 버퍼), `player`(이동), `ai`(난이도별), `fx`(히트스톱·진동·트레일 등), `camera`, `audio`.

난이도 기본값(기획서 3-2):

| 난이도 | lengthScale | widthScale |
|---|---|---|
| easy | 1.00 | 1.00 |
| normal | 0.85 | 0.90 |
| hard | 0.70 | 0.80 |

## 5. 모듈

### core
- `loop.ts`: 고정 타임스텝(`physics.substepHz`=240) 누적 루프. `timeScale`(슬로모)과 `hitstop(ms)` 지원. 시뮬레이션은 오직 여기서 진행.
- `rng.ts`: mulberry32 시드 RNG. 게임 로직의 모든 랜덤은 이것만 사용.
- `events.ts`: 타입드 이벤트 버스(`contact`, `hit`, `rallyEnd`, `point`, `squeak` …). 렌더·오디오·FX는 이벤트만 구독.

### physics
- `ball.ts`: 상태 `{pos, vel, spin}`. 적분: 반암시적 오일러, 중력 + 2차 공기저항(`dragK·|v|·v`). 스핀은 스칼라 백/톱스핀 근사(바닥 바운드 시 수평 속도 보정).
- `collide.ts`: 서브스텝마다 이동 구간에 대해 각 평면 통과 시각 `t∈[0,dt]`를 계산(공 반지름 오프셋). 가장 이른 접촉부터 처리 → 반사(법선 성분 × `restitution[surface]`, 접선 × `(1-friction[surface])`) → 남은 시간 계속. 접촉마다 `BallContact {surface, point, normalSpeed, time}` 발행.
  - surface: `front | left | right | back | floor | tin | ceiling`(ceiling = 아웃 처리용 가상면 없음; 아웃은 라인 높이로 판정).
- `aim.ts`: 앞벽 목표점(x, y)과 속력 → 발사 속도 역산(실제 적분기로 반복 보정). `aimForLanding`은 첫 바운드 깊이까지 맞춰 속력을 이분 탐색. 스윙·AI·서브·디버그 프리셋 공용.
- `predict.ts`: 같은 적분기로 미래 궤적 샘플링(최대 N초). 반환: 점 배열 + 접촉 목록 + "타격 가능 높이 구간 진입 시각/위치". AI·타이밍 링·디버그 예측선 공용.

### rules (순수 함수, 렌더/입력 의존 금지)
- `rally.ts`: `RallyState` + `applyContact(state, contact, court) → {state, result?}`, `applyHit(state, hitter) → state`.
  - 상태: `lastHitter`, `phase: 'serve' | 'toFront' | 'live'`, `floorBounces`, `serveState`.
  - 판정(공 반지름 r 고려, **라인 위 = 아웃, 틴 윗선 = 틴**):
    - 벽 접촉 시 `contact.y + r >= outHeight(surface, z)` → `OUT`
    - 앞벽 접촉 시 `contact.y - r <= tinHeight` → `TIN`
    - 타격 후 앞벽 전에 바닥 → `DOWN`(틴 취급)
    - 바닥 2회째 → `DOUBLE_BOUNCE` (마지막 타자 득점)
    - 서브: 앞벽 접촉 높이가 서비스라인 미만(`y - r <= serviceLine`이면 폴트, 라인 위=폴트) → `FAULT`; 앞벽 후 첫 바닥이 상대 뒤 사각형(숏라인 뒤, 서버 반대편 하프) 밖 → `FAULT`; 단 첫 바닥 전에 리시버가 타격하면 유효.
  - 결과: `{ loser: 'A'|'B', reason: 'OUT'|'TIN'|'DOWN'|'DOUBLE_BOUNCE'|'FAULT' }`.
- `par.ts`: `MatchState`, `awardRally(state, winner)`. 11점 선취, 10:10 이후 2점 차, 2게임 선취 승. 서브권: 랠리 승자. 연속 서브 시 박스 좌↔우 교대, 서브권 이동 시 새 서버는 오른쪽 박스 기본.
- `serve.ts`: 서브 박스/리시브 사각형 영역 계산 헬퍼.

### input
- `gesture.ts` (순수): 입력 = 포인터 샘플 `{t, x, y}[]`(화면 정규화 좌표, 위가 -y). 출력 = `{shot, power(0..1), aim(-1..1)} | null`.
  - 누른 시간 < `tapMaxMs` 이고 총 이동 < `tapMaxDist` → `BLOCK`.
  - 최종 스트로크 = 마지막 방향 전환점 이후 구간. 위로(-y) 밀면 `DRIVE`, 아래로 내리면 `DROP` (`invertDriveDrop`이면 반대). 사전 반대방향 와인드업은 있으면 파워 보너스, 없어도 인정.
  - power = 스트로크 속도 / `maxStrokeSpeed`, 상한 1.
  - aim = 스트로크 수평 성분 / 수직 성분, `[-1,1]` 클램프.
- 입력 버퍼: 제스처 완성 시각부터 `bufferMs` 동안 타격 가능 구간 진입을 기다림.
- `keyboard.ts`: WASD/방향키 → 이동 벡터.

### game
- `player.ts`: 가속/감속 관성, 최고속도 상한, 급정지·급전환(속도 방향 변화 > 임계) 시 `squeak` 이벤트(쿨다운). 자동 위치 보조: 입력 없을 때 예측 타점 쪽으로 `assistSpeed`로 이동(easy 기본 ON, 설정에서 토글).
- `swing.ts`: 타격 가능 조건 = 공이 캐릭터 기준 반경 `reach` 이내 & 높이 구간. 타이밍 오차 = |입력 시점 − 이상 타점 시각|. `PERFECT ≤ perfectMs < GOOD ≤ goodMs < LATE/EARLY`. 샷 프로파일(목표 앞벽 높이, 속도, 스핀) + 파워 + 조준 → 앞벽 목표점으로 출사 속도 역산, 판정에 따라 각도/높이 가우시안 오차.
  - 포/백핸드: 공 x > 캐릭터 x → 포핸드.
- `ai.ts`: 상대 타격 이벤트 후 `reactionMs` 대기 → `predict`로 타점 추정(+`predictErr` 노이즈) → 플레이어와 같은 이동 모델로 이동 → 샷 선택(난이도별 정책: hard는 상대가 뒤면 DROP, 앞이면 깊은 DRIVE) → 판정은 `mistakeRate`로 확률적.
- `modes/solo.ts`: 콤보, 최고 콤보(localStorage `squash.best.<difficulty>`), PERFECT 수, 실점 시 콤보 0 + 재서브.
- `modes/match.ts`: PAR 룰 + AI + 판정 연출.

### render
- `scene.ts`: 렌더러, 조명(반구광 + 약한 방향광), 툰 머티리얼 팩토리, 외곽선(역면 확대 메시).
- `court-mesh.ts`: `CourtDims`로 벽·바닥·라인·틴·유리 뒷벽·아레나·가상 스폰서 보드 생성. 난이도 변경 시 재생성.
- `character.ts`: 기본 도형 캐릭터(머리·헤드밴드·몸통·가는 팔다리·라켓), 스윙 절차 애니메이션.
- `camera.ts`: 기준 위치 = 뒷벽 바깥 위. 매 리사이즈 시 코트 8개 꼭짓점이 화면에 들어오는 거리/FOV 계산. 플레이어 x/z를 저역필터로 소량 추종하되 그 범위로 클램프.
- `fx/`: 트레일, 임팩트 섬광/스파크, 공 잔상, 타이밍 링(예상 타점 바닥 점선 링 축소), 타격 범위 원, 벽 자국, 판정 팝업, 화면 진동.

### audio
- `sfx.ts`: 이름 → 파일 후보 목록. 피치 ±`pitchJitter`, 속도→볼륨 매핑, 스퀵 쿨다운. 파일이 없으면 `synth.ts`로 폴백.
- 사운드 키: `ui_hover, ui_click, ui_confirm, ui_back, ui_pause, hit_soft, hit_hard, hit_perfect, bounce_front, bounce_side, bounce_glass, bounce_floor, tin, squeak, step, point_win, point_lose, game_win, match_win, match_lose`.

### ui
- 화면: 타이틀 → 메인 → (1인/AI) 난이도 → 플레이 → 일시정지 → 결과. 조작법, 설정(효과음 볼륨, 진동 끔/약/보통, 자동 위치 보조).
- HUD: 하단 조작 안내 한 줄 상시, 포/백핸드 표시, 1인: 콤보/최고/PERFECT, AI: 상단 중앙 스코어 + 앞벽 큰 점수.

### debug
- `panel.ts`: `` ` `` 키 토글. `tuning` 전 섹션 슬라이더, 공 발사기(위치/속도), 예측선·충돌점 표시, 슬로모, FPS.

## 6. 미결정 항목 처리 (기획서 6절)

| # | 항목 | 현재 값 | 위치 |
|---|---|---|---|
| — | easy 코트 크기 | 길이 1.15 × 폭 1.12 (M0 피드백: 실제 규격보다 커도 됨) | `tuning.court.scale.easy` |
| 1 | 이동 방식 | WASD + easy 자동 보조 | `tuning.player.autoAssist` |
| 2 | 드라이브/드롭 방향 | 아래→위 = 드라이브 | `tuning.input.invertDriveDrop` |
| 3 | 높이 라인 축소 | 안 함 | `tuning.court.scaleHeightLines` |
| 4 | 게임 이름 | SQUASH RALLY | `tuning.game.title` |
| 5 | 모바일 | MVP 이후 | — |
| 6 | 배포처 | GitHub Pages | `.github/workflows/deploy.yml` |

## 7. 테스트

- `tests/rules.rally.test.ts`: OUT(라인 위 포함, 옆벽 사선), TIN(윗선 포함), DOWN, DOUBLE_BOUNCE, 서브 폴트 2종 + 발리 예외, 옆벽 경유 유효.
- `tests/rules.par.test.ts`: 11점, 10:10 → 12:10, 3게임 매치, 서브 박스 교대.
- `tests/physics.test.ts`: 결정성(같은 입력 → 같은 접촉 목록), 고속에서도 벽 통과 없음, 예측 = 실제 시뮬레이션.
- `tests/gesture.test.ts`: 드라이브/드롭/블록 분류, 반전 플래그, 파워 상한, 조준.
- `tests/e2e/`: 화면비별 스크린샷, FPS 측정.
