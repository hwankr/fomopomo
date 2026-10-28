export type AppSection = 'timer' | 'plan' | 'friends' | 'groups' | 'profile';

export const HEADER_NAV_ITEMS: { section: AppSection; href: string; label: string }[] = [
  { section: 'timer', href: '/', label: '타이머' },
  { section: 'plan', href: '/plan', label: '계획' },
  { section: 'friends', href: '/friends', label: '친구' },
  { section: 'groups', href: '/groups', label: '그룹' },
];

const matches = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

// 경로에서 현재 주요 메뉴를 찾는다. 설정·약관·관리자 페이지는 어느 메뉴에도 속하지 않는다.
export function getActiveSection(pathname: string | null): AppSection | null {
  if (!pathname) return null;
  if (pathname === '/') return 'timer';
  if (matches(pathname, '/plan')) return 'plan';
  if (matches(pathname, '/friends')) return 'friends';
  if (matches(pathname, '/groups')) return 'groups';
  if (matches(pathname, '/profile')) return 'profile';
  return null;
}

// 모바일 하단 탭 바는 탭에 해당하는 화면에서만 보여 준다.
export function isTabBarRoute(pathname: string | null) {
  return getActiveSection(pathname) !== null;
}
