import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type MobileTopBarProps = {
  /** 왼쪽 칸: 워드마크, 화면 제목, 달 넘기기, 뒤로 가기 등 */
  start?: ReactNode;
  /** 가운데 칸. 주면 3칸 격자(뒤로 · 제목 · 동작)로 바뀐다. */
  center?: ReactNode;
  /** 오른쪽 칸: 알림 종, 아이콘 버튼, 저장 등 */
  end?: ReactNode;
  /** 스크롤해도 위에 붙어 있게(흰 바탕). 기본은 페이지와 함께 스크롤된다. */
  sticky?: boolean;
  className?: string;
};

// 모바일(md 미만) 상단 바. 높이 44px + 위쪽 안전 영역, 배경은 투명(타이머 무대 색이 비친다).
export default function MobileTopBar({ start, center, end, sticky = false, className }: MobileTopBarProps) {
  const hasCenter = center !== undefined && center !== null;

  return (
    <div
      // 화면을 옮길 때 본문만 떠오르고 상단 바는 그대로 있게 한다(RouteEnter).
      data-shell-header=""
      className={cn(
        'relative z-[5] h-[calc(44px+env(safe-area-inset-top))] w-full pt-[env(safe-area-inset-top)] md:hidden',
        hasCenter
          ? 'grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3'
          : 'flex items-center justify-between gap-2 pr-4 pl-5',
        sticky && 'sticky top-0 z-30 bg-white',
        className,
      )}
    >
      {hasCenter ? (
        <>
          <div className="flex min-w-0 items-center justify-self-start">{start}</div>
          <div className="min-w-0 text-center">{center}</div>
          <div className="flex min-w-0 items-center justify-self-end">{end}</div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-1">{start}</div>
          {end ? <div className="flex shrink-0 items-center gap-0.5">{end}</div> : null}
        </>
      )}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn('text-xl font-extrabold tracking-[-0.02em] text-pomo no-underline', className)}
    >
      Fomopomo
    </Link>
  );
}

type TopBarTitleProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 제목 글자 크기 조정(예: 프로필은 text-xl) */
  titleClassName?: string;
};

// 친구·그룹·프로필 상단 바의 제목(22px/800) + 회색 부제(13px).
export function TopBarTitle({ title, subtitle, titleClassName }: TopBarTitleProps) {
  return (
    <div className="flex min-w-0 items-baseline gap-2.5">
      <h1 className={cn('m-0 shrink-0 text-[22px] font-extrabold tracking-[-0.02em]', titleClassName)}>{title}</h1>
      {subtitle ? <span className="min-w-0 truncate text-[13px] text-ink-muted">{subtitle}</span> : null}
    </div>
  );
}
