'use client';

import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useShell } from './ShellProvider';

// 종과 팝오버의 키 입력이 window의 전역 단축키(타이머의 Space 등)로 새지 않게 막는다.
// 버튼의 기본 Space/Enter 동작과 Radix의 Escape(document 캡처 단계)는 그대로 동작한다.
const isolateKeys = (event: KeyboardEvent<HTMLElement>) => event.stopPropagation();

type NotificationBellProps = {
  /** header: 데스크톱 헤더(아이콘 21px), topbar: 모바일 상단 바(아이콘 20px) */
  variant?: 'header' | 'topbar';
  className?: string;
};

// 알림 종 + 팝오버. 지금 앱에 실제로 있는 알림(받은 친구 요청)만 보여 준다.
export default function NotificationBell({ variant = 'header', className }: NotificationBellProps) {
  const { friendRequestCount } = useShell();
  const [open, setOpen] = useState(false);
  const hasRequests = friendRequestCount > 0;
  const isHeader = variant === 'header';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={hasRequests ? `알림 ${friendRequestCount}개` : '알림'}
          aria-haspopup={undefined}
          onKeyDown={isolateKeys}
          className={cn('ui-icon-button', className)}
        >
          <Bell aria-hidden="true" size={isHeader ? 21 : 20} strokeWidth={1.8} />
          {hasRequests ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute size-[7px] rounded-full bg-pomo',
                isHeader ? 'top-2 right-[9px]' : 'top-[9px] right-2.5',
              )}
            />
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="region"
          aria-label="알림"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          onKeyDown={isolateKeys}
          className="ui-popover ui-popover-surface z-50 w-[300px] max-w-[calc(100vw-24px)] outline-none md:w-80"
        >
          {hasRequests ? (
            <Link
              href="/friends"
              onClick={() => setOpen(false)}
              className="block rounded-control px-3 py-2.5 text-sm text-ink transition-colors hover:bg-hover"
            >
              받은 친구 요청이 {friendRequestCount}개 있어요.
            </Link>
          ) : (
            <p className="m-0 px-3 py-2.5 text-sm text-ink-muted">새 알림이 없어요.</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
