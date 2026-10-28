'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { playMotion } from '@/components/ui/motion';

/** 화면을 옮겨도 그대로 있어야 해서 등장 애니메이션에서 빼는 머리(데스크톱 헤더·모바일 상단 바). Navbar·MobileTopBar가 붙인다. */
export const SHELL_HEADER_ATTRIBUTE = 'data-shell-header';

const HEADER_SELECTOR = `[${SHELL_HEADER_ATTRIBUTE}]`;
// 화면들이 로그인 확인·데이터를 불러오는 동안 그리는 표시
const LOADING_SELECTOR = '[role="status"], [aria-busy="true"]';
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK']);

// 화면이 처음엔 불러오는 중 표시만 그리고 곧 본문(머리 포함)을 그리는 경우, 본문이 붙기를 기다리는 시간
const READY_WINDOW_MS = 1500;

// 앱을 처음 그린(서버 렌더 + 하이드레이션) 뒤에만 true가 된다. 서버에서는 늘 false다.
let hasRendered = false;

/**
 * 화면 등장에서 움직일 요소들: 머리를 품지 않은 가장 큰 덩어리들(머리의 형제, 머리를 품은 조상의 형제 …), 문서 순서.
 * 머리가 없으면 화면의 최상위 요소들. 서로 겹치지 않는다(어느 것도 다른 것의 조상이 아니다).
 */
export function getRouteEnterTargets(root: Element) {
  const onHeaderPath = new Set<Element>();
  for (const header of Array.from(root.querySelectorAll(HEADER_SELECTOR))) {
    for (let node: Element | null = header; node && node !== root; node = node.parentElement) onHeaderPath.add(node);
  }
  const targets: HTMLElement[] = [];
  const visit = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (child.matches(HEADER_SELECTOR)) continue;
      if (onHeaderPath.has(child)) visit(child);
      else if (child instanceof HTMLElement && !SKIPPED_TAGS.has(child.tagName)) targets.push(child);
    }
  };
  visit(root);
  return targets;
}

/**
 * 화면(경로 첫 단계)이 바뀌어 새 화면이 붙을 때 머리 아래 본문을 한 번 살짝 떠오르게 한다(투명 → 불투명, 6px 위로, --duration-enter).
 * 화면들은 먼저 불러오는 중 표시를 그리므로, 그 표시만 있는 동안은 기다렸다가 머리가 붙는 순간(화면이 준비된 순간) 재생한다.
 * 이미 움직인 요소와 그 안은 다시 움직이지 않는다. 먼저 움직인 덩어리가 나중에 머리를 품게 되면(불러오는 중 상자가
 * 화면 틀로 다시 쓰일 때) 그리기 전에 그 움직임을 멈추고 머리 바깥 덩어리만 움직인다. 머리는 어떤 경우에도 움직이지 않는다.
 * app/template.tsx가 감싸므로 같은 화면 안의 상태·검색어 변화, 타이머·실시간 갱신에는 다시 돌지 않는다.
 * 처음 불러올 때는 움직이지 않고, 스타일이 아니라 Web Animation으로만 움직이므로 JS가 늦거나
 * 동작 줄이기 설정이면 내용은 처음부터 그대로 보인다. 래퍼는 display: contents라 레이아웃에 끼지 않는다.
 */
export default function RouteEnter({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isNavigation] = useState(() => hasRendered);

  useLayoutEffect(() => {
    hasRendered = true;
    const root = ref.current;
    if (!isNavigation || !root) return;
    // 움직인 요소 → 그 애니메이션들(끝난 뒤에도 남겨 두어 같은 요소와 그 안을 다시 움직이지 않는다)
    const moved = new Map<Element, (Animation | null)[]>();
    const play = () => {
      for (const [element, animations] of moved) {
        if (element.isConnected && !element.querySelector(HEADER_SELECTOR)) continue;
        animations.forEach((animation) => animation?.cancel());
        moved.delete(element);
      }
      for (const target of getRouteEnterTargets(root)) {
        if (Array.from(moved.keys()).some((element) => element.contains(target))) continue;
        moved.set(target, [
          playMotion(target, [{ opacity: 0, offset: 0 }]),
          // 요소에 이미 있는 transform 위에 더한다.
          playMotion(target, [{ transform: 'translateY(6px)', offset: 0 }], { composite: 'add' }),
        ]);
      }
    };

    let played = false;
    // 머리가 붙었으면 true(더 기다릴 것 없음)
    const playWhenReady = () => {
      const hasHeader = root.querySelector(HEADER_SELECTOR) !== null;
      if (!played && !hasHeader && root.querySelector(LOADING_SELECTOR)) return false;
      if (!played || hasHeader) play();
      played = true;
      return hasHeader;
    };

    let observer: MutationObserver | null = null;
    let timer = 0;
    const stopWaiting = () => {
      observer?.disconnect();
      window.clearTimeout(timer);
    };
    // MutationObserver는 커밋 직후(그리기 전) 불리므로 본문이 다 보인 채로 한 프레임 깜빡이지 않는다.
    if (!playWhenReady() && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        if (playWhenReady()) stopWaiting();
      });
      observer.observe(root, { childList: true, subtree: true });
      timer = window.setTimeout(stopWaiting, READY_WINDOW_MS);
    }

    return () => {
      stopWaiting();
      moved.forEach((animations) => animations.forEach((animation) => animation?.cancel()));
    };
  }, [isNavigation]);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
