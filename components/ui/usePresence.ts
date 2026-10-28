'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { getRunningAnimations, prefersReducedMotion, whenAnimationsFinish } from './motion';

type PresenceState = { open: boolean; mounted: boolean; key: number };

/**
 * 닫힐 때 퇴장 애니메이션이 끝날 때까지 요소를 남겨 둔다(docs/design-system.md §8).
 * - 열면 바로 `mounted`. 닫으면 `closing`이 되고, 그동안 요소에 `data-state="closed"`를 붙여 퇴장 애니메이션을 건다.
 * - `ref` 요소(와 그 안)에서 도는 유한한 애니메이션이 끝나면 내린다. 애니메이션이 없거나(동작 줄이기, 테스트 환경,
 *   퇴장 애니메이션을 정하지 않음) 끝나지 않아도 기다리지 않는다: 없으면 같은 커밋에서, 멈췄으면 최대 1초 뒤.
 * - 닫히는 중에 다시 열면 `key`가 바뀐다. 내용을 `key`로 새로 그리면 이전 내용이 남거나 겹치지 않는다.
 */
export function usePresence<T extends Element = HTMLDivElement>(open: boolean) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<PresenceState>({ open, mounted: open, key: open ? 1 : 0 });
  let current = state;
  if (state.open !== open) {
    current = open ? { open, mounted: true, key: state.key + 1 } : { ...state, open };
    setState(current);
  }
  const closing = current.mounted && !current.open;
  const { key } = current;

  useLayoutEffect(() => {
    if (!closing) return;
    const unmount = () => setState((previous) => (
      previous.key === key && !previous.open ? { ...previous, mounted: false } : previous
    ));
    const animations = prefersReducedMotion() ? [] : getRunningAnimations([ref.current], { subtree: true });
    return whenAnimationsFinish(animations, unmount);
  }, [closing, key]);

  return { ref, mounted: current.mounted, closing, key };
}
