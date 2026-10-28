import { act } from '@testing-library/react';

/**
 * happy-dom에는 애니메이션이 없어 usePlayOnce가 표시를 바로 뗀다. 애니메이션이 도는 동안을 흉내 낸다:
 * 모든 요소가 아직 끝나지 않은 애니메이션 하나를 돌리고 있고, `finish()`가 그것을 끝낸다.
 * 그 뒤의 동작은 새 애니메이션을 받는다. `restore()`로 되돌린다.
 */
export function simulateRunningAnimations() {
  let current = createAnimation();
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value: () => [current.animation],
  });
  return {
    async finish() {
      const previous = current;
      current = createAnimation();
      await act(async () => previous.finish());
    },
    restore() {
      delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    },
  };
}

/**
 * 브라우저의 CSS 애니메이션처럼 요소마다 따로 돈다: `animate-*` 클래스가 있고 보이는 요소는 애니메이션 하나를 돌리고,
 * 숨겨지면(`hidden` 조상, 또는 `isHidden`이 true) 취소되며(playState idle, finished 거부), 클래스가 남은 채 다시 보이면
 * 처음부터 새로 돈다. 끝난 애니메이션은 클래스를 떼었다 다시 붙이거나 숨겼다 보일 때까지 다시 돌지 않는다.
 * 숨기거나 보인 뒤 `await sync()`로 그 변화를 반영한다(취소·새로 시작). `flush()`는 같은 일을 곧바로 하고 기다리지 않는다
 * (브라우저가 스타일을 다시 계산했지만 그 취소 소식을 받은 스크립트가 아직 돌지 않은 때: 숨김 → 계산 → 같은 작업 안에서 다시 보임).
 * `started(element)`는 그 요소에서 시작한 횟수.
 */
export function simulateCssAnimations({
  isHidden = (element: Element) => element.closest('[hidden]') !== null,
}: { isHidden?: (element: Element) => boolean } = {}) {
  const records = new Map<Element, ReturnType<typeof createAnimation> & { done: boolean }>();
  const starts = new Map<Element, number>();
  const animates = (element: Element) => [...element.classList].some((name) => name.startsWith('animate-'));
  const playing = (element: Element) => element.isConnected && animates(element) && !isHidden(element);

  const reconcile = (element: Element) => {
    const record = records.get(element);
    if (record && !playing(element)) {
      records.delete(element);
      if (!record.done) record.cancel();
    }
    if (!records.has(element) && playing(element)) {
      records.set(element, { ...createAnimation(), done: false });
      starts.set(element, (starts.get(element) ?? 0) + 1);
    }
    const current = records.get(element);
    return current && !current.done ? [current.animation] : [];
  };

  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value(this: Element, options?: { subtree?: boolean }) {
      const elements = [this, ...(options?.subtree ? this.querySelectorAll('*') : [])];
      return elements.flatMap(reconcile);
    },
  });

  const flush = () => {
    [...records.keys()].forEach(reconcile);
    document.querySelectorAll('*').forEach(reconcile);
  };

  return {
    /** 숨김·클래스·연결이 바뀐 것을 반영한다: 멈출 것은 취소하고, 새로 보이는 것은 시작한다. */
    async sync() {
      await act(async () => flush());
    },
    flush,
    /** 요소의(없으면 전부) 도는 애니메이션을 끝낸다. */
    async finish(element?: Element) {
      await act(async () => {
        records.forEach((record, target) => {
          if (record.done || (element && target !== element)) return;
          record.done = true;
          record.finish();
        });
      });
    },
    isRunning: (element: Element) => {
      const record = records.get(element);
      return Boolean(record && !record.done);
    },
    started: (element: Element) => starts.get(element) ?? 0,
    restore() {
      delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    },
  };
}

function createAnimation() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const animation = {
    playState: 'running' as AnimationPlayState,
    currentTime: 0,
    finished: new Promise<void>((done, fail) => { resolve = done; reject = fail; }),
    // 끝 소식을 기다리는 최대 시간(1초)까지 테스트가 이어지도록 길게 둔다.
    effect: { getTiming: () => ({ iterations: 1 }), getComputedTiming: () => ({ endTime: 60_000 }) },
  };
  // 아무도 기다리지 않는 취소가 처리되지 않은 거부로 남지 않게 한다.
  animation.finished.catch(() => undefined);
  return {
    animation: animation as unknown as Animation,
    finish: () => {
      animation.playState = 'finished';
      resolve();
    },
    cancel: () => {
      animation.playState = 'idle';
      reject(new DOMException('The animation was cancelled', 'AbortError'));
    },
  };
}
