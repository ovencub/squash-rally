import { type FaultReason } from '../rules/rally';

/** 판정 텍스트 (기획서 3-4 판정 연출). 룰을 모르는 사람도 이걸로 배운다. */
export const REASON_TEXT: Record<FaultReason, { title: string; desc: string }> = {
  OUT: { title: 'OUT!', desc: '벽 위쪽 아웃 라인에 닿거나 넘어갔어요' },
  TIN: { title: 'TIN!', desc: '앞벽 아래 틴(양철판)에 맞았어요' },
  DOWN: { title: 'DOWN!', desc: '앞벽에 닿기 전에 바닥에 떨어졌어요' },
  DOUBLE_BOUNCE: { title: 'DOUBLE BOUNCE', desc: '바닥에 두 번 튀기 전에 치지 못했어요' },
  FAULT: { title: 'FAULT', desc: '서브는 서비스 라인 위를 맞고, 반대편 뒤 사각형에 떨어져야 해요' },
};

/** AI 대전 판정 설명: 누가 실점했는지에 따라 */
export function matchReasonText(reason: FaultReason, loserIsMe: boolean): string {
  const who = loserIsMe ? '내' : 'AI';
  switch (reason) {
    case 'DOUBLE_BOUNCE':
      return loserIsMe ? '두 번 튀기 전에 치지 못했어요' : 'AI가 공을 놓쳤어요';
    case 'OUT':
      return `${who} 공이 아웃 라인에 닿았어요`;
    case 'TIN':
      return `${who} 공이 틴에 맞았어요`;
    case 'DOWN':
      return `${who} 공이 앞벽 전에 바닥에 떨어졌어요`;
    case 'FAULT':
      return `${who} 서브가 실패했어요`;
  }
}
