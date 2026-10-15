import type { DataConnection, Peer as PeerType } from 'peerjs';
import { type PlayerId } from '../rules/rally';
import { PROTOCOL_VERSION, type NetMsg, type OnlineLink } from './protocol';

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

  /** 방 만들기: 친구가 들어오면 onOpen */
  static async host(code = makeRoomCode()): Promise<OnlineSession> {
    const s = new OnlineSession('host', code);
    const { Peer } = await import('peerjs');
    await new Promise<void>((resolve, reject) => {
      const peer = new Peer(PREFIX + code, { debug: 0 });
      s.peer = peer;
      peer.on('open', () => resolve());
      peer.on('error', (e) => reject(e));
      peer.on('connection', (conn) => {
        if (s.conn) {
          conn.close(); // 이미 상대가 있음
          return;
        }
        s.attach(conn);
      });
    });
    return s;
  }

  /** 코드로 참가 */
  static async join(code: string): Promise<OnlineSession> {
    const s = new OnlineSession('guest', code);
    const { Peer } = await import('peerjs');
    await new Promise<void>((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      s.peer = peer;
      const timer = setTimeout(() => reject(new Error('timeout')), 15000);
      peer.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        s.attach(conn);
        conn.on('open', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    });
    return s;
  }

  private attach(conn: DataConnection): void {
    this.conn = conn;
    conn.on('open', () => {
      this.send({ t: 'hello', v: PROTOCOL_VERSION });
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 1000);
      this.onOpen();
    });
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
    try {
      this.conn?.close();
      this.peer?.destroy();
    } catch {
      /* 무시 */
    }
  }
}
