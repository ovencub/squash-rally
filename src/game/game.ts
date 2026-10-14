import * as THREE from 'three';
import { sfx, type SfxName } from '../audio/sfx';
import { tPosition } from '../config/court';
import { tuning, type Difficulty } from '../config/tuning';
import { FixedLoop } from '../core/loop';
import { Rng } from '../core/rng';
import { type BallContact, type Surface, type Vec3 } from '../physics/ball';
import { predict, type Prediction } from '../physics/predict';
import { type RallyResult } from '../rules/rally';
import { BallView } from '../render/ball-view';
import { CameraRig } from '../render/camera';
import { animateCharacter, createCharacter, SWING_CONTACT, type Character } from '../render/character';
import { createCourtMesh } from '../render/court-mesh';
import { DebugDraw } from '../render/debug-draw';
import { AimGuide, BallTrail, ImpactFx, Shake, SwingTrail, TimingGuide, WallMarks } from '../render/fx';
import { palette } from '../render/palette';
import { createMover, moveStep, standSpotFor, type Mover } from './player';
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

export interface HitEvent {
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

export type WhiffReason = 'wrongHand' | 'outOfRange' | 'noBall';

export interface GameHooks {
  onHit: (e: HitEvent) => void;
  onRallyEnd: (r: RallyResult) => void;
  onWhiff: (reason: WhiffReason, hand: Hand) => void;
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

/**
 * 1인 모드 게임 진행. 시뮬레이션(World + 이동 + 공)은 고정 타임스텝에서, 렌더/FX는 프레임마다.
 * 조작(M3 피드백): WASD 수동 이동만, 우클릭 = 포핸드 / 좌클릭 = 백핸드, 커서 위치 = 방향.
 */
export class Game {
  readonly scene: THREE.Scene;
  readonly rig = new CameraRig();
  readonly world: World;
  readonly loop: FixedLoop;
  session: SoloSession;
  paused = false;

  private courtMesh: THREE.Group;
  private player: Character;
  private mover: Mover;
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
  private swingAnim: number | null = null;
  /** 디버그: 스윙 자세 고정 (진행도) */
  holdSwing: number | null = null;
  private swingHand: Hand = 'fore';
  private swingCooldown = 0;
  private feedTimer = 0;
  private slowmoTimer = 0;
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
  ) {
    this.scene = scene;
    this.world = new World(difficulty, 1);
    this.loop = new FixedLoop((dt) => this.simStep(dt));
    this.session = new SoloSession(difficulty);
    this.courtMesh = createCourtMesh(this.world.court);
    this.player = createCharacter(palette.playerShirt);
    const t = tPosition(this.world.court);
    this.mover = createMover(t.x, t.z + 0.6);
    scene.add(...this.objects());

    this.world.bus.on('contact', (ct) => this.onContact(ct));
    this.world.bus.on('rallyEnd', (r) => this.onRallyEnd(r));
    this.world.bus.on('launch', () => (this.trace = []));
    this.world.bus.on('feed', () => (this.trace = []));
    this.feedTimer = 0.8;
  }

  private objects(): THREE.Object3D[] {
    return [
      this.courtMesh,
      this.player.root,
      this.ballView.group,
      this.ballTrail.group,
      this.swingTrail.mesh,
      this.impact.group,
      this.guide.group,
      this.aimGuide.group,
      this.wallMarks.group,
      this.debugDraw.group,
    ];
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
    this.feedTimer = 0.5;
  }

  get playerPos(): { x: number; z: number } {
    return { x: this.mover.x, z: this.mover.z };
  }

  setPlayerPos(x: number, z: number): void {
    this.mover.x = x;
    this.mover.z = z;
  }

  // ── 입력: 클릭 스윙 ──

  swing(input: SwingInput): void {
    if (this.paused || this.swingCooldown > 0) return;
    const w = this.world;
    const b = w.ball;
    this.swingHand = input.hand;

    if (!b || w.rally.phase !== 'returning') return this.whiff('noBall', input.hand);
    if (!inReach(b.pos, this.playerPos)) return this.whiff('outOfRange', input.hand);
    // 포핸드는 공이 오른쪽 절반, 백핸드는 왼쪽 절반일 때만
    if (handFor(b.pos, this.playerPos) !== input.hand) return this.whiff('wrongHand', input.hand);

    const pred = predict(b, w.court, 2.5, 1);
    const win = hitWindow(pred, b.time, true, w.rally.floorBounces);
    const ideal = win ? this.idealFor(pred, win) : null;
    const errMs = ideal ? (b.time - ideal.t) * 1000 : 0;
    this.executeHit(input, errMs);
  }

  private whiff(reason: WhiffReason, hand: Hand): void {
    this.swingAnim = 0;
    this.swingCooldown = tuning.input.whiffCooldownMs / 1000;
    this.hooks.onWhiff(reason, hand);
  }

  /** 지나온 궤적 + 예측 궤적에서 현재 위치 기준 이상적 타격 순간 */
  private idealFor(pred: Prediction, win: { from: number; until: number }) {
    const from = this.trace.length ? this.trace[0].t : win.from;
    return idealHitTime([...this.trace, ...pred.points], { from, until: win.until }, this.playerPos);
  }

  private executeHit(input: SwingInput, errMs: number): void {
    const w = this.world;
    const b = w.ball!;
    const dist = horiz(b.pos, this.playerPos);
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
    const wallX = aimWallX(this.playerPos, input.aim, w.court);
    const plan = planDrive(from, score, wallX, w.court);
    w.launch(from, plan.vel, 'A', false);
    const newBest = this.session.onHit(grade);

    this.swingAnim = SWING_CONTACT;
    this.swingCooldown = tuning.input.swingCooldownMs / 1000;

    // 타격감: 히트스톱(캐릭터까지 멈춤) + 진동 + 섬광 + 소리
    const F = tuning.fx;
    const strength = 0.25 + 0.75 * score;
    this.loop.hitstop(grade === 'perfect' ? F.hitstopMs.perfect : grade === 'good' ? F.hitstopMs.good : F.hitstopMs.off);
    const amp = this.settings.shake === 'off' ? 0 : this.settings.shake === 'weak' ? F.shake.weak : F.shake.normal;
    this.shake.kick(amp * strength);
    this.impact.burst(from, strength);
    this.swingTrail.setWidth(0.6 + 0.4 * strength);
    sfx.play(grade === 'perfect' ? 'hit_perfect' : grade === 'good' ? 'hit_hard' : 'hit_soft', 0.55 + 0.45 * strength);
    if (newBest && this.session.combo > 1) sfx.play('combo_up', 0.6);
    this.hooks.onHit({ grade, score, hint, at: from, speed: plan.speed, hand: input.hand, newBest });
  }

  // ── 시뮬레이션 (고정 타임스텝) ──

  private simStep(dt: number): void {
    const w = this.world;
    const hasInput = this.moveInput.x !== 0 || this.moveInput.z !== 0;
    // 이동은 WASD 수동만. 디버그 봇일 때만 타점 옆 자리로 자동 이동
    const target = !hasInput && tuning.debug.autoplay && this.ring ? standSpotFor(this.ring.point, this.playerPos, w.court) : null;
    const squeak = moveStep(this.mover, dt, w.court, hasInput ? this.moveInput : null, target);
    if (squeak) sfx.play('squeak', 0.7);

    w.step(dt);
    if (w.ball && w.rally.phase === 'returning') this.trace.push({ ...w.ball.pos, t: w.ball.time });
  }

  private onContact(ct: BallContact): void {
    if (ct.rolling) return;
    const v = sfx.speedVol(ct.normalSpeed);
    sfx.play(BOUNCE_SFX[ct.surface], ct.surface === 'tin' ? 1 : v);
    if (ct.surface === 'front' || ct.surface === 'tin') this.wallMarks.add(ct.point);
    this.debugDraw.addActual(ct, tuning.debug.showContacts);
  }

  private onRallyEnd(r: RallyResult): void {
    this.session.onMiss();
    this.slowmoTimer = tuning.fx.slowmoMs / 1000;
    this.feedTimer = tuning.solo.feedDelayMs / 1000;
    sfx.play('point_lose', 0.7);
    this.debugDraw.markResult(r.contact);
    this.hooks.onRallyEnd(r);
  }

  /** 앞벽 근처에서 플레이어 쪽으로 공을 보낸다 */
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

  /** 디버그 봇: 이상적인 타격 시각(+설정 오차)에 맞는 손으로 클릭 */
  private autoSwing(): void {
    const w = this.world;
    const b = w.ball;
    if (!b || !this.pred || w.rally.phase !== 'returning' || this.swingCooldown > 0) return;
    const win = hitWindow(this.pred, b.time, true, w.rally.floorBounces);
    const ideal = win ? this.idealFor(this.pred, win) : null;
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
      } else this.loop.timeScale = tuning.debug.timeScale;
      this.swingCooldown = Math.max(0, this.swingCooldown - realDt);

      if (this.feedTimer > 0 && (this.feedTimer -= realDt) <= 0) this.feed();
      this.loop.advance(realDt);
    }
    const w = this.world;
    const b = w.ball;

    // 예측 + 타이밍 링
    this.pred = null;
    this.ring = null;
    if (b && (w.rally.phase === 'returning' || w.rally.phase === 'toFront')) {
      this.pred = predict(b, w.court, 3, 2);
      const win = hitWindow(this.pred, b.time, w.rally.phase === 'returning', w.rally.floorBounces);
      if (win) this.ring = idealBallPoint(this.pred, win);
    }
    const ringGood = this.ring
      ? (() => {
          const s = standSpotFor(this.ring.point, this.playerPos, w.court);
          return Math.hypot(s.x - this.mover.x, s.z - this.mover.z) < 0.4;
        })()
      : false;
    const showRing = this.ring && w.rally.phase === 'returning' ? this.ring : null;
    this.ballSide = b && w.rally.phase === 'returning' ? handFor(showRing?.point ?? b.pos, this.playerPos) : null;
    const liveHand = b && w.rally.phase === 'returning' && inReach(b.pos, this.playerPos) ? handFor(b.pos, this.playerPos) : null;
    this.guide.update(showRing?.point ?? null, showRing ? showRing.t - b!.time : 0, ringGood, this.playerPos, liveHand);
    this.aimGuide.update(this.playerPos, aimWallX(this.playerPos, this.aimPoint, w.court), !this.paused && !!this.aimPoint);
    if (tuning.debug.autoplay && !this.paused) this.autoSwing();

    this.debugDraw.setPrediction(tuning.debug.showPrediction ? this.pred : null, { line: true, contacts: tuning.debug.showContacts });

    // 캐릭터 (히트스톱 중엔 임팩트 자세로 멈춤)
    if (this.holdSwing !== null) this.swingAnim = this.holdSwing;
    else if (this.swingAnim !== null && !frozen && !this.paused) {
      this.swingAnim += realDt / SWING_SECONDS;
      if (this.swingAnim >= 1) this.swingAnim = null;
    }
    this.player.root.position.x = this.mover.x;
    this.player.root.position.z = this.mover.z;
    animateCharacter(this.player, this.paused ? 0 : realDt, {
      vx: this.mover.vx,
      vz: this.mover.vz,
      maxSpeed: tuning.player.maxSpeed,
      swing: this.swingAnim,
      hand: this.swingHand,
      frozen,
    });
    this.player.root.updateMatrixWorld(true);
    if (this.swingAnim !== null && !frozen) {
      this.player.hand.getWorldPosition(this.tmpA);
      this.player.racketHead.getWorldPosition(this.tmpB);
      this.swingTrail.push(this.tmpA, this.tmpB);
    }
    this.swingTrail.update(frozen ? 0 : realDt);

    // 공 + FX
    this.ballView.update(b);
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
      cam.position.set(this.mover.x + o[0], o[1], this.mover.z + o[2]);
      cam.lookAt(this.mover.x, 0.95, this.mover.z);
    }
  }

  /** 디버그: 스윙 자세를 보여주기 (t = null이면 해제) */
  debugPose(hand: Hand, t: number | null): void {
    this.swingHand = hand;
    this.holdSwing = t;
    if (t === null) this.swingAnim = null;
  }
}
