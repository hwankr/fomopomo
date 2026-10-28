'use client';

import { useSyncExternalStore } from 'react';

// docs/design-system.md의 단일 중단점(md, 768px)
const DESKTOP_QUERY = '(min-width: 768px)';

const getQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null);

const subscribe = (onChange: () => void) => {
  const query = getQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
};

/** md 이상(데스크톱 보드)인지. 서버 렌더에서는 모바일로 본다. */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, () => getQuery()?.matches ?? true, () => false);
}
