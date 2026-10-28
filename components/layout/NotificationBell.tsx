'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stopActivationKeys, stopAllKeys } from '@/components/ui/keyBoundary';
import { useShell } from './ShellProvider';

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
          // 종을 여는 Enter·Space가 window 전역 단축키(타이머 Space)로 새지 않게 막는다.
          onKeyDown={stopActivationKeys}
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
          onKeyDown={stopAllKeys}
          // 보드는 content-box(너비 300/320 + 안쪽 8px)이므로 바깥 너비 316/336px로 맞춘다.
          className="ui-popover ui-popover-surface z-50 w-[316px] max-w-[calc(100vw-24px)] outline-none md:w-[336px]"
        >
          {hasRequests ? (
            <Link
              // 친구 화면의 받은 요청 탭으로 바로 간다.
              href="/friends?tab=requests"
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
