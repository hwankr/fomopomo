'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, LayoutGrid, Timer, User, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getActiveSection, type AppSection } from './navigation';
import { useShell } from './ShellProvider';

const TABS: { section: AppSection; href: string; label: string; Icon: LucideIcon }[] = [
  { section: 'timer', href: '/', label: '타이머', Icon: Timer },
  { section: 'plan', href: '/plan', label: '계획', Icon: Calendar },
  { section: 'friends', href: '/friends', label: '친구', Icon: Users },
  { section: 'groups', href: '/groups', label: '그룹', Icon: LayoutGrid },
  { section: 'profile', href: '/profile', label: '프로필', Icon: User },
];

// 모바일(md 미만) 하단 탭 바. 탭에 해당하는 화면에서만 보이고,
// 같은 높이의 빈 칸을 함께 두어 페이지 끝(푸터 포함)이 가려지지 않게 한다.
export default function MobileTabBar() {
  const pathname = usePathname();
  const active = getActiveSection(pathname);
  const { friendRequestCount } = useShell();

  if (!active) return null;

  return (
    <>
      <div aria-hidden="true" className="h-(--tabbar-height) shrink-0 md:hidden" />
      <nav
        aria-label="주요 메뉴"
        className={cn(
          // ui-scroll-lock-fixed: 선택 상자가 페이지 스크롤바를 숨기는 동안에도 넓어지지 않는다.
          'ui-scroll-lock-fixed fixed inset-x-0 bottom-0 z-40 flex bg-white px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)] md:hidden',
          // 흰 페이지에서는 아주 옅은 선으로 내용과 나눈다(타이머는 흰 시트와 이어진다).
          active !== 'timer' && 'shadow-[inset_0_1px_0_var(--color-line-soft)]',
        )}
      >
        {TABS.map(({ section, href, label, Icon }) => {
          const isActive = section === active;
          const showRequestDot = section === 'friends' && friendRequestCount > 0;
          return (
            <Link
              key={section}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              aria-label={showRequestDot ? `${label}, 받은 친구 요청 ${friendRequestCount}개` : undefined}
              className={cn(
                // 비활성 탭 글자색(ink-faint)은 링으로 쓰기엔 옅으므로 링은 먹색으로 둔다.
                'ui-focus-ink flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] leading-none',
                isActive ? 'font-bold text-ink' : 'font-medium text-ink-faint',
              )}
            >
              <span className="relative">
                <Icon aria-hidden="true" size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                {showRequestDot ? (
                  <span aria-hidden="true" className="absolute -top-0.5 -right-1 size-[7px] rounded-full bg-pomo" />
                ) : null}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
