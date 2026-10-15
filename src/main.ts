import * as THREE from 'three';
import { sfx } from './audio/sfx';
import { buildCourt } from './config/court';
import { tuning, type Difficulty } from './config/tuning';
import { Game, type HitEvent, type MatchStats, type Mode, type WhiffReason } from './game/game';
import { type Hand } from './game/swing';
import { TouchControls } from './input/touch';
import { JoinError, normalizeCode, OnlineSession, roomLink } from './net/online';
import { type NetMsg } from './net/protocol';
import { BALL_SCALE, loadSettings, saveSettings } from './game/settings';
import { type Vec3 } from './physics/ball';
import { isDeuce, type MatchState } from './rules/par';
import { type RallyResult } from './rules/rally';
import { CameraRig } from './render/camera';
import { createCourtMesh } from './render/court-mesh';
import { createRenderer, createScene } from './render/scene';
import { matchReasonText, REASON_TEXT } from './ui/labels';
import { Screens } from './ui/screens';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const boot = document.getElementById('boot');
/** WebGL을 못 쓰는 환경이면 안내만 보여주고 멈춘다 */
function fatal(msg: string): never {
  const m = document.getElementById('bootMsg');
  if (m) m.innerHTML = msg;
  boot?.querySelector('div')?.remove();
  throw new Error(msg);
}
let rendererOrNull: ReturnType<typeof createRenderer> | null = null;
try {
  rendererOrNull = createRenderer(canvas);
} catch {
  /* 아래에서 안내 */
}
if (!rendererOrNull) fatal('이 브라우저에서는 3D(WebGL)를 쓸 수 없어요.<br>최신 크롬·엣지·사파리·파이어폭스에서 열어주세요.');
const renderer = rendererOrNull;
const scene = createScene();
const settings = loadSettings();
sfx.volume = settings.volume;
tuning.fx.ballVisualScale = BALL_SCALE[settings.ballSize];

// ── HUD ──
ui.innerHTML = `
  <div id="hud" class="hidden">
    <div class="scoreboard hidden" id="scoreboard">
      <div class="sb-p"><span class="sb-name">나</span><span class="sb-games" id="gA"></span><b class="sb-pts" id="pA">0</b></div>
      <span class="sb-sep">:</span>
      <div class="sb-p"><b class="sb-pts" id="pB">0</b><span class="sb-games" id="gB"></span><span class="sb-name ai">AI</span></div>
      <div class="sb-info" id="sbInfo"></div>
    </div>
    <div class="net-badge hidden" id="netBadge"></div>
    <div class="serve-tip hidden" id="serveTip">클릭해서 <b>서브</b>!</div>
    <div class="combo"><div class="l">COMBO</div><div class="n" id="combo">0</div><div class="s" id="comboSub"></div></div>
    <div class="side-label" id="side"></div>
    <div class="speed-ctl" title="캐릭터 이동 속도 (플레이 중에도 조절)">
      <span>이동 속도</span>
      <input type="range" id="moveSpeed" min="${tuning.player.moveSpeedMin}" max="${tuning.player.moveSpeedMax}" step="0.1">
      <b id="moveSpeedVal"></b>
    </div>
    <button class="pause-btn" id="pauseBtn" title="일시정지 (Esc)">II</button>
    <div class="banner" id="banner"><div class="t"></div><div class="d"></div></div>
    <!-- 조작 시각화 (PC): 좌상단 WASD, 우상단 마우스 — 누르는 키만 노랗게 채움 -->
    <div class="ctl-keys pc-only" id="ctlKeys">
      <div class="kc" data-k="w">W</div>
      <div class="kc-row"><div class="kc" data-k="a">A</div><div class="kc" data-k="s">S</div><div class="kc" data-k="d">D</div></div>
      <div class="ctl-label">이동</div>
    </div>
    <div class="ctl-mouse pc-only" id="ctlMouse">
      <svg viewBox="0 0 140 176" aria-hidden="true">
        <path id="mL" class="mb" d="M68 6 C34 6 10 30 10 66 L10 84 L68 84 Z"/>
        <path id="mR" class="mb" d="M72 6 L72 84 L130 84 L130 66 C130 30 106 6 72 6 Z"/>
        <path class="mbody" d="M10 88 L130 88 L130 112 C130 148 104 170 70 170 C36 170 10 148 10 112 Z"/>
        <text x="39" y="52" class="ml l">백핸드</text><text x="101" y="52" class="ml r">포핸드</text>
        <text x="39" y="70" class="ms l">좌클릭</text><text x="101" y="70" class="ms r">우클릭</text>
        <text x="70" y="130" class="mt">공 쪽 버튼</text>
      </svg>
    </div>
    <div class="hud-guide pc-only">
      <span><kbd>커서</kbd> 방향</span><i></i>
      <span><kbd>Esc</kbd> 일시정지</span>
    </div>
  </div>
  <div id="popups"></div>
  <div id="fps" style="position:absolute;right:8px;bottom:6px;font-size:11px;opacity:.45"></div>
`;
const hud = document.getElementById('hud')!;
const comboEl = document.getElementById('combo')!;
const comboSub = document.getElementById('comboSub')!;
const sideEl = document.getElementById('side')!;
const banner = document.getElementById('banner')!;
const popups = document.getElementById('popups')!;
const fpsEl = document.getElementById('fps')!;
const comboBox = document.querySelector('.combo') as HTMLElement;
const scoreboard = document.getElementById('scoreboard')!;
const serveTip = document.getElementById('serveTip')!;
const speedCtl = document.querySelector('.speed-ctl') as HTMLElement;
const netBadge = document.getElementById('netBadge')!;
const screens = new Screens(ui);

// 이동 속도 슬라이더 (HUD). 조절 후 포커스를 바로 풀어 방향키가 슬라이더를 움직이지 않게 한다.
const speedInput = document.getElementById('moveSpeed') as HTMLInputElement;
const speedVal = document.getElementById('moveSpeedVal')!;
function syncSpeedUi() {
  speedInput.value = String(settings.moveSpeed);
  speedVal.textContent = settings.moveSpeed.toFixed(1);
  tuning.fx.ballVisualScale = BALL_SCALE[settings.ballSize];
  applyControlMode();
}

// ── 모바일 화면 확대 방지 (iOS 사파리는 viewport user-scalable=no를 무시하므로 이벤트로 막음) ──
let lastTap = { t: 0, x: 0, y: 0 };
document.addEventListener(
  'touchend',
  (e) => {
    const now = performance.now();
    const p = e.changedTouches[0];
    const t = e.target as HTMLElement | null;
    // 같은 자리를 빠르게 두 번 탭(= 더블탭 확대 제스처)일 때만 기본 동작을 막음. 버튼·입력창은 CSS(touch-action)로 이미 확대가 막혀 있어 제외
    const same = p && Math.hypot(p.clientX - lastTap.x, p.clientY - lastTap.y) < 40;
    if (now - lastTap.t < 350 && same && !t?.closest('button, input, textarea, .btn, [data-act], [data-seg]')) e.preventDefault();
    lastTap = { t: now, x: p?.clientX ?? 0, y: p?.clientY ?? 0 };
  },
  { passive: false },
);
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
// 두 손가락 핀치 확대 방지
document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });

// ── 모바일 터치 조작 ──
const touch = new TouchControls(ui, {
  onSwing: (hand, ax) => {
    if (!game) return;
    sfx.unlock();
    // 치는 순간 조이스틱 좌우 기울기 → 공 방향 (기울이지 않으면 정면)
    const p = game.playerPos;
    game.swing({ hand, aim: Math.abs(ax) > 0.2 ? { x: p.x + ax * 2.2, z: p.z - 2 } : null });
  },
});
const rotateNote = document.createElement('div');
rotateNote.className = 'rotate-note hidden';
rotateNote.innerHTML = '<div>📱↻</div><b>화면을 가로로 돌려주세요</b>';
ui.appendChild(rotateNote);
const isMobile = () => settings.control === 'mobile';
/** 조작 방식(PC/모바일)에 맞게 HUD와 터치 컨트롤 표시 */
function applyControlMode() {
  const mob = isMobile();
  document.body.classList.toggle('mobile', mob);
  touch.setVisible(mob && !!game && !game.paused && !screens.visible);
  rotateNote.classList.toggle('hidden', !(mob && window.innerHeight > window.innerWidth));
  // 모바일은 해상도 배율을 낮춰 프레임 확보
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mob ? 1.5 : 2));
}
speedInput.addEventListener('input', () => {
  settings.moveSpeed = Number(speedInput.value);
  speedVal.textContent = settings.moveSpeed.toFixed(1);
  saveSettings(settings);
});
speedInput.addEventListener('change', () => speedInput.blur());
speedInput.addEventListener('pointerup', () => speedInput.blur());

// ── 메뉴 배경: 코트만 ──
const backdropRig = new CameraRig();
let backdrop: THREE.Group | null = createCourtMesh(buildCourt('easy'));
scene.add(backdrop);

let game: Game | null = null;
let difficulty: Difficulty = 'easy';
syncSpeedUi();

function aspect() {
  return window.innerWidth / window.innerHeight;
}
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  backdropRig.fit(buildCourt('easy'), aspect());
  game?.resize(aspect());
}
window.addEventListener('resize', () => {
  resize();
  applyControlMode();
});

function project(p: Vec3): { x: number; y: number } {
  const v = new THREE.Vector3(p.x, p.y, p.z).project((game?.rig ?? backdropRig).camera);
  return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
}

function popup(text: string, cls: string, at: Vec3, sub: string | null = null) {
  const s = project(at);
  const d = document.createElement('div');
  d.className = `popup ${cls}`;
  d.textContent = text;
  if (sub) {
    const e = document.createElement('small');
    e.textContent = sub;
    d.appendChild(e);
  }
  d.style.left = `${s.x}px`;
  d.style.top = `${s.y - 70}px`;
  popups.appendChild(d);
  setTimeout(() => d.remove(), 800);
}

let bannerTimer = 0;
function showBanner(title: string, desc: string, seconds = 1.6) {
  banner.querySelector('.t')!.textContent = title;
  banner.querySelector('.d')!.textContent = desc;
  banner.classList.add('show');
  bannerTimer = seconds;
}

const GRADE_TEXT = { perfect: 'PERFECT!', good: 'GOOD', weak: 'WEAK' };
const WHIFF_TEXT: Record<WhiffReason, (h: Hand) => [string, string | null]> = {
  wrongHand: (h) => ['반대 손!', h === 'fore' ? '공이 왼쪽 → 좌클릭(백핸드)' : '공이 오른쪽 → 우클릭(포핸드)'],
  outOfRange: () => ['헛스윙', '공이 범위 밖이에요'],
  noBall: () => ['헛스윙', null],
  notYourTurn: () => ['헛스윙', `${oppName()}가 칠 차례예요`],
};

const dots = (n: number) => '●'.repeat(n) + '○'.repeat(Math.max(0, 2 - n));
/** 상대 이름: AI 대전 = "AI", 온라인 = "친구" */
const oppName = () => (mode === 'online' ? '친구' : 'AI');
const ME = () => game?.me ?? 'A';
const THEM = () => game?.them ?? 'B';
function renderScore(m: MatchState) {
  const me = ME();
  const them = THEM();
  document.getElementById('pA')!.textContent = String(m.points[me]);
  document.getElementById('pB')!.textContent = String(m.points[them]);
  document.getElementById('gA')!.textContent = dots(m.games[me]);
  document.getElementById('gB')!.textContent = dots(m.games[them]);
  document.querySelector('.sb-name.ai')!.textContent = oppName();
  const gameNo = m.history.length + (m.winner ? 0 : 1);
  const serveSide = m.serveSide === 'right' ? '오른쪽' : '왼쪽';
  document.getElementById('sbInfo')!.textContent =
    `GAME ${gameNo}  |  11점 선취  |  서브 ${m.server === me ? '◀ 나' : `${oppName()} ▶`} (${serveSide})${isDeuce(m.points) ? '  |  듀스 · 2점 차' : ''}`;
  for (const id of ['pA', 'pB']) {
    const el = document.getElementById(id)!;
    el.classList.remove('punch');
    void el.offsetWidth;
    el.classList.add('punch');
  }
}

let mode: Mode = 'solo';
function startSolo(d: Difficulty) {
  startGame('solo', d);
}
function startMatch(d: Difficulty) {
  startGame('match', d);
}

function startGame(m: Mode, d: Difficulty, link: OnlineSession | null = null) {
  mode = m;
  difficulty = d;
  screens.hide();
  if (isMobile()) {
    // 모바일: 가능하면 전체 화면 + 가로 고정 (지원 안 하는 브라우저는 무시)
    void document.documentElement.requestFullscreen?.().catch(() => {});
    void (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {});
  }
  if (backdrop) {
    scene.remove(backdrop);
    backdrop = null;
  }
  game?.dispose();
  game = new Game(scene, d, settings, {
    onHit: (e: HitEvent) => {
      if (e.by !== game?.me) return;
      popup(GRADE_TEXT[e.grade], e.grade, e.at, e.hint);
      comboEl.classList.remove('punch');
      void comboEl.offsetWidth;
      comboEl.classList.add('punch');
    },
    onRallyEnd: (r: RallyResult) => {
      const t = REASON_TEXT[r.reason];
      if (mode === 'solo') showBanner(t.title, t.desc);
    },
    onPoint: (r: RallyResult, ms: MatchState) => {
      const t = REASON_TEXT[r.reason];
      const me = ME();
      const them = THEM();
      const who = r.winner === me ? '내 득점!' : `${oppName()} 득점`;
      if (ms.gameJustWon) {
        const last = ms.history[ms.history.length - 1];
        const title = ms.winner ? (ms.winner === me ? 'MATCH WIN!' : 'MATCH LOST') : `GAME ${ms.history.length}`;
        showBanner(title, `${ms.gameJustWon === me ? '내가' : `${oppName()}가`} 게임을 가져갔어요 (${last[me]} - ${last[them]})`, 2.6);
      } else showBanner(t.title, `${who} · ${matchReasonText(r.reason, r.loser === me).replace('AI', oppName())}`);
      renderScore(ms);
    },
    onServeReady: (ms: MatchState) => {
      renderScore(ms);
      serveTip.classList.toggle('hidden', ms.server !== ME());
    },
    onMatchEnd: (ms: MatchState, st: MatchStats) => {
      if (!game) return;
      if (mode === 'online') {
        screens.matchResults(ms, st, difficulty, { retry: requestRematch, menu: leaveOnline }, game.me, true);
        return;
      }
      game.paused = true;
      screens.matchResults(ms, st, difficulty, { retry: () => startMatch(difficulty), menu: backToMenu });
    },
    onWhiff: (reason: WhiffReason, hand: Hand) => {
      if (!game) return;
      const [t, sub] = WHIFF_TEXT[reason](hand);
      popup(t, 'whiff', { x: game.playerPos.x, y: 1.9, z: game.playerPos.z }, sub);
    },
  }, m, link);
  game.resize(aspect());
  comboBox.classList.toggle('hidden', m !== 'solo');
  scoreboard.classList.toggle('hidden', m === 'solo');
  speedCtl.classList.toggle('hidden', false);
  if (game.match) renderScore(game.match);
  syncSpeedUi();
  hud.classList.remove('hidden');
  banner.classList.remove('show');
  if (!settings.seenTutorial) {
    const tip = document.createElement('div');
    tip.className = 'tutorial';
    tip.innerHTML = `<b>WASD</b>로 움직여 공이 <b>노란 점선 원</b> 위에 오게 하고<br>공이 오른쪽이면 <b>우클릭</b>, 왼쪽이면 <b>좌클릭</b>! 방향은 <b>커서</b>로`;
    hud.appendChild(tip);
    setTimeout(() => tip.remove(), 4600);
    settings.seenTutorial = true;
    saveSettings(settings);
  }
}

function backToMenu() {
  game?.dispose();
  game = null;
  hud.classList.add('hidden');
  if (!backdrop) {
    backdrop = createCourtMesh(buildCourt('easy'));
    scene.add(backdrop);
  }
  showMain();
}

function showMain() {
  screens.main({
    solo: () => screens.difficulty({ pick: startSolo, back: showMain }),
    ai: () => screens.difficulty({ pick: startMatch, back: showMain }, 'AI 대전'),
    online: showOnline,
    howto: () => screens.howto({ back: showMain }),
    settings: () => screens.settings(settings, { back: showMain, changed: syncSpeedUi }),
  });
}

function pause() {
  if (!game || game.paused) return;
  if (mode === 'online') return showLeaveOnline(); // 온라인은 멈출 수 없음
  game.paused = true;
  sfx.play('ui_pause');
  showPause();
}
function showPause() {
  screens.pause({
    resume: () => {
      screens.hide();
      if (game) game.paused = false;
    },
    settings: () => screens.settings(settings, { back: showPause, changed: syncSpeedUi }),
    quit: () => {
      if (mode !== 'solo') return backToMenu();
      const s = game!.session;
      screens.results(s, { retry: () => startSolo(difficulty), menu: backToMenu });
    },
  });
}
document.getElementById('pauseBtn')!.addEventListener('click', pause);

// ── 친구와 대전 (온라인) ──
let net: OnlineSession | null = null;
let rematch = { me: false, them: false };

function closeNet() {
  net?.leave();
  net = null;
}

function wireNet(n: OnlineSession, d: Difficulty) {
  net = n;
  n.on((msg: NetMsg) => {
    if (msg.t === 'start') {
      if (n.role === 'guest') beginOnline(msg.difficulty);
      return;
    }
    if (msg.t === 'rematch') {
      rematch.them = true;
      maybeRematch(d);
      return;
    }
    if (msg.t === 'hello') return;
    if (mode === 'online') game?.receive(msg);
  });
  n.onClose = (reason) => {
    net = null;
    const wasPlaying = !!game && mode === 'online';
    if (wasPlaying) {
      game?.dispose();
      game = null;
      hud.classList.add('hidden');
      ensureBackdrop();
    }
    screens.message('대전 종료', reason, { ok: showMain });
  };
}

function beginOnline(d: Difficulty) {
  rematch = { me: false, them: false };
  difficulty = d;
  startGame('online', d, net);
}

function maybeRematch(d: Difficulty) {
  if (!net || !rematch.me || !rematch.them) return;
  if (net.role === 'host') {
    net.send({ t: 'start', difficulty: difficulty });
    beginOnline(difficulty);
  }
  void d;
}

function requestRematch() {
  if (!net) return showMain();
  rematch.me = true;
  net.send({ t: 'rematch' });
  screens.onlineRematchWait({ menu: leaveOnline });
  maybeRematch(difficulty);
}

function leaveOnline() {
  closeNet();
  backToMenu();
}

function showLeaveOnline() {
  screens.leaveOnline({
    stay: () => screens.hide(),
    settings: () => screens.settings(settings, { back: showLeaveOnline, changed: syncSpeedUi }),
    leave: leaveOnline,
  });
}

function ensureBackdrop() {
  if (!backdrop) {
    backdrop = createCourtMesh(buildCourt('easy'));
    scene.add(backdrop);
  }
}

function showOnline() {
  screens.online({
    back: showMain,
    create: async (d) => {
      screens.onlineConnecting('…', { cancel: () => (closeNet(), showOnline()) });
      try {
        const n = await OnlineSession.host();
        wireNet(n, d);
        screens.onlineWaiting(n.code, roomLink(n.code), d, { cancel: () => (closeNet(), showOnline()) });
        n.onOpen = () => {
          n.send({ t: 'start', difficulty: d });
          beginOnline(d);
        };
        n.onStatus = (st) => screens.setWaitingStatus(st);
      } catch {
        screens.message('방을 만들지 못했어요', '네트워크를 확인하고 다시 시도해 주세요', { ok: showOnline });
      }
    },
    join: (raw) => joinRoom(raw),
  });
}

async function joinRoom(raw: string) {
  const code = normalizeCode(raw);
  if (code.length !== 6) {
    screens.message('코드를 확인해 주세요', '친구에게 받은 6자리 코드를 입력해요', { ok: showOnline });
    return;
  }
  let cancelled = false;
  screens.onlineConnecting(code, { cancel: () => ((cancelled = true), closeNet(), showMain()) });
  try {
    const n = await OnlineSession.join(code, (attempt) => screens.setConnectingAttempt(attempt));
    if (cancelled) return n.leave();
    wireNet(n, 'normal'); // 난이도는 호스트의 start 메시지로 정해짐
  } catch (e) {
    net = null;
    if (cancelled) return;
    const kind = e instanceof JoinError ? e.kind : 'server';
    const detail = e instanceof Error ? e.message : String(e);
    const MSG = {
      'not-found': [
        '방을 찾지 못했어요',
        `코드 <b>${code}</b>가 맞는지 확인해 주세요.<br>방장 화면이 <b>'친구를 기다리는 중'</b>에 떠 있어야 해요.<br>방장이 휴대폰이면 링크를 보낸 뒤 <b>게임 화면으로 돌아와</b> 있어야 해요.`,
      ],
      blocked: [
        '방은 찾았지만 연결이 막혔어요',
        '두 사람 중 한쪽 네트워크(일부 모바일 데이터, 회사·학교 와이파이)가 직접 연결을 막고 있어요.<br>둘 다 <b>집 와이파이</b>로 바꿔서 다시 시도해 보세요.',
      ],
      server: ['연결 서버에 접속하지 못했어요', '인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.'],
    }[kind];
    screens.message(MSG[0], `${MSG[1]}<br><small style="opacity:.5">(${detail})</small>`, { ok: showOnline });
  }
}

// ── 입력: 우클릭 = 포핸드, 좌클릭 = 백핸드, 커서 = 방향 ──
const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
function updateAim(e: { clientX: number; clientY: number }) {
  if (!game) return;
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, game.rig.camera);
  game.aimPoint = raycaster.ray.intersectPlane(floorPlane, hitPoint) ? { x: hitPoint.x, z: hitPoint.z } : null;
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove', updateAim);
const mouseHeld = { l: 0, r: 0 }; // 마지막으로 누른 시각 (짧은 클릭도 잠깐 보이게)
const mouseDown = { l: false, r: false };
window.addEventListener('pointerup', (e) => {
  if (e.button === 0) mouseDown.l = false;
  if (e.button === 2) mouseDown.r = false;
});
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (e.pointerType === 'mouse') {
    if (e.button === 0) (mouseDown.l = true), (mouseHeld.l = performance.now());
    if (e.button === 2) (mouseDown.r = true), (mouseHeld.r = performance.now());
  }
  if (!game || (e.button !== 0 && e.button !== 2) || e.pointerType === 'touch') return;
  updateAim(e);
  game.swing({ hand: e.button === 2 ? 'fore' : 'back', aim: game.aimPoint });
});

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game && !game.paused) pause();
    else if (game?.paused && screens.visible) {
      screens.hide();
      game.paused = false;
    }
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  if (game && !game.paused && mode !== 'online') pause();
});

// ── 디버그 패널 (` 키) — 처음 누를 때만 불러온다 (일반 플레이어 로딩에 포함되지 않게) ──
let debugLoading = false;
window.addEventListener('keydown', async (e) => {
  if (e.key !== '`' || debugLoading) return;
  debugLoading = true;
  const [{ createDebugPanel }, { launchPresets }] = await Promise.all([import('./debug/panel'), import('./debug/presets')]);
  createDebugPanel({
  onCourtChange: () => {
    game?.rebuildCourt();
    resize();
  },
  onCameraChange: resize,
  onLaunch: () => {
    if (!game) return;
    const L = tuning.debug.launcher;
    const p = game.playerPos;
    const el = (L.elevationDeg * Math.PI) / 180;
    const az = (L.aimDeg * Math.PI) / 180;
    const v = { x: L.speed * Math.cos(el) * Math.sin(az), y: L.speed * Math.sin(el), z: -L.speed * Math.cos(el) * Math.cos(az) };
    game.world.launch({ x: p.x + 0.35, y: L.y, z: p.z - 0.3 }, v, 'A', L.serve);
  },
  presets: () =>
    launchPresets(game?.world.court ?? buildCourt('easy')).map((p, i) => ({
      label: `${p.label} → ${p.expect}`,
      run: () => {
        if (!game) return;
        const q = launchPresets(game.world.court)[i];
        game.setPlayerPos(q.from.x - 0.35, q.from.z + 0.3);
        game.world.launch(q.from, q.vel, 'A', q.serve);
      },
    })),
  }).show();
});

// ── 조작 시각화 갱신 ──
const keyEls = [...document.querySelectorAll<HTMLElement>('#ctlKeys .kc')];
const KEYMAP: Record<string, string[]> = { w: ['KeyW', 'ArrowUp'], a: ['KeyA', 'ArrowLeft'], s: ['KeyS', 'ArrowDown'], d: ['KeyD', 'ArrowRight'] };
const mL = document.getElementById('mL')!;
const mR = document.getElementById('mR')!;
const mouseEl = document.getElementById('ctlMouse')!;
function updateControlHud(now: number) {
  for (const el of keyEls) el.classList.toggle('on', KEYMAP[el.dataset.k!].some((c) => keys.has(c)));
  const lOn = mouseDown.l || now - mouseHeld.l < 180;
  const rOn = mouseDown.r || now - mouseHeld.r < 180;
  mL.classList.toggle('on', lOn);
  mR.classList.toggle('on', rOn);
  mouseEl.classList.toggle('l-on', lOn);
  mouseEl.classList.toggle('r-on', rOn);
  // 공이 타격 범위에 들어오면 칠 버튼 테두리를 반짝여 알려줌
  const hint = game?.liveHand ?? null;
  mL.classList.toggle('hint', hint === 'back');
  mR.classList.toggle('hint', hint === 'fore');
}

// ── 루프 ──
const stats = { fps: 0, frames: 0 };
Object.assign(window as object, { __stats: stats, __game: () => game, __startSolo: startSolo, __startMatch: startMatch, __tuning: tuning, __sfx: sfx, __net: () => net });
let fpsAcc = 0;
let fpsFrames = 0;
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game) {
    const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const mz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    const mob = isMobile();
    game.moveInput.x = mob ? touch.move.x : mx;
    game.moveInput.z = mob ? touch.move.z : mz;
    if (mob) {
      const p = game.playerPos;
      game.aimPoint = Math.abs(touch.move.x) > 0.2 ? { x: p.x + touch.move.x * 2.2, z: p.z - 2 } : null;
      touch.hint(game.liveHand);
    }
    touch.setVisible(mob && !game.paused && !screens.visible);
    game.update(dt);
    const s = game.session;
    comboEl.textContent = String(s.combo);
    comboSub.textContent = `최고 ${s.best} · PERFECT ${s.perfects}`;
    updateControlHud(now);
    netBadge.classList.toggle('hidden', mode !== 'online' || !net);
    if (mode === 'online' && net) {
      const ping = net.pingMs;
      netBadge.textContent = `온라인 · 핑 ${ping}ms ${ping < 80 ? '●' : ping < 160 ? '◐' : '○'}`;
    }
    serveTip.classList.toggle('hidden', !(game.match && game.matchPhase === 'serveWait' && game.match.server === 'A'));
    sideEl.textContent = game.ballSide === 'fore' ? '포핸드 (우클릭)' : game.ballSide === 'back' ? '백핸드 (좌클릭)' : '';
    renderer.render(scene, game.rig.camera);
  } else {
    (backdrop?.userData.arena as { tick: (t: number) => void } | undefined)?.tick(now / 1000);
    renderer.render(scene, backdropRig.camera);
  }
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) banner.classList.remove('show');

  fpsAcc += dt;
  fpsFrames++;
  stats.frames++;
  if (fpsAcc >= 0.5) {
    stats.fps = fpsFrames / fpsAcc;
    fpsEl.textContent = `${stats.fps.toFixed(0)} fps`;
    fpsAcc = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}

resize();
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  // 초대 링크로 들어옴: 주소창에서 코드를 지우고 바로 참가
  history.replaceState(null, '', location.pathname);
  screens.title({ start: () => joinRoom(roomParam) });
} else screens.title({ start: showMain });
requestAnimationFrame(frame);
// 첫 프레임이 그려지고 폰트가 준비되면 로딩 화면을 걷는다
void document.fonts.ready.then(() =>
  requestAnimationFrame(() => {
    if (!boot) return;
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 450);
  }),
);
