'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stopActivationKeys, stopAllKeys } from '@/components/ui/keyBoundary';
import { usePlayOnce } from '@/components/ui/usePlayOnce';
import { useShell } from './ShellProvider';

type NotificationBellProps = {
  /** header: 데스크톱 헤더(아이콘 21px), topbar: 모바일 상단 바(아이콘 20px) */
  variant?: 'header' | 'topbar';
  className?: string;
};

// 알림 종 + 팝오버. 지금 앱에 실제로 있는 알림(받은 친구 요청)만 보여 준다.
export default function NotificationBell({ variant = 'header', className }: NotificationBellProps) {
  const { friendRequestCount, friendRequestPulse } = useShell();
  const [open, setOpen] = useState(false);
  // 이 종이 그려진 뒤 새 요청이 오면 점이 한 번 톡 튄다. 화면을 옮겨 종을 새로 그리거나 처음 불러올 때는 튀지 않는다.
  // 데스크톱 헤더와 모바일 상단 바의 종은 함께 그려지고 너비에 따라 한쪽만 보인다. 튄 뒤에는(숨은 쪽은 돌 것이 없어 바로)
  // 기준을 그 요청으로 옮겨, 너비가 바뀌어 다른 쪽 종이 보여도 다시 튀지 않는다.
  const [quietPulse, setQuietPulse] = useState(friendRequestPulse);
  const dotRef = useRef<HTMLSpanElement>(null);
  const hasRequests = friendRequestCount > 0;
  usePlayOnce(hasRequests && friendRequestPulse !== quietPulse ? friendRequestPulse : null, dotRef, setQuietPulse);
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
              // 새 요청마다 새로 붙여 팝을 다시 재생한다.
              key={friendRequestPulse}
              ref={dotRef}
              aria-hidden="true"
              className={cn(
                'absolute size-[7px] rounded-full bg-pomo',
                isHeader ? 'top-2 right-[9px]' : 'top-[9px] right-2.5',
                friendRequestPulse !== quietPulse && 'animate-pop-in',
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
