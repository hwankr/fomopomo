import { cn } from '@/lib/utils';

export type FriendStatus = 'online' | 'offline' | 'studying' | 'paused' | null;

type StatusKey = NonNullable<FriendStatus>;

const STATUS_WORD: Record<StatusKey, string> = {
    studying: '공부 중',
    paused: '일시정지',
    online: '접속 중',
    offline: '오프라인',
};

const STATUS_DOT: Record<StatusKey, string> = {
    studying: 'bg-pomo',
    paused: 'bg-away',
    online: 'bg-rest',
    offline: 'bg-bead-past',
};

interface FriendStatusBadgeProps {
    status: FriendStatus;
    task?: string | null;
    className?: string;
}

/**
 * 친구 순위 이름 아래의 상태 줄: 색 점 + 상태 말(회색) + 공부 중·일시정지일 때 지금 하는 작업.
 * 실시간 시간은 순위의 오늘·이번 주 칸이 보여 준다.
 */
export function FriendStatusBadge({ status, task, className }: FriendStatusBadgeProps) {
    const key: StatusKey = status ?? 'offline';
    const currentTask = key === 'studying' || key === 'paused' ? task?.trim() : null;

    return (
        <span className={cn('flex min-w-0 items-center gap-1.5 text-xs text-ink-muted md:gap-2 md:text-[13px]', className)}>
            {/* 실시간으로 바뀌는 상태는 색만 부드럽게 바뀐다(움직임 없음). */}
            <span aria-hidden="true" className={cn('size-[7px] shrink-0 rounded-full transition-colors md:size-2', STATUS_DOT[key])} />
            <span className="shrink-0">{STATUS_WORD[key]}</span>
            {currentTask ? (
                <span className="min-w-0 truncate" title={currentTask}>
                    {currentTask}
                </span>
            ) : null}
        </span>
    );
}
