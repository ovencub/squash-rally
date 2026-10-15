import { sfx } from '../audio/sfx';
import { tuning, type Difficulty } from '../config/tuning';
import { saveSettings, type Settings } from '../game/settings';
import { type MatchStats } from '../game/game';
import { loadBest, type SoloSession } from '../game/solo';
import { type MatchState } from '../rules/par';

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
      const act = btn.dataset.act!;
      this.actions[act]?.();
      sfx.unlock();
      sfx.play(act === 'back' || act === 'menu' ? 'ui_back' : 'ui_click');
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
      `<img class="logo-img" src="${import.meta.env.BASE_URL}img/logo.webp" alt="${tuning.game.title}">
       <p class="tagline">링크 하나로 바로 치는 3D 스쿼시</p>
       ${matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches ? '<p class="touch-note">📱 터치 조작 · 가로 화면으로 플레이</p>' : ''}
       <div class="btns"><button class="btn primary" data-act="start">시작하기</button></div>`,
      a,
    );
    this.el.querySelector('.panel')!.classList.add('title-panel');
  }

  main(a: { solo: () => void; ai: () => void; howto: () => void; settings: () => void }): void {
    this.show(
      `<img class="logo-img small" src="${import.meta.env.BASE_URL}img/logo.webp" alt="${tuning.game.title}">
       <div class="btns">
         <button class="btn primary" data-act="solo">1인 모드<span class="sub">혼자 벽치기 · 콤보 기록 도전</span></button>
         <button class="btn" data-act="ai">AI 대전<span class="sub">11점 · 3전 2선승</span></button>
         <button class="btn ghost" data-act="howto">조작법</button>
         <button class="btn ghost" data-act="settings">설정</button>
       </div>
       <p style="margin-top:16px;font-size:12px;opacity:.6">효과음 일부: Kenney (kenney.nl, CC0)</p>`,
      a,
    );
  }

  difficulty(a: { pick: (d: Difficulty) => void; back: () => void }, title = '1인 모드'): void {
    const solo = title === '1인 모드';
    const card = (d: Difficulty, desc: string) =>
      `<button class="btn ${d === 'easy' ? 'primary' : ''}" data-act="${d}">${DIFF_LABEL[d]}<span class="sub">${desc}</span>${solo ? `<span class="sub">최고 ${loadBest(d)}</span>` : ''}</button>`;
    this.show(
      `<h2>${title} · 난이도</h2>
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
       <ol class="howto-list">
         <li><b>WASD / 방향키</b>로 직접 이동해요 (자동 이동 없음)</li>
         <li>캐릭터 주변 원이 <b>타격 범위</b>예요. 오른쪽 절반 = 포핸드, 왼쪽 절반 = 백핸드</li>
         <li>공이 <b>오른쪽</b>에 있으면 <b>우클릭</b>, <b>왼쪽</b>이면 <b>좌클릭</b>. 반대 손이면 헛스윙!</li>
         <li>공이 <b>노란 점선 원</b>(범위의 절반 지점) 위에 있을 때, <b>타이밍</b>까지 맞으면 <b>PERFECT</b></li>
         <li>클릭할 때 <b>커서가 있는 방향</b>으로 공이 날아가요</li>
         <li>바닥의 <b>빨간 링</b>은 공이 칠 만한 높이로 내려올 곳이에요</li>
         <li>바닥에 <b>두 번 튀기 전에</b> 쳐야 해요</li>
       </ol>
       <p style="margin-top:12px"><b>모바일</b>: 왼쪽을 누르고 끌어 이동 · 오른쪽 <b>백핸드/포핸드</b> 버튼으로 스윙 · 치는 순간 조이스틱을 기울인 쪽으로 공이 가요</p>
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
       <div class="row"><label>조작 방식</label>${seg('control', [['pc', 'PC 키보드·마우스'], ['mobile', '모바일 터치']], s.control)}</div>
       <div class="row"><label>화면 진동</label>${seg('shake', [['off', '끔'], ['weak', '약'], ['normal', '보통']], s.shake)}</div>
       <div class="row"><label>공 크기</label>${seg('ball', [['real', '실제 크기'], ['normal', '보통'], ['big', '크게']], s.ballSize)}</div>
       <div class="row"><label>이동 속도 <b data-out="move">${s.moveSpeed.toFixed(1)}</b></label><input type="range" min="${tuning.player.moveSpeedMin}" max="${tuning.player.moveSpeedMax}" step="0.1" value="${s.moveSpeed}" data-range="move"></div>
       <div class="btns"><button class="btn" data-act="back">확인</button></div>`,
      a,
    );
    this.el.querySelectorAll<HTMLButtonElement>('[data-seg]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.seg === 'shake') s.shake = b.dataset.v as Settings['shake'];
        if (b.dataset.seg === 'ball') s.ballSize = b.dataset.v as Settings['ballSize'];
        if (b.dataset.seg === 'control') s.control = b.dataset.v as Settings['control'];
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
    const mv = this.el.querySelector<HTMLInputElement>('[data-range=move]')!;
    mv.addEventListener('input', () => {
      s.moveSpeed = Number(mv.value);
      this.el.querySelector('[data-out=move]')!.textContent = s.moveSpeed.toFixed(1);
      saveSettings(s);
      a.changed();
    });
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

  matchResults(m: MatchState, st: MatchStats, d: Difficulty, a: { retry: () => void; menu: () => void }): void {
    const win = m.winner === 'A';
    const games = m.history.map((g, i) => `<div><b>${g.A} - ${g.B}</b><span>GAME ${i + 1}</span></div>`).join('');
    this.show(
      `<div class="logo" style="font-size:52px">${win ? 'YOU WIN!' : 'AI WIN'}</div>
       <p>AI 대전 · ${DIFF_LABEL[d]} · 게임 ${m.games.A} : ${m.games.B}</p>
       <div class="stats">${games}</div>
       <div class="stats">
         <div><b>${st.hits}</b><span>내 타구</span></div>
         <div><b>${st.hits ? Math.round((st.perfects / st.hits) * 100) : 0}%</b><span>PERFECT 비율</span></div>
         <div><b>${st.longestRally}</b><span>최장 랠리</span></div>
       </div>
       <div class="btns">
         <button class="btn primary" data-act="retry">재대결</button>
         <button class="btn ghost" data-act="menu">메인으로</button>
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
