// 사운드 비교 페이지 (?sfxlab): 예전·현재·새 후보 타구음을 같은 기기·같은 재생 경로(잔향·리미터 포함)로 들어보고 고르기 위한 도구.
// 예전 버전은 그 시점 커밋의 합성 레이어·뱅크 값·리미터를 그대로 옮겨 둔 스냅샷이다 (게임에서는 쓰지 않음).
import { sfx, type Eq, type Room, type SfxName, type Voice } from '../audio/sfx';
import { hp, mode, modeDrop, noiseBurst, snap, SYNTH, thud, type Synth } from '../audio/synth';
import { tuning } from '../config/tuning';

type Level = 0 | 1 | 2; // 약 · 중 · 강
type Surface = 'racket' | 'wall' | 'floor';

interface Variant {
  id: string;
  label: string;
  desc: string;
  limiter: 'peak' | 'soft';
  master: number;
  /** 잔향 종류 (①~⑦은 당시의 돔 잔향 그대로) */
  room: Room;
  /** 바닥 '최대 세기' 기준 속력 (예전 버전은 모든 면 22m/s) */
  floorFull: number;
  voice: (s: Surface, lv: Level) => Voice;
}

// ── 예전 합성 레이어 스냅샷 ──
// M5 (a9fa589~9d03dfb): 금속판 녹음 + 실제 경기 분석 모드 합성
const m5Body: Synth = (c, o, t, v, p) => {
  for (const [f, a, d] of [
    [395, 1, 0.011],
    [468, 0.7, 0.01],
    [355, 0.5, 0.012],
    [97, 0.3, 0.014],
    [974, 0.25, 0.007],
    [1486, 0.2, 0.006],
  ])
    mode(c, o, t, v * a * 0.5, f * p, d);
  noiseBurst(c, o, t, v * 0.18, 1500 * p, 0.8, 0.01);
};
const m5Wall: Synth = (c, o, t, v, p) => {
  for (const [f, a, d] of [
    [253, 1, 0.05],
    [415, 0.9, 0.045],
    [770, 0.8, 0.04],
    [883, 0.75, 0.036],
    [1023, 0.75, 0.032],
    [1534, 0.75, 0.026],
    [1857, 0.6, 0.022],
    [2331, 0.45, 0.018],
    [110, 0.35, 0.03],
  ])
    mode(c, o, t, v * a * 0.32, f * p, d);
  noiseBurst(c, o, t, v * 0.5, 900 * p, 0.35, 0.035);
  hp(c, o, t, v * 0.35, 1500 * p, 0.03);
};
const RACKET_EQ_M5: Eq[] = [
  ['highpass', 110, 0, 0.9],
  ['highpass', 110, 0, 0.9],
  ['peaking', 400, 7, 1.1],
  ['peaking', 150, -7, 1.4],
  ['peaking', 240, -4, 1.5],
  ['highshelf', 3000, -6],
];
const DULL_EQ: Eq[] = [
  ['highpass', 450, 0, 0.7],
  ['lowpass', 2400, 0, 0.7],
  ['highshelf', 1600, -3],
];

// 고무공 1차 (fe7453a): 둔탁한 '퍽'
const r1Hit: Synth = (c, o, t, v, p) => {
  modeDrop(c, o, t, v * 0.05, 155 * p, 95 * p, 0.03, 0.0015);
  modeDrop(c, o, t, v * 0.07, 380 * p, 290 * p, 0.022, 0.0015);
  modeDrop(c, o, t, v * 0.12, 640 * p, 520 * p, 0.018, 0.0015);
  thud(c, o, t, v * 1.1, 950 * p, 0.85, 0.085, 0.0018);
  mode(c, o, t, v * 0.05, 1300 * p, 0.007);
};
const r1Perfect: Synth = (c, o, t, v, p) => {
  modeDrop(c, o, t, v * 0.07, 140 * p, 85 * p, 0.036, 0.0015);
  modeDrop(c, o, t, v * 0.08, 360 * p, 270 * p, 0.026, 0.0015);
  modeDrop(c, o, t, v * 0.13, 620 * p, 500 * p, 0.02, 0.0015);
  thud(c, o, t, v * 1.2, 900 * p, 0.8, 0.1, 0.0018);
  mode(c, o, t, v * 0.06, 1250 * p, 0.008);
};
const r1Wall: Synth = (c, o, t, v, p) => {
  modeDrop(c, o, t, v * 0.05, 125 * p, 80 * p, 0.035, 0.002);
  modeDrop(c, o, t, v * 0.07, 280 * p, 220 * p, 0.028, 0.002);
  thud(c, o, t, v * 1.1, 520 * p, 0.8, 0.1, 0.0025);
  mode(c, o, t, v * 0.03, 70 * p, 0.06);
};
const r1Floor: Synth = (c, o, t, v, p) => {
  modeDrop(c, o, t, v * 0.14, 115 * p, 75 * p, 0.025, 0.002);
  thud(c, o, t, v * 0.9, 400 * p, 1.0, 0.06, 0.002);
  mode(c, o, t, v * 0.12, 560 * p, 0.012);
};

// '팡' 1차 (b581a77): 세기별 짧은 스냅
const r2Hit: Synth = (c, o, t, v, p, k) => {
  snap(c, o, t, v * (0.3 + 1.5 * k * k), (900 + 700 * k) * p, 0.03 - 0.008 * k);
  modeDrop(c, o, t, v * 0.06, 155 * p, 95 * p, 0.028, 0.0015);
  modeDrop(c, o, t, v * 0.08, 380 * p, 290 * p, 0.02, 0.0015);
  modeDrop(c, o, t, v * 0.12, 640 * p, 520 * p, 0.016, 0.0015);
  thud(c, o, t, v * (0.8 - 0.4 * k), 950 * p, 0.85, 0.075, 0.0016);
  mode(c, o, t, v * 0.06, 1300 * p, 0.007);
};
const r2Perfect: Synth = (c, o, t, v, p, k) => {
  snap(c, o, t, v * (0.7 + 1.3 * k * k), (1100 + 600 * k) * p, 0.032 - 0.008 * k);
  snap(c, o, t + 0.0015, v * 0.3 * k, 3000 * p, 0.01);
  modeDrop(c, o, t, v * 0.08, 140 * p, 85 * p, 0.034, 0.0015);
  modeDrop(c, o, t, v * 0.09, 360 * p, 270 * p, 0.024, 0.0015);
  modeDrop(c, o, t, v * 0.13, 620 * p, 500 * p, 0.018, 0.0015);
  thud(c, o, t, v * (0.75 - 0.35 * k), 900 * p, 0.8, 0.09, 0.0016);
  mode(c, o, t, v * 0.07, 1250 * p, 0.008);
};
const r2Wall: Synth = (c, o, t, v, p, k) => {
  snap(c, o, t, v * (0.18 + 1.3 * k * k), (850 + 500 * k) * p, 0.03 - 0.008 * k);
  modeDrop(c, o, t, v * 0.025, 125 * p, 80 * p, 0.035, 0.002);
  modeDrop(c, o, t, v * 0.05, 300 * p, 240 * p, 0.026, 0.002);
  thud(c, o, t, v * (0.75 - 0.35 * k), 720 * p, 0.8, 0.09, 0.0022);
  mode(c, o, t, v * (0.01 + 0.015 * k), 70 * p, 0.06);
};
const r2Floor: Synth = (c, o, t, v, p, k) => {
  snap(c, o, t, v * (0.3 + 1.5 * k * k), (950 + 550 * k) * p, 0.024 - 0.006 * k);
  modeDrop(c, o, t, v * 0.08, 115 * p, 75 * p, 0.025, 0.002);
  thud(c, o, t, v * (0.75 - 0.3 * k), 450 * p, 1.0, 0.06, 0.002);
  mode(c, o, t, v * 0.12, 560 * p, 0.012);
};

const HIT: SfxName[] = ['hit_soft', 'hit_hard', 'hit_perfect'];

/** 예전 고무공 뱅크 값 (fe7453a·b581a77 공통) */
function rubberBank(s: Surface, lv: Level, hit: Synth, perfect: Synth, wall: Synth, floor: Synth): Voice {
  if (s === 'racket')
    return [
      { buf: 'hit_soft', file: 0.12, layer: hit, layerVol: 0.9, wet: 0.3, rate: 1.06, eq: DULL_EQ },
      { buf: 'hit_hard', file: 0.14, layer: hit, layerVol: 1.0, wet: 0.36, eq: DULL_EQ },
      { buf: 'hit_perfect', file: 0.16, layer: perfect, layerVol: 1.1, wet: 0.42, rate: 0.96, eq: DULL_EQ },
    ][lv];
  if (s === 'wall') return { buf: 'bounce_front', file: 0.14, layer: wall, layerVol: 1.0, wet: 0.4, eq: DULL_EQ };
  return { buf: 'bounce_floor', file: 0.3, layer: floor, layerVol: 0.95, wet: 0.25, eq: DULL_EQ };
}

const VARIANTS: Variant[] = [
  {
    id: '1',
    label: '① 초기 합성음 (M3~M4)',
    desc: '녹음 없이 합성만. 잔향 없음',
    limiter: 'soft',
    master: 0.8,
    room: 'hall',
    floorFull: 22,
    voice: (s, lv) => ({ file: 0, wet: 0, fallback: SYNTH[s === 'racket' ? HIT[lv] : s === 'wall' ? 'bounce_front' : 'bounce_floor'] }),
  },
  {
    id: '2',
    label: '② 첫 배포 소리 (M5, 금속판 녹음)',
    desc: '"가볍고 날카롭다"고 하셨던 소리',
    limiter: 'soft',
    master: 0.8,
    room: 'hall',
    floorFull: 22,
    voice: (s, lv) => {
      if (s === 'racket')
        return [
          { buf: 'm5_hit_soft', file: 0.85, layer: m5Body, layerVol: 0.6, wet: 0.35, rate: 1.05, eq: RACKET_EQ_M5, eqBug: true },
          { buf: 'm5_hit_hard', file: 1, layer: m5Body, layerVol: 0.75, wet: 0.42, rate: 0.97, eq: RACKET_EQ_M5, eqBug: true },
          { buf: 'm5_hit_perfect', file: 1, layer: m5Body, layerVol: 0.95, wet: 0.5, rate: 0.93, eq: RACKET_EQ_M5, eqBug: true },
        ][lv];
      if (s === 'wall') return { buf: 'm5_bounce_front', file: 0.35, layer: m5Wall, layerVol: 1, wet: 0.45, rate: 0.9, eq: [['highpass', 200, 0, 0.7]], eqBug: true };
      return { buf: 'm5_bounce_floor', file: 0.7, wet: 0.3, rate: 1.1 };
    },
  },
  {
    id: '3',
    label: '③ 고무공 1차 (둔탁)',
    desc: '"둔탁해졌는데 경쾌함이 없다"고 하셨던 소리',
    limiter: 'soft',
    master: 0.8,
    room: 'hall',
    floorFull: 22,
    voice: (s, lv) => rubberBank(s, lv, r1Hit, r1Perfect, r1Wall, r1Floor),
  },
  {
    id: '4',
    label: "④ '팡' 1차",
    desc: '세기별 짧은 스냅 추가 (두 번 전 배포)',
    limiter: 'soft',
    master: 0.8,
    room: 'hall',
    floorFull: 22,
    voice: (s, lv) => rubberBank(s, lv, r2Hit, r2Perfect, r2Wall, r2Floor),
  },
  {
    id: '5',
    label: '⑤ 고무공 + 팝 (⑦ 이전 게임 소리)',
    desc: '⑦을 고르시기 전까지 게임에 들어가 있던 소리',
    limiter: 'peak',
    master: 1,
    room: 'hall',
    floorFull: 7.5,
    voice: (s, lv) => {
      if (s === 'racket')
        return [
          { buf: 'hit_soft', file: 0.12, layer: SYNTH.rubber_hit, layerVol: 0.9, wet: 0.24, rate: 1.06, eq: DULL_EQ },
          { buf: 'hit_hard', file: 0.14, layer: SYNTH.rubber_hit, layerVol: 1.0, wet: 0.28, eq: DULL_EQ },
          { buf: 'hit_perfect', file: 0.16, layer: SYNTH.rubber_hit_perfect, layerVol: 0.95, wet: 0.32, rate: 0.96, eq: DULL_EQ },
        ][lv];
      if (s === 'wall') return { buf: 'bounce_front', file: 0.14, layer: SYNTH.rubber_wall, layerVol: 1.0, wet: 0.32, eq: DULL_EQ };
      return { buf: 'bounce_floor', file: 0.3, layer: SYNTH.rubber_floor, layerVol: 0.95, wet: 0.25, eq: DULL_EQ };
    },
  },
  {
    id: '6',
    label: '⑥ 새 후보: 녹음 살리기',
    desc: '현재 합성 + 고무공 녹음을 거의 그대로 크게 (고음 컷 약하게, 잔향 적게)',
    limiter: 'peak',
    master: 1,
    room: 'hall',
    floorFull: 7.5,
    voice: (s, lv) => {
      const eq: Eq[] = [
        ['highpass', 220, 0, 0.7],
        ['highshelf', 4500, -4],
      ];
      if (s === 'racket')
        return { buf: HIT[lv], file: 0.7, eq, wet: 0.18, layer: SYNTH[lv === 2 ? 'rubber_hit_perfect' : 'rubber_hit'], layerVol: 0.55 };
      if (s === 'wall') return { buf: 'bounce_front', file: 0.6, eq, wet: 0.2, layer: SYNTH.rubber_wall, layerVol: 0.55 };
      return { buf: 'bounce_floor', file: 0.65, eq, wet: 0.15, layer: SYNTH.rubber_floor, layerVol: 0.55 };
    },
  },
  {
    id: '7',
    label: '⑦ 실제 경기 매칭 (예전 돔 잔향)',
    desc: "첨부 영상(real_rally) 분석값으로 만든 합성음: 음정 없는 넓은 대역 '탁' + 경기장 잔향 크게",
    limiter: 'peak',
    master: 1,
    room: 'hall',
    floorFull: 7.5,
    voice: (s) => ({ file: 0, wet: 4, fallback: SYNTH[s === 'racket' ? 'match_hit' : s === 'wall' ? 'match_wall' : 'match_floor'] }),
  },
  {
    id: '8',
    label: '⑧ ⑦ + 코트 잔향 — 현재 게임 소리',
    desc: '⑦의 금속성 울림 원인(단발 반사 반복)을 없앤 확산형 코트 잔향, 꼬리는 실제 경기처럼 어둡게',
    limiter: 'peak',
    master: 1,
    room: 'court',
    floorFull: 7.5,
    voice: (s, lv) => sfx.bankVoice(s === 'racket' ? HIT[lv] : s === 'wall' ? 'bounce_front' : 'bounce_floor'),
  },
];

// 실제 랠리 수치로 본 세기 단계: 라켓 = 타구 빠르기, 벽·바닥 = 면에 수직으로 부딪히는 속력(m/s)
const RACKET_PACE = [0.2, 0.6, 1];
const WALL_SPEED = [5, 13, 20];
const FLOOR_SPEED = [2, 4.5, 7];

/** 게임에서 이 상황이 낼 볼륨과 세기 k */
function spec(v: Variant, s: Surface, lv: Level): { voice: Voice; vol: number; k: number } {
  const voice = { room: v.room, ...v.voice(s, lv) };
  if (s === 'racket') {
    const pace = RACKET_PACE[lv];
    return { voice, vol: 0.55 + 0.45 * pace, k: pace };
  }
  const speed = s === 'wall' ? WALL_SPEED[lv] : FLOOR_SPEED[lv];
  const full = s === 'wall' ? tuning.audio.impactFullSpeed.front : v.floorFull;
  return { voice, vol: sfx.speedVol(speed), k: Math.min(1, speed / full) };
}

function play(v: Variant, s: Surface, lv: Level): void {
  sfx.setLimiter(v.limiter);
  const { voice, vol, k } = spec(v, s, lv);
  sfx.playVoice(voice, vol, k, v.master);
}

/** 검증용 (e2e): 버전·면·세기별 오프라인 렌더 */
Object.assign(window as object, {
  __sfxlab: {
    ids: () => VARIANTS.map((v) => v.id),
    render: (id: string, s: Surface, lv: Level) => {
      const v = VARIANTS.find((x) => x.id === id)!;
      const { voice, vol, k } = spec(v, s, lv);
      return sfx.renderVoice(voice, vol, k, v.master, v.limiter);
    },
  },
});

let rallyTimers: number[] = [];
function rally(v: Variant): void {
  rallyTimers.forEach(clearTimeout);
  rallyTimers = [];
  const seq: [number, Surface, Level][] = [];
  ([2, 1, 0] as Level[]).forEach((lv, i) => {
    const t0 = i * 1.35;
    seq.push([t0, 'racket', lv], [t0 + 0.38, 'wall', lv], [t0 + 0.82, 'floor', lv]);
  });
  for (const [t, s, lv] of seq) rallyTimers.push(window.setTimeout(() => play(v, s, lv), t * 1000));
}

export function openSfxLab(onClose: () => void): void {
  const css = document.createElement('style');
  css.textContent = `
.sfxlab{position:fixed;inset:0;z-index:50;overflow:auto;background:rgba(14,10,30,.96);color:#fff;font:14px/1.45 system-ui,sans-serif;padding:16px;text-align:left}
.sfxlab h2{margin:0 0 4px;font-size:20px}.sfxlab p{margin:0 0 12px;opacity:.8}
.sfxlab .lab-top{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:14px}
.sfxlab .lab-row{border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 12px;margin-bottom:10px}
.sfxlab .lab-row b{display:block;font-size:15px;text-align:left}.sfxlab .lab-row small{display:block;opacity:.7;margin-bottom:8px;text-align:left}
.sfxlab .lab-row{display:block}
.sfxlab .lab-btns{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-start}
.sfxlab .lab-grp{display:flex;gap:4px;align-items:center;margin-right:10px}
.sfxlab button{font:inherit;color:#fff;background:#3b2f7a;border:0;border-radius:6px;padding:8px 11px;cursor:pointer;touch-action:manipulation}
.sfxlab button.r{background:#e0563b}.sfxlab button:disabled{opacity:.4}
.sfxlab .lab-lbl{opacity:.75;margin-right:2px}`;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.className = 'sfxlab';
  root.innerHTML = `
<h2>사운드 비교</h2>
<p>각 줄의 버튼으로 같은 상황을 버전별로 들어보세요. 마음에 드는 번호(여러 개면 순위)와, 라켓·벽·바닥 중 어느 쪽이 좋은지 알려주시면 그걸 기준으로 맞춥니다.</p>
<div class="lab-top">
  <button class="r" data-unlock>🔊 소리 켜기</button>
  <span data-status>먼저 소리를 켜 주세요</span>
  <label>잔향 <input type="range" min="0" max="1" step="0.05" data-reverb style="vertical-align:middle"> <span data-rv></span></label>
  <button data-close>게임으로</button>
</div>
<div data-rows></div>`;
  document.body.appendChild(root);
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const reverb0 = tuning.audio.reverb;
  const rv = $<HTMLInputElement>('[data-reverb]');
  rv.value = String(tuning.audio.reverb);
  $('[data-rv]').textContent = rv.value;
  rv.oninput = () => {
    tuning.audio.reverb = Number(rv.value);
    $('[data-rv]').textContent = rv.value;
  };

  const rows = $('[data-rows]');
  const LV = ['약', '중', '강'];
  for (const v of VARIANTS) {
    const row = document.createElement('div');
    row.className = 'lab-row';
    row.innerHTML = `<b>${v.label}</b><small>${v.desc}</small><div class="lab-btns"></div>`;
    const btns = row.querySelector('.lab-btns')!;
    const group = (name: string, s: Surface) => {
      const g = document.createElement('span');
      g.className = 'lab-grp';
      g.innerHTML = `<span class="lab-lbl">${name}</span>`;
      ([0, 1, 2] as Level[]).forEach((lv) => {
        const b = document.createElement('button');
        b.textContent = LV[lv];
        b.disabled = true;
        b.onclick = () => play(v, s, lv);
        g.appendChild(b);
      });
      btns.appendChild(g);
    };
    group('라켓', 'racket');
    group('앞벽', 'wall');
    group('바닥', 'floor');
    const r = document.createElement('button');
    r.className = 'r';
    r.textContent = '▶ 랠리 (강→중→약)';
    r.disabled = true;
    r.onclick = () => rally(v);
    btns.appendChild(r);
    rows.appendChild(row);
  }

  $('[data-unlock]').onclick = async () => {
    sfx.unlock();
    const st = $('[data-status]');
    st.textContent = '불러오는 중…';
    const m5 = (n: string, c: number) => Array.from({ length: c }, (_, i) => `lab/m5_${n}_${i}`);
    for (let i = 0; i < 50 && (!sfx.running || sfx.loaded < 5); i++) await new Promise((r) => setTimeout(r, 100));
    try {
      await Promise.all([
        sfx.loadExtra('m5_hit_soft', m5('hit_soft', 3)),
        sfx.loadExtra('m5_hit_hard', m5('hit_hard', 3)),
        sfx.loadExtra('m5_hit_perfect', m5('hit_perfect', 2)),
        sfx.loadExtra('m5_bounce_front', m5('bounce_front', 2)),
        sfx.loadExtra('m5_bounce_floor', m5('bounce_floor', 3)),
      ]);
      st.textContent = sfx.running ? '준비됨 — 이어폰이나 평소 플레이하는 기기로 들어보세요' : '소리가 아직 막혀 있어요. 한 번 더 눌러 주세요';
    } catch {
      st.textContent = '② 음원을 못 불러왔어요 (나머지는 들을 수 있음)';
    }
    root.querySelectorAll<HTMLButtonElement>('.lab-btns button').forEach((b) => (b.disabled = false));
  };
  $('[data-close]').onclick = () => {
    rallyTimers.forEach(clearTimeout);
    sfx.setLimiter('peak');
    tuning.audio.reverb = reverb0;
    root.remove();
    css.remove();
    onClose();
  };
}
