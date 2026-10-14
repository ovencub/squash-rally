import * as THREE from 'three';
import { sfx, type SfxName } from '../audio/sfx';
import { tPosition } from '../config/court';
import { tuning, type Difficulty } from '../config/tuning';
import { FixedLoop } from '../core/loop';
import { Rng } from '../core/rng';
import { type BallContact, type BallState, type Surface, type Vec3 } from '../physics/ball';
import { predict, type Prediction } from '../physics/predict';
import { awardRally, newMatch, type MatchState } from '../rules/par';
import { type PlayerId, type RallyResult } from '../rules/rally';
import { type Arena } from '../render/arena';
import { BallView } from '../render/ball-view';
import { CameraRig } from '../render/camera';
import { animateCharacter, createCharacter, SWING_CONTACT, type Character } from '../render/character';
import { createCourtMesh } from '../render/court-mesh';
import { DebugDraw } from '../render/debug-draw';
import { AimGuide, BallTrail, ImpactFx, Shake, SwingTrail, TimingGuide, WallMarks } from '../render/fx';
import { palette } from '../render/palette';
import { ScoreWall } from '../render/score-wall';
import { AiBrain } from './ai';
import { createMover, moveStep, standSpotFor, type Mover } from './player';
import { planServe, receiverSpot, serveBallFrom, serverSpot } from './serve';
import { type Settings } from './settings';
import { SoloSession } from './solo';
import {
  aimWallX,
  distanceScore,
  gradeOf,
  handFor,
  hitWindow,
  horiz,
  idealBallPoint,
  idealHitTime,
  inReach,
  planDrive,
  sweetRadius,
  timingScore,
  type Grade,
  type Hand,
  type SwingInput,
} from './swing';
import { World } from './world';

export type Mode = 'solo' | 'match';

export interface HitEvent {
  by: PlayerId;
  grade: Grade;
  /** 거리 × 타이밍 배점 0..1 */
  score: number;
  /** 약한 쪽 요인 힌트 (PERFECT면 null) */
  hint: string | null;
  at: Vec3;
  speed: number;
  hand: Hand;
  newBest: boolean;
}

export type WhiffReason = 'wrongHand' | 'outOfRange' | 'noBall' | 'notYourTurn';

export interface MatchStats {
  hits: number;
  perfects: number;
  longestRally: number;
}

export interface GameHooks {
  onHit: (e: HitEvent) => void;
  onRallyEnd: (r: RallyResult) => void;
  onWhiff: (reason: WhiffReason, hand: Hand) => void;
  /** AI 대전: 점수 반영 후 */
  onPoint?: (r: RallyResult, m: MatchState) => void;
  /** AI 대전: 서브 준비 (server가 A면 클릭으로 서브) */
  onServeReady?: (m: MatchState) => void;
  onMatchEnd?: (m: MatchState, stats: MatchStats) => void;
}

const BOUNCE_SFX: Record<Surface, SfxName> = {
  front: 'bounce_front',
  tin: 'tin',
  left: 'bounce_side',
  right: 'bounce_side',
  back: 'bounce_glass',
  floor: 'bounce_floor',
};

const SWING_SECONDS = 0.34;

/** 코트 위 선수 하나 (사람 A 또는 AI B) */
interface Athlete {
  id: PlayerId;
  mover: Mover;
  ch: Character;
  swingAnim: number | null;
  swingHand: Hand;
  swingCooldown: number;
  /** AI 이동 목표 */
  target: { x: number; z: number } | null;
  /** 발소리용 누적 이동 거리 */
  stepAcc: number;
}

/**
 * 게임 진행. 1인 모드(무한 콤보)와 AI 대전(PAR 11점, 3전 2선승).
 * 시뮬레이션(World + 이동 + 공)은 고정 타임스텝에서, 렌더/FX/AI 판단은 프레임마다.
 * 조작(M3 피드백): WASD 수동 이동만, 우클릭 = 포핸드 / 좌클릭 = 백핸드, 커서 위치 = 방향.
 */
export class Game {
  readonly scene: THREE.Scene;
  readonly rig = new CameraRig();
  readonly world: World;
  readonly loop: FixedLoop;
  session: SoloSession;
  match: MatchState | null = null;
  matchPhase: 'serveWait' | 'rally' | 'pointEnd' | 'over' = 'serveWait';
  readonly matchStats: MatchStats = { hits: 0, perfects: 0, longestRally: 0 };
  paused = false;

  private courtMesh: THREE.Group;
  private A: Athlete;
  private B: Athlete | null = null;
  private ai: AiBrain | null = null;
  private scoreWall: ScoreWall | null = null;
  private ballView = new BallView();
  private ballTrail = new BallTrail();
  private swingTrail = new SwingTrail();
  private impact = new ImpactFx();
  private guide = new TimingGuide();
  private aimGuide = new AimGuide();
  private wallMarks = new WallMarks();
  private shake = new Shake();
  readonly debugDraw = new DebugDraw();
  private rng = new Rng(tuning.game.seed);

  /** 키보드 이동 입력 (매 서브스텝 읽음) */
  moveInput = { x: 0, z: 0 };
  /** 커서가 가리키는 바닥 지점 (main에서 갱신) */
  aimPoint: { x: number; z: number } | null = null;
  /** 디버그: 스윙 자세 고정 (진행도) */
  holdSwing: number | null = null;
  private feedTimer = 0;
  private phaseTimer = 0;
  private slowmoTimer = 0;
  private rallyHits = 0;
  private pred: Prediction | null = null;
  private ring: { t: number; point: Vec3 } | null = null;
  /** 앞벽에서 돌아오는 공이 지나온 궤적 (타이밍 판정용) */
  private trace: (Vec3 & { t: number })[] = [];
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  /** 공이 지금 어느 손 쪽인지 (HUD 표시용) */
  ballSide: Hand | null = null;

  constructor(
    scene: THREE.Scene,
    readonly difficulty: Difficulty,
    private settings: Settings,
    private hooks: GameHooks,
    readonly mode: Mode = 'solo',
  ) {
    this.scene = scene;
    this.world = new World(difficulty, mode === 'solo' ? 1 : 2);
    this.loop = new FixedLoop((dt) => this.simStep(dt));
    this.session = new SoloSession(difficulty);
    this.courtMesh = createCourtMesh(this.world.court);
    const t = tPosition(this.world.court);
    this.A = this.makeAthlete('A', palette.playerShirt, palette.accent, t.x, t.z + 0.6);
    if (mode === 'match') {
      this.B = this.makeAthlete('B', palette.aiShirt, 0xffffff, t.x - 1, t.z);
      this.ai = new AiBrain(difficulty, this.rng);
      this.scoreWall = new ScoreWall(this.world.court);
      this.match = newMatch('A');
    }
    scene.add(...this.objects());

    this.world.bus.on('contact', (ct) => this.onContact(ct));
    this.world.bus.on('rallyEnd', (r) => this.onRallyEnd(r));
    this.world.bus.on('launch', () => (this.trace = []));
    this.world.bus.on('feed', () => (this.trace = []));
    if (mode === 'solo') this.feedTimer = 0.8;
    else this.setupServe();
  }

  private makeAthlete(id: PlayerId, shirt: number, trim: number, x: number, z: number): Athlete {
    return { id, mover: createMover(x, z), ch: createCharacter(shirt, trim), swingAnim: null, swingHand: 'fore', swingCooldown: 0, target: null, stepAcc: 0 };
  }

  private objects(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [
      this.courtMesh,
      this.A.ch.root,
      this.ballView.group,
      this.ballTrail.group,
      this.swingTrail.mesh,
      this.impact.group,
      this.guide.group,
      this.aimGuide.group,
      this.wallMarks.group,
      this.debugDraw.group,
    ];
    if (this.B) list.push(this.B.ch.root);
    if (this.scoreWall) list.push(this.scoreWall.mesh);
    return list;
  }

  private get arena(): Arena {
    return this.courtMesh.userData.arena as Arena;
  }

  dispose(): void {
    this.scene.remove(...this.objects());
  }

  resize(aspect: number): void {
    this.rig.fit(this.world.court, aspect);
  }

  /** 디버그 패널에서 코트 배율을 바꿨을 때 */
  rebuildCourt(): void {
    this.scene.remove(this.courtMesh);
    this.world.setDifficulty(this.difficulty);
    this.courtMesh = createCourtMesh(this.world.court);
    this.scene.add(this.courtMesh);
    if (this.mode === 'solo') this.feedTimer = 0.5;
    else this.setupServe();
  }

  get playerPos(): { x: number; z: number } {
    return { x: this.A.mover.x, z: this.A.mover.z };
  }

  get aiPos(): { x: number; z: number } | null {
    return this.B ? { x: this.B.mover.x, z: this.B.mover.z } : null;
  }

  setPlayerPos(x: number, z: number): void {
    this.A.mover.x = x;
    this.A.mover.z = z;
  }

  // ── 입력: 클릭 스윙 (사람 A) ──

  swing(input: SwingInput): void {
    const a = this.A;
    if (this.paused || a.swingCooldown > 0) return;
    if (this.match && this.matchPhase === 'serveWait') {
      if (this.match.server === 'A') this.serve(a);
      return;
    }
    const w = this.world;
    const b = w.ball;
    a.swingHand = input.hand;
    if (!b || w.rally.phase !== 'returning') return this.whiff('noBall', input.hand);
    if (this.mode === 'match' && w.rally.lastHitter === 'A') return this.whiff('notYourTurn', input.hand);
    if (!inReach(b.pos, this.playerPos)) return this.whiff('outOfRange', input.hand);
    // 포핸드는 공이 오른쪽 절반, 백핸드는 왼쪽 절반일 때만
    if (handFor(b.pos, this.playerPos) !== input.hand) return this.whiff('wrongHand', input.hand);
    this.executeHit(a, input, this.errMsFor(a));
  }

  private whiff(reason: WhiffReason, hand: Hand): void {
    this.A.swingAnim = 0;
    this.A.swingCooldown = tuning.input.whiffCooldownMs / 1000;
    this.hooks.onWhiff(reason, hand);
  }

  /** 지금 휘두르면 이상적 순간 대비 몇 ms 빠른지/늦은지 */
  private errMsFor(who: Athlete): number {
    const w = this.world;
    const b = w.ball!;
    const pred = predict(b, w.court, 2.5, 1);
    const win = hitWindow(pred, b.time, true, w.rally.floorBounces);
    const ideal = win ? this.idealFor(pred, win, who) : null;
    return ideal ? (b.time - ideal.t) * 1000 : 0;
  }

  /** 지나온 궤적 + 예측 궤적에서 선수 위치 기준 이상적 타격 순간 */
  private idealFor(pred: Prediction, win: { from: number; until: number }, who: Athlete) {
    const from = this.trace.length ? this.trace[0].t : win.from;
    return idealHitTime([...this.trace, ...pred.points], { from, until: win.until }, { x: who.mover.x, z: who.mover.z });
  }

  private executeHit(who: Athlete, input: SwingInput, errMs: number): void {
    const w = this.world;
    const b = w.ball!;
    const pos = { x: who.mover.x, z: who.mover.z };
    const dist = horiz(b.pos, pos);
    const ds = distanceScore(dist) ?? 0;
    const ts = timingScore(errMs);
    const score = ds * ts;
    const grade = gradeOf(score);
    let hint: string | null = null;
    if (grade !== 'perfect') {
      if (ts < ds) hint = errMs < 0 ? '조금 빨라요' : '조금 늦어요';
      else hint = dist < sweetRadius() ? '너무 가까워요' : '너무 멀어요';
    }

    const from = { ...b.pos };
    const wallX = aimWallX(pos, input.aim, w.court);
    const plan = planDrive(from, score, wallX, w.court);
    w.launch(from, plan.vel, who.id, false);
    this.rallyHits++;
    who.swingHand = input.hand;
    who.swingAnim = SWING_CONTACT;
    who.swingCooldown = tuning.input.swingCooldownMs / 1000;

    let newBest = false;
    const human = who.id === 'A';
    if (human) {
      if (this.mode === 'solo') newBest = this.session.onHit(grade);
      else {
        this.matchStats.hits++;
        if (grade === 'perfect') this.matchStats.perfects++;
      }
      this.ai?.onOpponentHit();
    } else this.ai?.reset();

    // 타격감: 히트스톱(캐릭터까지 멈춤) + 진동 + 섬광 + 소리. AI가 칠 때는 약하게.
    const F = tuning.fx;
    const strength = 0.25 + 0.75 * score;
    const stop = grade === 'perfect' ? F.hitstopMs.perfect : grade === 'good' ? F.hitstopMs.good : F.hitstopMs.off;
    this.loop.hitstop(human ? stop : tuning.ai.hitstopMs);
    const amp = this.settings.shake === 'off' ? 0 : this.settings.shake === 'weak' ? F.shake.weak : F.shake.normal;
    this.shake.kick(amp * strength * (human ? 1 : tuning.ai.shakeRatio));
    this.impact.burst(from, human ? strength : strength * 0.6);
    if (human) this.swingTrail.setWidth(0.6 + 0.4 * strength);
    sfx.play(grade === 'perfect' ? 'hit_perfect' : grade === 'good' ? 'hit_hard' : 'hit_soft', (0.55 + 0.45 * strength) * (human ? 1 : 0.8));
    if (newBest && this.session.combo > 1) sfx.play('combo_up', 0.6);
    if (human && grade === 'perfect') this.arena.cheer(0.12);
    this.hooks.onHit({ by: who.id, grade, score, hint, at: from, speed: plan.speed, hand: input.hand, newBest });
  }

  // ── AI 대전: 서브 ──

  private setupServe(): void {
    const m = this.match!;
    const c = this.world.court;
    const server = m.server === 'A' ? this.A : this.B!;
    const receiver = m.server === 'A' ? this.B! : this.A;
    const sp = serverSpot(m.serveSide, c);
    const rp = receiverSpot(m.serveSide, c);
    Object.assign(server.mover, { x: sp.x, z: sp.z, vx: 0, vz: 0 });
    Object.assign(receiver.mover, { x: rp.x, z: rp.z, vx: 0, vz: 0 });
    this.world.clearBall();
    this.ai?.reset();
    this.rallyHits = 0;
    this.matchPhase = 'serveWait';
    this.phaseTimer = m.server === 'B' ? tuning.ai.serveDelayMs / 1000 : 0;
    this.scoreWall?.set(m.points.A, m.points.B);
    this.debugDraw.clearActual();
    this.hooks.onServeReady?.(m);
  }

  private serve(who: Athlete): void {
    const m = this.match!;
    const c = this.world.court;
    const from = serveBallFrom({ x: who.mover.x, z: who.mover.z });
    const variety = who.id === 'B' ? this.rng.range(-1, 1) : 0;
    const vel = planServe(from, m.serveSide, c, variety);
    this.world.launch(from, vel, who.id, true, m.serveSide);
    this.matchPhase = 'rally';
    this.rallyHits = 1;
    who.swingHand = 'fore';
    who.swingAnim = SWING_CONTACT;
    who.swingCooldown = tuning.input.swingCooldownMs / 1000;
    this.impact.burst(from, 0.4);
    sfx.play('hit_hard', 0.7);
    if (who.id === 'A') this.ai?.onOpponentHit();
  }

  /** 서브 대기 중 서버 손에 들린 공 (표시용) */
  private serveBall(): BallState | null {
    if (!this.match || this.matchPhase !== 'serveWait') return null;
    const s = this.match.server === 'A' ? this.A : this.B!;
    const from = serveBallFrom({ x: s.mover.x, z: s.mover.z });
    return { pos: from, vel: { x: 0, y: 0, z: 0 }, rolling: false, time: 0 };
  }

  // ── 시뮬레이션 (고정 타임스텝) ──

  private simStep(dt: number): void {
    const w = this.world;
    // 이동은 실제 시간 기준 (난이도 게임 속도 배율의 영향을 받지 않음)
    const realDt = dt / tuning.court.gameSpeed[this.difficulty];
    const locked = this.match !== null && this.matchPhase === 'serveWait';

    // 사람: WASD 수동만. 디버그 봇일 때만 타점 옆 자리로 자동 이동
    const hasInput = !locked && (this.moveInput.x !== 0 || this.moveInput.z !== 0);
    const target = !locked && !hasInput && tuning.debug.autoplay && this.ring ? standSpotFor(this.ring.point, this.playerPos, w.court) : null;
    const ratio = this.settings.moveSpeed / tuning.player.maxSpeed;
    if (moveStep(this.A.mover, realDt, w.court, hasInput ? this.moveInput : null, target, ratio)) sfx.play('squeak', 0.7);
    this.footsteps(this.A, realDt, 1);

    // AI: 기본 이동 속도 × 난이도 비율 (사람과 같은 이동 모델)
    if (this.B) {
      const t = locked ? null : this.B.target;
      if (moveStep(this.B.mover, realDt, w.court, null, t, tuning.ai.level[this.difficulty].speedRatio)) sfx.play('squeak', 0.4);
      this.footsteps(this.B, realDt, 0.5);
      this.separate();
    }

    w.step(dt);
    if (w.ball && w.rally.phase === 'returning') this.trace.push({ ...w.ball.pos, t: w.ball.time });
  }

  /** 이동 거리에 따라 나무 바닥 발소리 (빠를수록 크게) */
  private footsteps(a: Athlete, dt: number, vol: number): void {
    const speed = Math.hypot(a.mover.vx, a.mover.vz);
    if (speed < 0.8) {
      a.stepAcc = tuning.audio.stepStride * 0.7; // 출발 첫 걸음은 빨리
      return;
    }
    a.stepAcc += speed * dt;
    if (a.stepAcc >= tuning.audio.stepStride) {
      a.stepAcc = 0;
      sfx.play('step', vol * Math.min(1, 0.3 + speed / 8));
    }
  }

  /** 두 선수가 겹치지 않게 AI 쪽을 밀어낸다 */
  private separate(): void {
    const a = this.A.mover;
    const b = this.B!.mover;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    const min = tuning.match.minSeparation;
    if (d >= min) return;
    const nx = d > 1e-4 ? dx / d : 1;
    const nz = d > 1e-4 ? dz / d : 0;
    b.x = a.x + nx * min;
    b.z = a.z + nz * min;
    const c = this.world.court;
    const r = tuning.player.radius;
    b.x = Math.max(-c.width / 2 + r, Math.min(c.width / 2 - r, b.x));
    b.z = Math.max(r + 0.5, Math.min(c.length - r, b.z));
  }

  private onContact(ct: BallContact): void {
    if (ct.rolling) return;
    const v = sfx.speedVol(ct.normalSpeed);
    sfx.play(BOUNCE_SFX[ct.surface], ct.surface === 'tin' ? 1 : v);
    if (ct.surface === 'front' || ct.surface === 'tin') this.wallMarks.add(ct.point);
    this.debugDraw.addActual(ct, tuning.debug.showContacts);
  }

  private onRallyEnd(r: RallyResult): void {
    this.slowmoTimer = tuning.fx.slowmoMs / 1000;
    this.debugDraw.markResult(r.contact);
    if (this.mode === 'solo') {
      this.session.onMiss();
      this.feedTimer = tuning.solo.feedDelayMs / 1000;
      sfx.play('point_lose', 0.7);
      this.hooks.onRallyEnd(r);
      return;
    }
    this.ai?.reset();
    this.matchStats.longestRally = Math.max(this.matchStats.longestRally, this.rallyHits);
    const m = (this.match = awardRally(this.match!, r.winner));
    this.scoreWall?.set(m.points.A, m.points.B);
    if (m.winner) sfx.play(m.winner === 'A' ? 'match_win' : 'match_lose', 0.8);
    else if (m.gameJustWon) sfx.play(m.gameJustWon === 'A' ? 'game_win' : 'match_lose', 0.7);
    else sfx.play(r.winner === 'A' ? 'point_win' : 'point_lose', 0.7);
    if (m.gameJustWon && !m.winner) {
      const last = m.history[m.history.length - 1];
      this.scoreWall?.set(last.A, last.B);
    }
    this.arena.cheer(m.gameJustWon ? 1 : r.winner === 'A' ? 0.7 : 0.35);
    this.matchPhase = m.winner ? 'over' : 'pointEnd';
    this.phaseTimer = (m.gameJustWon ? tuning.match.gamePauseMs : tuning.match.pointPauseMs) / 1000;
    this.hooks.onRallyEnd(r);
    this.hooks.onPoint?.(r, m);
  }

  /** 앞벽 근처에서 플레이어 쪽으로 공을 보낸다 (1인 모드) */
  private feed(): void {
    const c = this.world.court;
    const T = tuning.solo.feedFlightTime;
    const from = { x: this.rng.range(-c.width / 4, c.width / 4), y: 1.2, z: 0.4 };
    const to = { x: this.rng.range(-c.width / 4, c.width / 4), z: c.shortLineZ + this.rng.range(-0.3, 1.2) };
    const g = tuning.physics.gravity;
    const vel = { x: (to.x - from.x) / T, y: (0.02 - from.y + 0.5 * g * T * T) / T, z: (to.z - from.z) / T };
    this.debugDraw.clearActual();
    this.world.feed(from, vel, 'A');
  }

  /** 내(A) 차례인가: 1인 모드는 항상, 대전은 AI가 마지막으로 쳤을 때 */
  private myTurn(): boolean {
    return this.mode === 'solo' || this.world.rally.lastHitter === 'B';
  }

  /** 디버그 봇: 이상적인 타격 시각(+설정 오차)에 맞는 손으로 클릭, 서브도 대신 */
  private autoSwing(): void {
    const w = this.world;
    const b = w.ball;
    if (this.match && this.matchPhase === 'serveWait' && this.match.server === 'A') {
      this.swing({ hand: 'fore', aim: null });
      return;
    }
    if (!b || !this.pred || w.rally.phase !== 'returning' || this.A.swingCooldown > 0 || !this.myTurn()) return;
    const win = hitWindow(this.pred, b.time, true, w.rally.floorBounces);
    const ideal = win ? this.idealFor(this.pred, win, this.A) : null;
    if (!ideal) return;
    const at = ideal.t + tuning.debug.autoplayErrorMs / 1000;
    if (b.time >= at - 1 / 120 && inReach(b.pos, this.playerPos)) {
      this.swing({ hand: handFor(b.pos, this.playerPos), aim: this.aimPoint });
    }
  }

  // ── 프레임 업데이트 ──

  update(realDt: number): void {
    const frozen = this.loop.inHitstop;
    if (!this.paused) {
      if (this.slowmoTimer > 0) {
        this.slowmoTimer -= realDt;
        this.loop.timeScale = tuning.fx.slowmoOnMiss;
      } else this.loop.timeScale = tuning.debug.timeScale * tuning.court.gameSpeed[this.difficulty];
      for (const a of [this.A, this.B]) if (a) a.swingCooldown = Math.max(0, a.swingCooldown - realDt);

      if (this.mode === 'solo') {
        if (this.feedTimer > 0 && (this.feedTimer -= realDt) <= 0) this.feed();
      } else this.updateMatchFlow(realDt);
      this.loop.advance(realDt);
    }
    const w = this.world;
    const b = w.ball;

    // 예측 + 타이밍 링 (내 차례일 때만)
    this.pred = null;
    this.ring = null;
    if (b && (w.rally.phase === 'returning' || w.rally.phase === 'toFront')) {
      this.pred = predict(b, w.court, 3, 2);
      const win = hitWindow(this.pred, b.time, w.rally.phase === 'returning', w.rally.floorBounces);
      if (win && this.myTurn()) this.ring = idealBallPoint(this.pred, win);
    }
    const ringGood = this.ring
      ? (() => {
          const s = standSpotFor(this.ring.point, this.playerPos, w.court);
          return Math.hypot(s.x - this.A.mover.x, s.z - this.A.mover.z) < 0.4;
        })()
      : false;
    const showRing = this.ring && w.rally.phase === 'returning' ? this.ring : null;
    this.ballSide = showRing ? handFor(showRing.point, this.playerPos) : null;
    const liveHand = b && this.myTurn() && w.rally.phase === 'returning' && inReach(b.pos, this.playerPos) ? handFor(b.pos, this.playerPos) : null;
    this.guide.update(showRing?.point ?? null, showRing ? showRing.t - b!.time : 0, ringGood, this.playerPos, liveHand);
    this.aimGuide.update(this.playerPos, aimWallX(this.playerPos, this.aimPoint, w.court), !this.paused && !!this.aimPoint);

    // AI 판단 (프레임마다)
    if (this.B && this.ai && !this.paused && this.matchPhase === 'rally') {
      const d = this.ai.update(realDt, { ball: b, pred: this.pred, rally: w.rally, me: this.aiPos!, opponent: this.playerPos, court: w.court });
      this.B.target = d.target;
      if (d.swing && this.B.swingCooldown <= 0 && b && w.rally.phase === 'returning' && w.rally.lastHitter === 'A') {
        this.executeHit(this.B, d.swing, this.errMsFor(this.B));
      }
    }
    if (tuning.debug.autoplay && !this.paused) this.autoSwing();

    this.debugDraw.setPrediction(tuning.debug.showPrediction ? this.pred : null, { line: true, contacts: tuning.debug.showContacts });

    // 캐릭터 (히트스톱 중엔 임팩트 자세로 멈춤)
    for (const a of [this.A, this.B]) {
      if (!a) continue;
      if (a === this.A && this.holdSwing !== null) a.swingAnim = this.holdSwing;
      else if (a.swingAnim !== null && !frozen && !this.paused) {
        a.swingAnim += realDt / SWING_SECONDS;
        if (a.swingAnim >= 1) a.swingAnim = null;
      }
      a.ch.root.position.x = a.mover.x;
      a.ch.root.position.z = a.mover.z;
      animateCharacter(a.ch, this.paused ? 0 : realDt, {
        vx: a.mover.vx,
        vz: a.mover.vz,
        maxSpeed: a === this.A ? this.settings.moveSpeed : tuning.player.maxSpeed,
        swing: a.swingAnim,
        hand: a.swingHand,
        frozen,
      });
    }
    this.A.ch.root.updateMatrixWorld(true);
    if (this.A.swingAnim !== null && !frozen) {
      this.A.ch.hand.getWorldPosition(this.tmpA);
      this.A.ch.racketHead.getWorldPosition(this.tmpB);
      this.swingTrail.push(this.tmpA, this.tmpB);
    }
    this.swingTrail.update(frozen ? 0 : realDt);

    this.arena.tick(performance.now() / 1000);

    // 공 + FX
    const shownBall = b ?? this.serveBall();
    this.ballView.update(shownBall);
    this.ballTrail.update(b ? b.pos : null, b ? Math.hypot(b.vel.x, b.vel.y, b.vel.z) : 0);
    this.impact.update(realDt);
    this.wallMarks.update(realDt);

    // 카메라 (미세 진동 포함)
    const s = this.shake.update(realDt);
    this.rig.setShake(s.x, s.y);
    this.rig.update(realDt, this.playerPos);
    const cu = tuning.debug.closeup;
    if (cu !== 'off') {
      const cam = this.rig.camera;
      const o = { side: [3.2, 1.3, 0], back: [0, 1.6, 3.2], front: [0, 1.4, -3.2] }[cu];
      cam.position.set(this.A.mover.x + o[0], o[1], this.A.mover.z + o[2]);
      cam.lookAt(this.A.mover.x, 0.95, this.A.mover.z);
    }
  }

  private updateMatchFlow(realDt: number): void {
    if (this.matchPhase === 'serveWait') {
      if (this.match!.server === 'B' && (this.phaseTimer -= realDt) <= 0) this.serve(this.B!);
    } else if (this.matchPhase === 'pointEnd') {
      if ((this.phaseTimer -= realDt) <= 0) this.setupServe();
    } else if (this.matchPhase === 'over') {
      if (this.phaseTimer > 0 && (this.phaseTimer -= realDt) <= 0) this.hooks.onMatchEnd?.(this.match!, this.matchStats);
    }
  }

  /** 디버그: 스윙 자세를 보여주기 (t = null이면 해제) */
  debugPose(hand: Hand, t: number | null): void {
    this.A.swingHand = hand;
    this.holdSwing = t;
    if (t === null) this.A.swingAnim = null;
  }
}
