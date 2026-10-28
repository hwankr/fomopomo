'use client';

import { useState } from 'react';
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
  const { friendRequestCount, friendRequestPulse } = useShell();
  // 탭 바가 보이는 동안 새 요청이 오면 친구 탭의 점이 한 번 톡 튄다. 처음 불러올 때, 화면을 옮길 때,
  // 탭 바가 없는 화면(설정 등)에 있는 동안 온 요청은 튀지 않는다. 점이 없는 동안에는 기준을 지금 값으로 맞춘다.
  const [quietPulse, setQuietPulse] = useState(friendRequestPulse);
  if ((!active || friendRequestCount === 0) && quietPulse !== friendRequestPulse) setQuietPulse(friendRequestPulse);

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
                // 고른 탭의 글자·아이콘 색은 살짝 바뀌고, 누르는 동안 줄어든다.
                'ui-focus-ink ui-press flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] leading-none transition-[color,scale]',
                isActive ? 'font-bold text-ink' : 'font-medium text-ink-faint',
              )}
            >
              <span className="relative">
                <Icon aria-hidden="true" size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                {showRequestDot ? (
                  <span
                    // 새 요청마다 새로 붙여 팝을 다시 재생한다.
                    key={friendRequestPulse}
                    aria-hidden="true"
                    className={cn(
                      'absolute -top-0.5 -right-1 size-[7px] rounded-full bg-pomo',
                      friendRequestPulse !== quietPulse && 'animate-pop-in',
                    )}
                  />
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
