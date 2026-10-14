import * as THREE from 'three';
import { sfx, type SfxName } from '../audio/sfx';
import { tPosition } from '../config/court';
import { tuning, type Difficulty } from '../config/tuning';
import { FixedLoop } from '../core/loop';
import { Rng } from '../core/rng';
import { type SwingInput } from '../input/gesture';
import { type BallContact, type Surface, type Vec3 } from '../physics/ball';
import { predict, type Prediction } from '../physics/predict';
import { type RallyResult } from '../rules/rally';
import { BallView } from '../render/ball-view';
import { CameraRig } from '../render/camera';
import { animateCharacter, createCharacter, type Character } from '../render/character';
import { createCourtMesh } from '../render/court-mesh';
import { DebugDraw } from '../render/debug-draw';
import { BallTrail, ImpactFx, Shake, SwingTrail, TimingGuide, WallMarks } from '../render/fx';
import { palette } from '../render/palette';
import { createMover, moveStep, standSpotFor, type Mover } from './player';
import { assistEnabled, type Settings } from './settings';
import { SoloSession } from './solo';
import { hitWindow, idealBallPoint, idealHitTime, inReach, judge, planDrive, type Quality } from './swing';
import { World } from './world';

export interface HitEvent {
  quality: Quality;
  errMs: number;
  at: Vec3;
  speed: number;
  side: 1 | -1;
  newBest: boolean;
}

export interface GameHooks {
  onHit: (e: HitEvent) => void;
  onRallyEnd: (r: RallyResult) => void;
  onWhiff: () => void;
}

const BOUNCE_SFX: Record<Surface, SfxName> = {
  front: 'bounce_front',
  tin: 'tin',
  left: 'bounce_side',
  right: 'bounce_side',
  back: 'bounce_glass',
  floor: 'bounce_floor',
};

/**
 * 1인 모드 게임 진행. 시뮬레이션(World + 이동 + 스윙 판정)은 고정 타임스텝에서, 렌더/FX는 프레임마다.
 * M4에서 AI 대전 모드가 같은 구조 위에 추가된다.
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
  private wallMarks = new WallMarks();
  private shake = new Shake();
  readonly debugDraw = new DebugDraw();
  private rng = new Rng(tuning.game.seed);

  /** 키보드 이동 입력 (매 서브스텝 읽음) */
  moveInput = { x: 0, z: 0 };
  private swingAnim: number | null = null;
  private swingSide: 1 | -1 = 1;
  private swingCooldown = 0;
  private pending: { input: SwingInput; pressTime: number; idealT: number; expires: number } | null = null;
  private feedTimer = 0;
  private slowmoTimer = 0;
  private pred: Prediction | null = null;
  /** 앞벽에서 돌아오는 공이 지나온 궤적 (타이밍 판정용) */
  private trace: (Vec3 & { t: number })[] = [];
  private ring: { t: number; point: Vec3 } | null = null;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  /** 포/백핸드 표시용 */
  side: 1 | -1 = 1;

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
    this.mover = createMover(t.x + 0.3, t.z + 0.8);
    scene.add(
      this.courtMesh,
      this.player.root,
      this.ballView.group,
      this.ballTrail.group,
      this.swingTrail.mesh,
      this.impact.group,
      this.guide.group,
      this.wallMarks.group,
      this.debugDraw.group,
    );

    this.world.bus.on('contact', (ct) => this.onContact(ct));
    this.world.bus.on('launch', () => (this.trace = []));
    this.world.bus.on('feed', () => (this.trace = []));
    this.world.bus.on('rallyEnd', (r) => this.onRallyEnd(r));
    this.feedTimer = 0.8;
  }

  dispose(): void {
    this.scene.remove(
      this.courtMesh,
      this.player.root,
      this.ballView.group,
      this.ballTrail.group,
      this.swingTrail.mesh,
      this.impact.group,
      this.guide.group,
      this.wallMarks.group,
      this.debugDraw.group,
    );
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

  // ── 입력 ──

  swing(input: SwingInput): void {
    if (this.paused || this.swingCooldown > 0) return;
    const w = this.world;
    const b = w.ball;
    this.swingCooldown = tuning.input.swingCooldownMs / 1000;
    this.swingAnim = 0;
    this.swingSide = b && b.pos.x < this.mover.x ? -1 : 1;

    if (!b || w.rally.phase !== 'returning') {
      this.whiff();
      return;
    }
    const pred = predict(b, w.court, 2.5, 1);
    const win = hitWindow(pred, b.time, true, w.rally.floorBounces);
    const ideal = win ? this.idealFor(pred, win) : null;
    if (!win || !ideal) {
      this.whiff();
      return;
    }
    if (inReach(b.pos, this.playerPos)) {
      this.executeHit(input, (b.time - ideal.t) * 1000);
      return;
    }
    // 입력 버퍼: 조금 일찍 휘둘러도 공이 범위에 들어오는 순간 친다
    const buf = tuning.input.bufferMs / 1000;
    const enters = pred.points.find((p) => p.t >= win.from && p.t <= win.until && inReach(p, this.playerPos));
    if (enters && enters.t - b.time <= buf) {
      this.pending = { input, pressTime: b.time, idealT: ideal.t, expires: enters.t + 0.05 };
      return;
    }
    this.whiff();
  }

  /** 지나온 궤적 + 예측 궤적에서 현재 위치 기준 이상적 타격 순간 */
  private idealFor(pred: Prediction, win: { from: number; until: number }) {
    const from = this.trace.length ? this.trace[0].t : win.from;
    return idealHitTime([...this.trace, ...pred.points], { from, until: win.until }, this.playerPos);
  }

  private whiff(): void {
    this.hooks.onWhiff();
  }

  private executeHit(input: SwingInput, errMs: number): void {
    const w = this.world;
    const b = w.ball!;
    const quality = judge(errMs);
    const side: 1 | -1 = b.pos.x >= this.mover.x ? 1 : -1;
    this.swingSide = side;
    const from = { ...b.pos };
    const plan = planDrive({ from, quality, errMs, power: input.power, aim: input.aim, side }, w.court);
    w.launch(from, plan.vel, 'A', false);
    const newBest = this.session.onHit(quality);

    // 타격감: 히트스톱 + 진동 + 섬광 + 소리
    const F = tuning.fx;
    const strength = quality === 'perfect' ? 1 : quality === 'good' ? 0.6 : 0.3;
    this.loop.hitstop(quality === 'perfect' ? F.hitstopMs.perfect : quality === 'good' ? F.hitstopMs.good : F.hitstopMs.off);
    const amp = this.settings.shake === 'off' ? 0 : this.settings.shake === 'weak' ? F.shake.weak : F.shake.normal;
    this.shake.kick(amp * (0.4 + 0.6 * strength) * (0.7 + 0.3 * input.power));
    this.impact.burst(from, strength);
    this.swingTrail.setWidth(0.6 + 0.4 * strength);
    sfx.play(quality === 'perfect' ? 'hit_perfect' : quality === 'good' ? 'hit_hard' : 'hit_soft', 0.6 + 0.4 * strength);
    if (newBest && this.session.combo > 1) sfx.play('combo_up', 0.6);
    this.hooks.onHit({ quality, errMs, at: from, speed: plan.speed, side, newBest });
  }

  // ── 시뮬레이션 (고정 타임스텝) ──

  private simStep(dt: number): void {
    const w = this.world;
    // 이동: 키 입력이 없고 자동 보조가 켜져 있으면 예상 타점 옆 자리로 천천히
    const hasInput = this.moveInput.x !== 0 || this.moveInput.z !== 0;
    let target: { x: number; z: number } | null = null;
    const auto = tuning.debug.autoplay;
    if (!hasInput && this.ring && (auto || assistEnabled(this.settings, this.difficulty))) {
      target = standSpotFor(this.ring.point, this.playerPos, w.court);
    }
    const ratio = hasInput || auto ? 1 : tuning.player.assistSpeedRatio;
    const squeak = moveStep(this.mover, dt, w.court, hasInput ? this.moveInput : null, target, ratio);
    if (squeak) sfx.play('squeak', 0.7);

    w.step(dt);
    if (w.ball && w.rally.phase === 'returning') this.trace.push({ ...w.ball.pos, t: w.ball.time });

    // 버퍼된 스윙 처리
    const b = w.ball;
    if (this.pending && b) {
      if (w.rally.phase === 'returning' && inReach(b.pos, this.playerPos)) {
        const p = this.pending;
        this.pending = null;
        this.executeHit(p.input, (p.pressTime - p.idealT) * 1000);
      } else if (b.time > this.pending.expires || w.rally.phase !== 'returning') {
        this.pending = null;
        this.whiff();
      }
    }
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
    this.pending = null;
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

  /** 디버그 봇: 이상적인 타격 시각(+설정 오차)에 스윙 */
  private autoSwing(): void {
    const w = this.world;
    const b = w.ball;
    if (!b || !this.pred || w.rally.phase !== 'returning' || this.pending || this.swingCooldown > 0) return;
    const win = hitWindow(this.pred, b.time, true, w.rally.floorBounces);
    const ideal = win ? this.idealFor(this.pred, win) : null;
    if (!ideal) return;
    const at = ideal.t + tuning.debug.autoplayErrorMs / 1000;
    if (b.time >= at - 1 / 120) this.swing({ power: 1, aim: 0, kind: 'stroke', time: performance.now() });
  }

  // ── 프레임 업데이트 ──

  update(realDt: number): void {
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
    // 공이 날아가는 동안(내 샷이 앞벽으로 갈 때)은 링을 흐리게 보이지 않게
    const showRing = this.ring && w.rally.phase === 'returning' ? this.ring : null;
    this.guide.update(showRing?.point ?? null, showRing ? showRing.t - b!.time : 0, ringGood, this.playerPos, true);
    if (this.ring) this.side = this.ring.point.x >= this.mover.x ? 1 : -1;
    if (tuning.debug.autoplay && !this.paused) this.autoSwing();

    this.debugDraw.setPrediction(tuning.debug.showPrediction ? this.pred : null, { line: true, contacts: tuning.debug.showContacts });

    // 캐릭터
    if (this.swingAnim !== null) {
      this.swingAnim += realDt / 0.26;
      if (this.swingAnim >= 1) this.swingAnim = null;
    }
    this.player.root.position.x = this.mover.x;
    this.player.root.position.z = this.mover.z;
    animateCharacter(this.player, realDt, {
      speed: Math.hypot(this.mover.vx, this.mover.vz),
      swing: this.swingAnim,
      side: this.swingSide,
    });
    this.player.root.updateMatrixWorld(true);
    if (this.swingAnim !== null) {
      this.player.hand.getWorldPosition(this.tmpA);
      this.player.racketHead.getWorldPosition(this.tmpB);
      this.swingTrail.push(this.tmpA, this.tmpB);
    }
    this.swingTrail.update(realDt);

    // 공 + FX
    this.ballView.update(b);
    this.ballTrail.update(b ? b.pos : null, b ? Math.hypot(b.vel.x, b.vel.y, b.vel.z) : 0);
    this.impact.update(realDt);
    this.wallMarks.update(realDt);

    // 카메라 (미세 진동 포함)
    const s = this.shake.update(realDt);
    this.rig.setShake(s.x, s.y);
    this.rig.update(realDt, this.playerPos);
  }
}
