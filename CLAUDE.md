# SQUASH RALLY — 프로젝트 규칙

브라우저 3D 스쿼시 웹게임. 기준 문서: `docs/01_기획서_설계의도.md`(설계 의도) → `spec.md`(구현 스펙).
기획서와 다르게 가야 하면 임의로 바꾸지 말고 사용자에게 먼저 묻는다.

## 스택
- TypeScript + Vite, Three.js, lil-gui(디버그), Vitest, Playwright
- 서버 없음. 정적 빌드(`dist/`) → GitHub Pages (`ovencub/squash-rally`, `base: '/squash-rally/'`)

## 명령
- `npm run dev` → http://localhost:5173/squash-rally/
- `npm test` — 룰/물리/제스처 단위 테스트 (Vitest)
- `npm run e2e` — Playwright 스크린샷/FPS (`tests/e2e/`, 결과는 `test-results/`)
- `npm run build` / `npm run preview`
- 배포: `main`에 push하면 `.github/workflows/deploy.yml`이 Pages에 배포

## 폴더
- `src/config/tuning.ts` — **모든 튜닝값은 여기만.** 다른 파일에 매직 넘버 금지(렌더링 장식용 색·크기 제외).
- `src/config/court.ts` — WSF 규격 + 난이도 배율
- `src/core` 루프/RNG/이벤트, `src/physics` 공, `src/rules` 판정·점수(순수), `src/input` 제스처·키보드
- `src/game` 플레이어/AI/스윙/모드, `src/render` Three.js, `src/audio`, `src/ui` DOM, `src/debug`
- `public/sfx/` 가공된 음원, `assets/sfx/_inbox/` 수동 다운로드 원본, `assets/design/` GPT 이미지
- `references/` 레퍼런스 영상·이미지 (수정 금지)

## 코딩 규칙
- 좌표: 원점 = 앞벽 바닥 중앙, x 오른쪽, y 위, z 앞벽(0)→뒷벽(L). 단위 m/s.
- `src/rules`와 `src/physics`는 Three.js·DOM을 import하지 않는다 (테스트 가능한 순수 TS).
- 게임 로직 랜덤은 `core/rng.ts`만 사용 (Math.random 금지, FX 장식은 예외).
- 시뮬레이션은 고정 타임스텝 루프에서만 진행. 렌더/오디오/FX는 이벤트 버스 구독.
- `tuning` 값은 매번 읽는다 (디버그 패널이 실시간 수정).
- 룰 변경 시 테스트를 먼저 추가/수정하고 `npm test` 통과 확인.
- 실존 브랜드/협회 로고·이름 사용 금지 (스폰서 보드는 가상 이름).
- 마일스톤(M0~M7)마다 멈춰서 보고: 만든 것 / 실행 방법 / 체크포인트 3~5개 / 튜닝 후보 / FPS.

## 사운드 라이선스 규칙
- 허용 우선순위: CC0 > Pixabay 라이선스 > CC-BY(크레딧 화면 표기 필수).
- **금지**: CC-BY-NC 등 비상업, 출처 불명, 유료.
- 모든 음원은 `assets/sfx/CREDITS.md`에 [사용 파일명 / 원본 이름 / 출처 URL / 작성자 / 라이선스] 기록.
- 다운로드한 압축 파일은 새 빈 폴더(`assets/sfx/_downloads/<팩이름>/`)에 풀고, 스크립트는 그 안에서 실행하지 않는다.
- 가공: `python scripts/build_sfx.py assets/sfx/_downloads public/sfx` — 앞 무음 제거 → 피크 정규화 → `.ogg`(+`.m4a` 사파리 폴백) + `manifest.json`. 매핑(어떤 원본을 어떤 소리로)은 스크립트 상단 `MAP`.
- 소리 조합(파일 + 합성 레이어 + EQ + 잔향 센드)은 `src/audio/sfx.ts`의 `BANK`. 합성 레이어는 실제 경기음 분석값 기반(`src/audio/synth.ts`).
- 레퍼런스 영상(`references/sound/`)은 분석만 하고 소리를 복사하지 않는다.
- 못 구한 소리는 `audio/synth.ts` 합성음으로 두고 CREDITS에 "임시 합성음"으로 표시.
