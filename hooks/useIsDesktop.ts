'use client';

import { useSyncExternalStore } from 'react';

// docs/design-system.md의 단일 중단점(md, 768px)
const DESKTOP_QUERY = '(min-width: 768px)';

const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

const subscribe = (onChange: () => void) => {
  if (!canMatch()) return () => {};
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const getSnapshot = () => canMatch() && window.matchMedia(DESKTOP_QUERY).matches;

// md(768px) 이상은 데스크톱 보드, 미만은 모바일 보드. 팝오버↔시트처럼
// CSS만으로 바꿀 수 없는 구조(포커스 처리, 구슬 크기)를 고를 때 쓴다. 서버 렌더에서는 모바일로 본다.
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
