import { type Hand } from '../game/swing';

// 모바일 터치 조작 (M7 피드백). 참고: 「Badminton League」·「Virtua Tennis Challenge」류 모바일 라켓 게임의
// "왼손 가상 조이스틱 이동 + 오른손 큰 타격 버튼" 배치. 방향은 Virtua Tennis처럼 "치는 순간 조이스틱을 기울인 쪽".
// - 화면 왼쪽 절반 아무 곳이나 누르면 그 자리에 조이스틱이 생김 (플로팅)
// - 오른쪽: [백핸드] [포핸드] 두 버튼 (마우스 좌/우 클릭과 같은 배치)

export interface TouchCallbacks {
  onSwing: (hand: Hand, aimX: number) => void;
}

const RADIUS = 56; // 조이스틱 최대 이동 반경(px)

export class TouchControls {
  readonly el: HTMLDivElement;
  /** 이동 입력: x 오른쪽 +, z 화면 아래(뒤) + — 길이 ≤ 1 */
  readonly move = { x: 0, z: 0 };
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private btns: Record<Hand, HTMLDivElement>;

  constructor(
    root: HTMLElement,
    private cb: TouchCallbacks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'touch hidden';
    this.el.innerHTML = `
      <div class="t-zone"></div>
      <div class="t-base"><div class="t-knob"></div></div>
      <div class="t-hint">왼쪽을 누르고 끌어서 이동</div>
      <div class="t-btn back" data-hand="back"><b>백핸드</b><small>공이 왼쪽</small></div>
      <div class="t-btn fore" data-hand="fore"><b>포핸드</b><small>공이 오른쪽</small></div>`;
    root.appendChild(this.el);
    this.base = this.el.querySelector('.t-base')!;
    this.knob = this.el.querySelector('.t-knob')!;
    this.btns = { back: this.el.querySelector('.t-btn.back')!, fore: this.el.querySelector('.t-btn.fore')! };

    const zone = this.el.querySelector<HTMLDivElement>('.t-zone')!;
    zone.addEventListener('pointerdown', (e) => this.stickDown(e));
    window.addEventListener('pointermove', (e) => this.stickMove(e));
    window.addEventListener('pointerup', (e) => this.stickUp(e));
    window.addEventListener('pointercancel', (e) => this.stickUp(e));
    for (const hand of ['back', 'fore'] as Hand[]) {
      const b = this.btns[hand];
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('on');
        // 치는 순간 조이스틱 좌우 기울기 = 방향 (-1 왼쪽 ~ +1 오른쪽)
        this.cb.onSwing(hand, this.move.x);
      });
      const off = () => b.classList.remove('on');
      b.addEventListener('pointerup', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('pointercancel', off);
    }
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('hidden', !v);
    if (!v) this.reset();
  }

  /** 공이 범위에 들어왔을 때 칠 버튼을 반짝임 */
  hint(hand: Hand | null): void {
    this.btns.back.classList.toggle('hint', hand === 'back');
    this.btns.fore.classList.toggle('hint', hand === 'fore');
  }

  private stickDown(e: PointerEvent): void {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.base.style.left = `${e.clientX}px`;
    this.base.style.top = `${e.clientY}px`;
    this.base.classList.add('on');
    this.el.classList.add('used');
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // 작은 흔들림은 무시 (데드존 15%), 그 이상은 0..1로 선형
    const m = Math.min(1, d / RADIUS);
    const scale = m < 0.15 ? 0 : (m - 0.15) / 0.85;
    const len = Math.max(Math.hypot(dx, dy), 1e-6);
    this.move.x = (dx / len) * scale;
    this.move.z = (dy / len) * scale;
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.reset();
  }

  private reset(): void {
    this.stickId = null;
    this.move.x = this.move.z = 0;
    this.base.classList.remove('on');
  }
}
