'use client';

import { useEffectEvent, useLayoutEffect, useState, type RefObject } from 'react';
import { getRunningAnimations, prefersReducedMotion, whenAnimationsFinish } from './motion';

/**
 * 사용자 동작의 피드백(animate-* 클래스, 한 번 켜는 전환)을 그 동작마다 한 번만 재생하게 한다(docs/design-system.md §8).
 * 클래스를 남겨 두면 행이 옮겨질 때(실시간으로 순서가 바뀜)나 숨겨 둔 패널이 다시 보일 때 CSS 애니메이션이 처음부터 다시 돈다.
 * `marker`가 있는 동안 `ref` 안에서 도는 유한한 애니메이션이 끝나면 `onPlayed(marker)`를 부르고, 거기서 표시를 지운다
 * (지금 표시가 그 marker일 때만). marker가 바뀌면 이전 것을 기다리던 일은 버리고 새 요소의 애니메이션을 다시 모은다.
 * 도는 애니메이션이 없으면(동작 줄이기, 테스트 환경) 바로, 끝 소식이 없으면 최대 1초 뒤에 부른다.
 * `ref`가 아직 붙지 않았으면(포털 내용) 같은 작업이 끝난 뒤 한 번 더 보고 모은다. 도는 중에 노드가 옮겨져 애니메이션이
 * 처음부터 다시 시작하면 그것이 끝날 때까지 기다린다(중간에 끊지 않는다).
 */
export function usePlayOnce<T>(
  marker: T | null,
  ref: RefObject<Element | null>,
  onPlayed: (marker: T) => void,
) {
  const played = useEffectEvent(onPlayed);

  useLayoutEffect(() => {
    if (marker === null) return;
    let active = true;
    let cancel = () => {};
    const running = () => (prefersReducedMotion() ? [] : getRunningAnimations([ref.current], { subtree: true }));
    const settle = (animations: Animation[], retry: boolean) => {
      cancel = whenAnimationsFinish(animations, () => {
        if (!active) return;
        // 도는 중에 노드가 옮겨지면 CSS 애니메이션은 취소되고 처음부터 다시 시작한다. 그것까지 한 번 더 기다린다.
        // (숨겨져 취소됐으면 다시 도는 것이 없으므로 바로 뗀다.)
        const restarted = retry && animations.some((animation) => animation.playState === 'idle')
          ? running().filter((animation) => !animations.includes(animation))
          : [];
        if (restarted.length) settle(restarted, false);
        else played(marker);
      });
    };
    const wait = () => {
      if (active) settle(running(), true);
    };
    // 포털 안의 내용(팝오버)은 이 커밋 바로 뒤에 붙는다. 붙은 뒤(마이크로태스크)에 모은다.
    if (ref.current) wait();
    else queueMicrotask(wait);
    return () => {
      active = false;
      cancel();
    };
  }, [marker, ref]);
}

/**
 * 닫혀 있던 것이 열릴 때(`openKey`가 새 값으로 바뀔 때)만 true를 돌려준다. 그동안 등장 클래스를 붙이면
 * 한 번 돈 뒤 떨어지므로, 열린 채로 다시 그리거나 옮겨지거나 다시 보여도 되풀이되지 않는다.
 * 열 때마다 새 번호를 표시로 쓰므로, A의 등장이 끝나기 전에 B를 열어도 A가 끝나거나 취소되면서 B의 등장을 지우지 않는다.
 * 처음부터 열려 있던 것은 움직이지 않는다.
 */
export function useEntrance(openKey: string | boolean | null, ref: RefObject<Element | null>) {
  const [opening, setOpening] = useState({ key: openKey, nonce: 0, entering: false });
  if (opening.key !== openKey) {
    setOpening({ key: openKey, nonce: opening.nonce + 1, entering: Boolean(openKey) });
  }
  const marker = opening.entering ? opening.nonce : null;
  usePlayOnce(marker, ref, (played) => setOpening((current) => (
    current.nonce === played ? { ...current, entering: false } : current
  )));
  return marker !== null;
}
