'use client';

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import Avatar, { getDisplayName } from '@/components/ui/Avatar';
import MobileTopBar, { Wordmark } from '@/components/layout/MobileTopBar';
import NotificationBell from '@/components/layout/NotificationBell';
import { getActiveSection, HEADER_NAV_ITEMS, type AppSection } from '@/components/layout/navigation';
import { playMotion, readCssToken } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

interface NavbarProps {
    session: Session | null;
    onOpenLogin?: () => void;
    /**
     * 모바일(md 미만) 상단 바. 화면마다 <MobileTopBar>로 만들어 넘긴다.
     * 생략하면 워드마크 + 알림(로그아웃 상태면 로그인 버튼), null이면 상단 바를 그리지 않는다.
     */
    mobileTopBar?: ReactNode;
}

// 헤더는 화면마다 새로 그려지므로, 직전 헤더가 내려갈 때 선택 메뉴와 로즈 점의 자리를 여기 기억한다.
// 처음 불러올 때는 비어 있어(null) 움직이지 않는다. left가 null이면 점이 보이지 않았다(선택 없음, 모바일).
let lastIndicator: { section: AppSection | null; left: number | null } | null = null;

// 메뉴를 옮겨 가면 새 점이 직전 점의 자리에서 미끄러져 오고(선택이 없던 화면에서 오면 나타나고),
// 두 메뉴 글자색이 서로 바뀐다. 실제 위치를 재므로 폭·스크롤 막대와 상관없다.
function useNavIndicator(navRef: RefObject<HTMLElement | null>, activeSection: AppSection | null) {
    useLayoutEffect(() => {
        const nav = navRef.current;
        const previous = lastIndicator;
        const dot = nav?.querySelector<HTMLElement>('[data-nav-dot]');
        const dotRect = dot?.getBoundingClientRect();
        if (nav && previous && previous.section !== activeSection && nav.getClientRects().length > 0) {
            const motion = { duration: 'emphasized' as const };
            if (dot && dotRect && dotRect.width > 0) {
                playMotion(
                    dot,
                    previous.left === null
                        ? [{ opacity: 0, transform: 'scale(0.96)', offset: 0 }]
                        : [{ transform: `translateX(${previous.left - dotRect.left}px)`, offset: 0 }],
                    motion,
                );
                playMotion(dot.parentElement, [{ color: readCssToken('--color-ink-muted'), offset: 0 }], motion);
            }
            const previousLink = previous.section
                ? nav.querySelector<HTMLElement>(`[data-nav-section="${previous.section}"]`)
                : null;
            playMotion(previousLink, [{ color: readCssToken('--color-ink'), offset: 0 }], motion);
        }
        return () => {
            const rect = dot?.getBoundingClientRect();
            lastIndicator = { section: activeSection, left: rect && rect.width > 0 ? rect.left : null };
        };
    }, [navRef, activeSection]);
}

export default function Navbar({ session, onOpenLogin, mobileTopBar }: NavbarProps) {
    const pathname = usePathname();
    const activeSection = getActiveSection(pathname);
    const isProfilePage = activeSection === 'profile';
    const navRef = useRef<HTMLElement>(null);
    useNavIndicator(navRef, activeSection);

    const loginButton = onOpenLogin ? (
        <button type="button" onClick={onOpenLogin} className="ui-button-secondary min-h-10 px-4 text-sm">
            로그인
        </button>
    ) : null;

    return (
        <>
            {/* 데스크톱 헤더: 고정하지 않고 투명하게 두어 타이머 무대 색이 그대로 비친다.
                data-shell-header: 화면을 옮길 때 본문만 떠오르고 헤더는 그대로 있게 한다(RouteEnter). */}
            <header data-shell-header="" className="relative z-[5] hidden h-[calc(72px+env(safe-area-inset-top))] w-full grid-cols-[1fr_auto_1fr] items-center gap-6 pt-[env(safe-area-inset-top)] pr-[max(2.5rem,env(safe-area-inset-right))] pl-[max(2.5rem,env(safe-area-inset-left))] md:grid">
                <Wordmark className="justify-self-start" />

                <nav ref={navRef} aria-label="주요 메뉴" className="flex items-center gap-2.5">
                    {HEADER_NAV_ITEMS.map((item) => {
                        const isActive = item.section === activeSection;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? 'page' : undefined}
                                data-nav-section={item.section}
                                className={cn(
                                    'relative flex h-11 items-center justify-center rounded-control px-3.5 text-[15px] transition-colors',
                                    isActive ? 'font-bold text-ink' : 'font-medium text-ink-muted hover:text-ink',
                                )}
                            >
                                {item.label}
                                {isActive ? (
                                    <span data-nav-dot="" aria-hidden="true" className="absolute bottom-[3px] left-1/2 -ml-[2.5px] size-[5px] rounded-full bg-pomo" />
                                ) : null}
                            </Link>
                        );
                    })}
                </nav>

                <div className="flex items-center gap-2 justify-self-end">
                    {session ? (
                        <>
                            <NotificationBell />
                            <Link
                                href="/profile"
                                aria-label="내 프로필"
                                aria-current={isProfilePage ? 'page' : undefined}
                                className="rounded-full"
                            >
                                <Avatar
                                    name={getDisplayName(session.user)}
                                    tone={isProfilePage ? 'solid' : 'tint'}
                                    // 타이머 실행 중에는 페이지가 --header-avatar-bg로 바탕을 바꿀 수 있다.
                                    className={isProfilePage ? undefined : 'bg-[color:var(--header-avatar-bg,var(--color-pomo-tint))] transition-colors duration-(--duration-emphasized)'}
                                />
                            </Link>
                        </>
                    ) : (
                        loginButton
                    )}
                </div>
            </header>

            {mobileTopBar === undefined ? (
                <MobileTopBar
                    start={<Wordmark />}
                    end={session ? <NotificationBell variant="topbar" /> : loginButton}
                />
            ) : (
                mobileTopBar
            )}
        </>
    );
}
