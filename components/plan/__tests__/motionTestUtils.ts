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

function createAnimation() {
  let resolve!: () => void;
  const animation = {
    playState: 'running' as AnimationPlayState,
    currentTime: 0,
    finished: new Promise<void>((done) => { resolve = done; }),
    // 끝 소식을 기다리는 최대 시간(1초)까지 테스트가 이어지도록 길게 둔다.
    effect: { getTiming: () => ({ iterations: 1 }), getComputedTiming: () => ({ endTime: 60_000 }) },
  };
  return {
    animation: animation as unknown as Animation,
    finish: () => {
      animation.playState = 'finished';
      resolve();
    },
  };
}
