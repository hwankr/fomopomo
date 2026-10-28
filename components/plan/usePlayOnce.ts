'use client';

import { useEffectEvent, useLayoutEffect, useState, type RefObject } from 'react';
import { getRunningAnimations, prefersReducedMotion, whenAnimationsFinish } from '@/components/ui/motion';

/**
 * 방금 한 동작의 움직임(animate-* 클래스, 한 번 켜는 전환)을 한 번만 재생하게 한다(docs/design-system.md §8).
 * 클래스를 남겨 두면 행이 옮겨질 때(실시간으로 순서가 바뀜)나 숨겨 둔 패널이 다시 보일 때 CSS 애니메이션이 처음부터 다시 돈다.
 * `marker`가 있는 동안 `ref` 안에서 도는 유한한 애니메이션이 끝나면 `onPlayed(marker)`를 부르고, 거기서 표시를 지운다.
 * 도는 애니메이션이 없으면(동작 줄이기, 테스트 환경) 바로, 끝 소식이 없으면 최대 1초 뒤에 부른다.
 */
export function usePlayOnce<T>(
  marker: T | null,
  ref: RefObject<Element | null>,
  onPlayed: (marker: T) => void,
) {
  const played = useEffectEvent(onPlayed);

  useLayoutEffect(() => {
    if (marker === null) return;
    const animations = prefersReducedMotion() ? [] : getRunningAnimations([ref.current], { subtree: true });
    return whenAnimationsFinish(animations, () => played(marker));
  }, [marker, ref]);
}

/**
 * 닫혀 있던 것이 열릴 때(`openKey`가 새 값으로 바뀔 때)만 true를 돌려준다. 그동안 등장 클래스를 붙이면
 * 한 번 돈 뒤 떨어지므로, 열린 채로 다시 그리거나 옮겨지거나 다시 보여도 되풀이되지 않는다.
 * 처음부터 열려 있던 것은 움직이지 않는다.
 */
export function useEntrance(openKey: string | boolean | null, ref: RefObject<Element | null>) {
  const [shownKey, setShownKey] = useState(openKey);
  const [entering, setEntering] = useState(false);
  if (shownKey !== openKey) {
    setShownKey(openKey);
    setEntering(Boolean(openKey));
  }
  usePlayOnce(entering || null, ref, () => setEntering(false));
  return entering;
}
