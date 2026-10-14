import { sfx } from '../audio/sfx';
import { tuning, type Difficulty } from '../config/tuning';
import { saveSettings, type Settings } from '../game/settings';
import { loadBest, type SoloSession } from '../game/solo';

// 메뉴 화면들 (기획서 3-10 화면 흐름). DOM 문자열 + data-act 버튼 위임.

export const DIFF_LABEL: Record<Difficulty, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };

type Actions = Record<string, () => void>;

export class Screens {
  private el: HTMLDivElement;
  private actions: Actions = {};

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'screen hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!btn || btn.hasAttribute('disabled')) return;
      sfx.unlock();
      const act = btn.dataset.act!;
      sfx.play(act === 'back' || act === 'menu' ? 'ui_back' : 'ui_click');
      this.actions[act]?.();
    });
    this.el.addEventListener('pointerover', (e) => {
      const btn = (e.target as HTMLElement).closest('.btn');
      if (btn && !(e.relatedTarget as HTMLElement | null)?.closest?.('.btn')) sfx.play('ui_hover', 0.6);
    });
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  get visible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  private show(html: string, actions: Actions): void {
    this.actions = actions;
    this.el.innerHTML = `<div class="panel">${html}</div>`;
    this.el.classList.remove('hidden');
  }

  title(a: { start: () => void }): void {
    this.show(
      `<div class="logo">${tuning.game.title}<small>3D SQUASH</small></div>
       <div class="btns"><button class="btn primary" data-act="start">시작하기</button></div>`,
      a,
    );
  }

  main(a: { solo: () => void; howto: () => void; settings: () => void }): void {
    this.show(
      `<div class="logo" style="font-size:44px">${tuning.game.title}</div>
       <div class="btns">
         <button class="btn primary" data-act="solo">1인 모드<span class="sub">혼자 벽치기 · 콤보 기록 도전</span></button>
         <button class="btn" data-act="ai" disabled>AI 대전<span class="sub">준비 중 (M4)</span></button>
         <button class="btn ghost" data-act="howto">조작법</button>
         <button class="btn ghost" data-act="settings">설정</button>
       </div>`,
      a,
    );
  }

  difficulty(a: { pick: (d: Difficulty) => void; back: () => void }): void {
    const card = (d: Difficulty, desc: string) =>
      `<button class="btn ${d === 'easy' ? 'primary' : ''}" data-act="${d}">${DIFF_LABEL[d]}<span class="sub">${desc}</span><span class="sub">최고 ${loadBest(d)}</span></button>`;
    this.show(
      `<h2>난이도</h2>
       <p>어려울수록 코트가 좁아져 공이 빨리 돌아와요</p>
       <div class="diff-grid">
         ${card('easy', '넓은 코트')}${card('normal', '조금 좁게')}${card('hard', '좁은 코트')}
       </div>
       <div class="btns"><button class="btn ghost" data-act="back">뒤로</button></div>`,
      { easy: () => a.pick('easy'), normal: () => a.pick('normal'), hard: () => a.pick('hard'), back: a.back },
    );
  }

  howto(a: { back: () => void }): void {
    this.show(
      `<h2>조작법</h2>
       <div class="howto-demo"><i></i></div>
       <p>마우스를 누른 채 <b>↓당겼다 ↑밀기</b> = 드라이브!</p>
       <ol class="howto-list">
         <li><b>WASD / 방향키</b>로 바닥의 <b>빨간 링</b> 옆으로 이동</li>
         <li>링이 좁혀져 <b>공이 옆에 왔을 때</b> 스윙 → <b>PERFECT</b></li>
         <li>일찍 치면 <b>크로스</b>, 늦게 치면 <b>스트레이트</b>로 날아가요</li>
         <li>짧게 <b>클릭</b>해도 칠 수 있지만 힘이 약해요</li>
         <li>바닥에 <b>두 번 튀기 전에</b> 쳐야 해요</li>
       </ol>
       <div class="btns"><button class="btn" data-act="back">돌아가기</button></div>`,
      a,
    );
  }

  settings(s: Settings, a: { back: () => void; changed: () => void }): void {
    const seg = (name: string, opts: [string, string][], cur: string) =>
      `<span class="seg">${opts.map(([v, l]) => `<button data-seg="${name}" data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</span>`;
    this.show(
      `<h2>설정</h2>
       <div class="row"><label>효과음</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-range="volume"></div>
       <div class="row"><label>화면 진동</label>${seg('shake', [['off', '끔'], ['weak', '약'], ['normal', '보통']], s.shake)}</div>
       <div class="row"><label>자동 위치 보조</label>${seg('assist', [['easyOnly', '쉬움만'], ['on', '항상'], ['off', '끔']], s.assist)}</div>
       <div class="row"><label>스윙 방향 반전</label>${seg('invert', [['0', '↓↑ 기본'], ['1', '↑↓ 반전']], tuning.input.invertStroke ? '1' : '0')}</div>
       <div class="btns"><button class="btn" data-act="back">확인</button></div>`,
      a,
    );
    this.el.querySelectorAll<HTMLButtonElement>('[data-seg]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.seg!;
        const v = b.dataset.v!;
        if (k === 'shake') s.shake = v as Settings['shake'];
        if (k === 'assist') s.assist = v as Settings['assist'];
        if (k === 'invert') tuning.input.invertStroke = s.invertStroke = v === '1';
        b.parentElement!.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        sfx.play('ui_click');
        saveSettings(s);
        a.changed();
      }),
    );
    const vol = this.el.querySelector<HTMLInputElement>('[data-range=volume]')!;
    vol.addEventListener('input', () => {
      s.volume = Number(vol.value);
      sfx.volume = s.volume;
      saveSettings(s);
    });
    vol.addEventListener('change', () => sfx.play('hit_hard'));
  }

  pause(a: { resume: () => void; quit: () => void; settings: () => void }): void {
    this.show(
      `<h2>일시정지</h2>
       <div class="btns">
         <button class="btn primary" data-act="resume">계속하기</button>
         <button class="btn ghost" data-act="settings">설정</button>
         <button class="btn" data-act="quit">그만하기</button>
       </div>`,
      a,
    );
  }

  results(s: SoloSession, a: { retry: () => void; menu: () => void }): void {
    const rate = Math.round(s.perfectRate * 100);
    this.show(
      `<h2>결과 · ${DIFF_LABEL[s.difficulty]}</h2>
       <div class="stats">
         <div><b>${s.hits}</b><span>총 타구</span></div>
         <div><b>${s.bestThisRun}</b><span>이번 최고 콤보</span></div>
         <div><b>${rate}%</b><span>PERFECT 비율</span></div>
       </div>
       <p>역대 최고 콤보 <b>${s.best}</b></p>
       <div class="btns">
         <button class="btn primary" data-act="retry">다시 하기</button>
         <button class="btn ghost" data-act="menu">메인으로</button>
       </div>`,
      a,
    );
  }
}
