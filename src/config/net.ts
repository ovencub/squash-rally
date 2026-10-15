// 온라인 대전 연결 설정.
// STUN: 각자의 공인 주소를 알아내 브라우저끼리 직접 연결 (무료 공개 서버).
// TURN: 직접 연결이 막힌 네트워크(일부 모바일 데이터·회사/학교 와이파이)에서 데이터를 대신 전달하는 중계 서버.
//       계정이 필요한 서비스라 비어 있으면 STUN만 쓴다. 발급받으면 아래 TURN_SERVERS에 넣는다.

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export const TURN_SERVERS: RTCIceServer[] = [
  // 예: { urls: ['turn:<host>:80', 'turn:<host>:443?transport=tcp', 'turns:<host>:443'], username: '<user>', credential: '<pass>' },
];

export const ICE_SERVERS: RTCIceServer[] = [...STUN_SERVERS, ...TURN_SERVERS];

export const NET = {
  /** 참가: 방을 못 찾으면 다시 시도 (방장 쪽이 잠깐 재연결 중일 수 있음) */
  joinRetries: 4,
  joinRetryMs: 2500,
  /** 이 시간 안에 방장이 응답(answer)하지 않으면 그 시도는 "방 없음" */
  answerTimeoutMs: 6000,
  /** 방장은 응답했는데 이 시간 안에 연결이 안 열리면 네트워크가 막힌 것으로 판단 */
  connectTimeoutMs: 15000,
};
