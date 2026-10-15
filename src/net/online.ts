import type { DataConnection, Peer as PeerType } from 'peerjs';
import { type PlayerId } from '../rules/rally';
import { ICE_SERVERS, NET } from '../config/net';
import { PROTOCOL_VERSION, type NetMsg, type OnlineLink } from './protocol';

/** 참가 실패 이유: 방 없음 / 네트워크가 직접 연결을 막음 / 연결 서버 문제 */
export class JoinError extends Error {
  constructor(
    readonly kind: 'not-found' | 'blocked' | 'server',
    detail: string,
  ) {
    super(`${kind}: ${detail}`);
  }
}

// 온라인 1:1 연결 (WebRTC P2P). 서로 찾는 데만 PeerJS 공개 중계 서버를 쓰고, 게임 데이터는 브라우저끼리 직접 주고받는다.
// 방 코드 6자리 → PeerJS ID "squash-rally-<코드>". 호스트 = 선수 A, 참가자 = 선수 B.

const PREFIX = 'squash-rally-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O/1/I 제외

export function makeRoomCode(): string {
  let s = '';
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (const n of buf) s += CODE_CHARS[n % CODE_CHARS.length];
  return s;
}

export function roomLink(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}?room=${code}`;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

type Handler = (m: NetMsg) => void;

export class OnlineSession implements OnlineLink {
  readonly me: PlayerId;
  private peer: PeerType | null = null;
  private conn: DataConnection | null = null;
  private handlers: Handler[] = [];
  private rtt = 120; // ms, 측정 전 추정값
  private pingTimer = 0;
  onClose: (reason: string) => void = () => {};
  onOpen: () => void = () => {};

  private constructor(
    readonly role: 'host' | 'guest',
    readonly code: string,
  ) {
    this.me = role === 'host' ? 'A' : 'B';
  }

  /** 방장 연결 상태 (대기 화면 표시용) */
  onStatus: (st: 'ready' | 'reconnecting') => void = () => {};

  /** 방 만들기: 친구가 들어오면 onOpen */
  static async host(code = makeRoomCode()): Promise<OnlineSession> {
    const s = new OnlineSession('host', code);
    const { Peer } = await import('peerjs');
    await new Promise<void>((resolve, reject) => {
      const peer = new Peer(PREFIX + code, { debug: 1, config: { iceServers: ICE_SERVERS } });
      s.peer = peer;
      let opened = false;
      peer.on('open', () => {
        opened = true;
        s.onStatus('ready');
        resolve();
      });
      peer.on('error', (e) => {
        if (!opened) reject(new JoinError('server', String(e.type ?? e)));
        else console.warn('[online] host error', e.type);
      });
      peer.on('connection', (conn) => {
        if (s.conn) {
          conn.close(); // 이미 상대가 있음
          return;
        }
        s.attach(conn);
      });
      // 연결 서버와 끊기면(휴대폰에서 다른 앱으로 전환 등) 방이 사라지므로 같은 코드로 다시 등록
      peer.on('disconnected', () => {
        if (s.destroyed || s.conn?.open) return;
        s.onStatus('reconnecting');
        s.scheduleReconnect();
      });
      peer.on('open', () => s.onStatus('ready'));
    });
    s.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && s.peer?.disconnected && !s.destroyed) s.scheduleReconnect(0);
    };
    document.addEventListener('visibilitychange', s.visibilityHandler);
    return s;
  }

  private reconnectTimer = 0;
  private visibilityHandler: (() => void) | null = null;
  private destroyed = false;

  private scheduleReconnect(delay = 800): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      if (this.destroyed || !this.peer || !this.peer.disconnected) return;
      try {
        this.peer.reconnect();
      } catch {
        /* 다음 기회에 */
      }
      // 아직 안 붙었으면 계속 시도
      this.reconnectTimer = window.setTimeout(() => this.peer?.disconnected && this.scheduleReconnect(2000), 3000);
    }, delay);
  }

  /** 코드로 참가. 실패하면 JoinError(kind: not-found | blocked | server) */
  static async join(code: string, onAttempt: (n: number) => void = () => {}): Promise<OnlineSession> {
    const s = new OnlineSession('guest', code);
    const { Peer } = await import('peerjs');
    const peer = new Peer({ debug: 1, config: { iceServers: ICE_SERVERS } });
    s.peer = peer;
    await new Promise<void>((resolve, reject) => {
      peer.on('open', () => resolve());
      peer.on('error', (e) => reject(new JoinError('server', String(e.type ?? e))));
      setTimeout(() => reject(new JoinError('server', 'signal-timeout')), 12000);
    });
    for (let attempt = 1; attempt <= NET.joinRetries; attempt++) {
      onAttempt(attempt);
      const result = await s.tryConnect(peer, code);
      if (result === 'ok') return s;
      if (result === 'blocked') {
        s.destroy();
        throw new JoinError('blocked', 'ice');
      }
      await new Promise((r) => setTimeout(r, NET.joinRetryMs)); // not-found → 잠시 후 재시도
    }
    s.destroy();
    throw new JoinError('not-found', 'peer-unavailable');
  }

  /** 한 번 연결 시도: ok / not-found(방 없음) / blocked(방은 있는데 직접 연결 실패) */
  private tryConnect(peer: PeerType, code: string): Promise<'ok' | 'not-found' | 'blocked'> {
    return new Promise((resolve) => {
      let done = false;
      const timers: number[] = [];
      const finish = (r: 'ok' | 'not-found' | 'blocked') => {
        if (done) return;
        done = true;
        peer.off('error', onErr);
        timers.forEach((t) => clearTimeout(t));
        resolve(r);
      };
      const onErr = (e: { type?: string }) => {
        if (e.type === 'peer-unavailable') finish('not-found');
      };
      peer.on('error', onErr);
      const conn = peer.connect(PREFIX + code, { reliable: true });
      const pc = (conn as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
      // 방장이 응답(answer)했는가 = 방이 존재하는가. 응답이 없으면 "방 없음", 응답 후 연결 실패면 "막힘"
      const answered = () => !!pc?.remoteDescription;
      const timer = window.setTimeout(() => {
        if (!answered()) {
          conn.close();
          finish('not-found');
        }
      }, NET.answerTimeoutMs);
      const iceTimer = window.setTimeout(() => {
        conn.close();
        finish(answered() ? 'blocked' : 'not-found');
      }, NET.connectTimeoutMs);
      timers.push(timer, iceTimer);
      conn.on('open', () => {
        this.attach(conn, true);
        finish('ok');
      });
      // ICE 실패를 빨리 알아채기
      pc?.addEventListener('iceconnectionstatechange', () => {
        if (pc.iceConnectionState === 'failed') {
          conn.close();
          finish('blocked');
        }
      });
    });
  }

  private attach(conn: DataConnection, alreadyOpen = false): void {
    this.conn = conn;
    const opened = () => {
      this.send({ t: 'hello', v: PROTOCOL_VERSION });
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 1000);
      this.onOpen();
    };
    if (alreadyOpen) opened();
    else conn.on('open', opened);
    conn.on('data', (d) => this.dispatch(d as NetMsg));
    conn.on('close', () => this.closed('상대와 연결이 끊어졌어요'));
    conn.on('error', () => this.closed('연결 오류가 났어요'));
  }

  private dispatch(m: NetMsg): void {
    if (m.t === 'ping') return this.send({ t: 'pong', ts: m.ts });
    if (m.t === 'pong') {
      const r = performance.now() - m.ts;
      this.rtt = this.rtt * 0.7 + r * 0.3;
      return;
    }
    if (m.t === 'bye') return this.closed('상대가 대전을 나갔어요');
    for (const h of this.handlers) h(m);
  }

  on(h: Handler): () => void {
    this.handlers.push(h);
    return () => (this.handlers = this.handlers.filter((x) => x !== h));
  }

  send(m: NetMsg): void {
    if (this.conn?.open) this.conn.send(m);
  }

  latencyMs(): number {
    return this.rtt / 2;
  }

  get pingMs(): number {
    return Math.round(this.rtt);
  }

  private closedOnce = false;
  private closed(reason: string): void {
    if (this.closedOnce) return;
    this.closedOnce = true;
    clearInterval(this.pingTimer);
    this.onClose(reason);
    this.destroy();
  }

  /** 대전 나가기 */
  leave(): void {
    this.send({ t: 'bye' });
    this.closedOnce = true;
    clearInterval(this.pingTimer);
    setTimeout(() => this.destroy(), 200);
  }

  private destroy(): void {
    this.destroyed = true;
    clearTimeout(this.reconnectTimer);
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
    try {
      this.conn?.close();
      this.peer?.destroy();
    } catch {
      /* 무시 */
    }
  }
}
