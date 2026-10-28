'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import Avatar, { getDisplayName } from '@/components/ui/Avatar';
import MobileTopBar, { Wordmark } from '@/components/layout/MobileTopBar';
import NotificationBell from '@/components/layout/NotificationBell';
import { getActiveSection, HEADER_NAV_ITEMS } from '@/components/layout/navigation';
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

export default function Navbar({ session, onOpenLogin, mobileTopBar }: NavbarProps) {
    const pathname = usePathname();
    const activeSection = getActiveSection(pathname);
    const isProfilePage = activeSection === 'profile';

    const loginButton = onOpenLogin ? (
        <button type="button" onClick={onOpenLogin} className="ui-button-secondary min-h-10 px-4 text-sm">
            로그인
        </button>
    ) : null;

    return (
        <>
            {/* 데스크톱 헤더: 고정하지 않고 투명하게 두어 타이머 무대 색이 그대로 비친다. */}
            <header className="relative z-[5] hidden h-[calc(72px+env(safe-area-inset-top))] w-full grid-cols-[1fr_auto_1fr] items-center gap-6 pt-[env(safe-area-inset-top)] pr-[max(2.5rem,env(safe-area-inset-right))] pl-[max(2.5rem,env(safe-area-inset-left))] md:grid">
                <Wordmark className="justify-self-start" />

                <nav aria-label="주요 메뉴" className="flex items-center gap-2.5">
                    {HEADER_NAV_ITEMS.map((item) => {
                        const isActive = item.section === activeSection;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                    'relative flex h-11 items-center justify-center rounded-control px-3.5 text-[15px] transition-colors duration-300',
                                    isActive ? 'font-bold text-ink' : 'font-medium text-ink-muted hover:text-ink',
                                )}
                            >
                                {item.label}
                                {isActive ? (
                                    <span aria-hidden="true" className="absolute bottom-[3px] left-1/2 -ml-[2.5px] size-[5px] rounded-full bg-pomo" />
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
                                    className={isProfilePage ? undefined : 'bg-[color:var(--header-avatar-bg,var(--color-pomo-tint))] transition-colors duration-300'}
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
