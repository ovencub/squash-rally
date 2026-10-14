/** 타입드 이벤트 버스. 렌더/오디오/FX는 시뮬레이션 이벤트를 구독만 한다. */
export class EventBus<M extends Record<string, unknown>> {
  private handlers: { [K in keyof M]?: ((e: M[K]) => void)[] } = {};

  on<K extends keyof M>(type: K, fn: (e: M[K]) => void): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => {
      this.handlers[type] = this.handlers[type]!.filter((f) => f !== fn);
    };
  }

  emit<K extends keyof M>(type: K, e: M[K]): void {
    for (const fn of this.handlers[type] ?? []) fn(e);
  }
}
