'use client';

import type { FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Check, Pencil, UserMinus, X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { formatHourMinute, getMemberDisplayName } from './groupUtils';

interface MemberRowProps {
    member: {
        id: string;
        user_id: string;
        nickname: string | null;
        profiles: {
            id: string;
            email: string;
            status: string;
            current_task: string | null;
            last_active_at: string | null;
            study_start_time: string | null;
            total_stopwatch_time: number | null;
        };
    };
    rank: number;
    /** 이번 주 공부 시간(초). 공부·일시정지 중인 몫까지 더한 실시간 값 */
    studyTime: number;
    /** 1위 대비 막대 길이(%) */
    barPercent: number;
    isCurrentUser: boolean;
    /** 이 멤버가 그룹 리더인지 */
    isGroupLeader: boolean;
    /** 리더가 보는 화면이면 오른쪽에 내보내기 칸을 둔다(자기 행은 빈 칸으로 줄을 맞춘다). */
    showKickColumn: boolean;
    editingNickname: boolean;
    tempNickname: string;
    onTempNicknameChange: (value: string) => void;
    onStartEditNickname: () => void;
    onSaveNickname: () => void;
    onCancelEditNickname: () => void;
    onKickMember: () => void;
    onSelectForReport: () => void;
}

const stopPropagation = (event: MouseEvent) => event.stopPropagation();

function getStatus(profile: MemberRowProps['member']['profiles']) {
    const task = profile.current_task?.trim();
    if (profile.status === 'studying') {
        return { dot: 'bg-pomo', text: task ? `공부 중 · ${task}` : '공부 중' };
    }
    if (profile.status === 'paused') {
        return { dot: 'bg-away', text: task ? `일시정지 · ${task}` : '일시정지' };
    }
    if (profile.status === 'online') {
        return { dot: 'bg-rest', text: '접속 중' };
    }
    const lastActive = profile.last_active_at ? new Date(profile.last_active_at) : null;
    return {
        dot: 'bg-bead-past',
        text: lastActive && !Number.isNaN(lastActive.getTime())
            ? `오프라인 · ${formatDistanceToNow(lastActive, { addSuffix: true, locale: ko })}`
            : '오프라인',
    };
}

// 그룹 순위의 한 줄: 순위 · 아바타 · 이름(나/리더, 지금 상태) + 1위 대비 막대 · 이번 주 시:분.
// 줄을 누르면 그 멤버의 오늘 리포트가 열린다.
export default function MemberRow({
    member,
    rank,
    studyTime,
    barPercent,
    isCurrentUser,
    isGroupLeader,
    showKickColumn,
    editingNickname,
    tempNickname,
    onTempNicknameChange,
    onStartEditNickname,
    onSaveNickname,
    onCancelEditNickname,
    onKickMember,
    onSelectForReport,
}: MemberRowProps) {
    const displayName = getMemberDisplayName(member);
    const status = getStatus(member.profiles);

    const handleNicknameSubmit = (event: FormEvent) => {
        event.preventDefault();
        onSaveNickname();
    };

    const handleNicknameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            onCancelEditNickname();
        }
    };

    // 보드는 content-box라 최소 높이에 위아래 여백이 더해진다: 모바일 56+6×2=68px, 데스크톱 62+8×2=78px.
    return (
        <li
            onClick={editingNickname ? undefined : onSelectForReport}
            className={cn(
                'flex min-h-[68px] items-center gap-3 rounded-tile px-2 py-1.5 transition-colors md:min-h-[78px] md:gap-4 md:px-3 md:py-2',
                !editingNickname && 'cursor-pointer',
                isCurrentUser ? 'bg-surface' : 'hover:bg-hover',
            )}
        >
            <span
                className={cn(
                    'w-[22px] shrink-0 font-display text-[17px] leading-none font-bold md:w-8 md:text-xl',
                    rank === 1 ? 'text-pomo' : 'text-ink-muted',
                )}
            >
                {rank}
            </span>
            <Avatar
                name={displayName}
                tone={isCurrentUser ? 'solid' : 'tint'}
                className="size-[34px] text-[13px] md:size-9 md:text-sm"
            />

            <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:gap-[7px]">
                {editingNickname ? (
                    <form onSubmit={handleNicknameSubmit} onClick={stopPropagation} className="flex min-w-0 items-center gap-1">
                        <input
                            type="text"
                            value={tempNickname}
                            onChange={(e) => onTempNicknameChange(e.target.value)}
                            onKeyDown={handleNicknameKeyDown}
                            className="ui-input min-h-9 w-full max-w-60 flex-1 rounded-chip px-3 text-sm"
                            aria-label="내 닉네임"
                            placeholder="닉네임"
                            autoFocus
                        />
                        <button type="submit" aria-label="닉네임 저장" className="ui-icon-button text-rest">
                            <Check aria-hidden="true" size={18} strokeWidth={2} />
                        </button>
                        <button type="button" onClick={onCancelEditNickname} aria-label="닉네임 수정 취소" className="ui-icon-button text-ink-muted">
                            <X aria-hidden="true" size={18} strokeWidth={2} />
                        </button>
                    </form>
                ) : (
                    <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelectForReport();
                            }}
                            className={cn(
                                'min-w-0 truncate rounded-sm text-left text-sm md:text-[15px]',
                                isCurrentUser ? 'font-bold' : 'font-semibold',
                            )}
                            title={displayName}
                        >
                            {displayName}
                            <span className="sr-only"> 리포트 보기</span>
                        </button>
                        {isCurrentUser && (
                            <span className="shrink-0 rounded-md bg-pomo-tint px-1.5 py-px text-[11px] font-bold text-pomo md:px-[7px] md:py-0.5">
                                나
                            </span>
                        )}
                        {isGroupLeader && (
                            <span className="shrink-0 text-[11px] font-semibold text-ink-muted md:text-xs">리더</span>
                        )}
                        {isCurrentUser && (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onStartEditNickname();
                                }}
                                // 44px 누름 영역. 줄 높이는 음수 여백으로 그대로 둔다. 옅은 글자라 포커스 링은 먹색.
                                className="ui-icon-button ui-focus-ink -my-[11px] size-11 text-ink-faint hover:text-ink"
                                aria-label="닉네임 수정"
                            >
                                <Pencil aria-hidden="true" size={14} strokeWidth={1.8} />
                            </button>
                        )}
                        <span className="flex min-w-0 flex-1 basis-0 items-center gap-1.5 text-xs text-ink-muted">
                            <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', status.dot)} />
                            <span className="truncate">{status.text}</span>
                        </span>
                    </div>
                )}
                <span aria-hidden="true" className="block h-[5px] overflow-hidden rounded-full bg-surface md:h-1.5">
                    <span
                        className={cn('block h-full rounded-full', isCurrentUser ? 'bg-pomo' : 'bg-bar')}
                        style={{ width: `${barPercent}%` }}
                    />
                </span>
            </div>

            <span className="shrink-0 text-right text-sm font-bold md:w-[88px] md:text-[15px]">
                {formatHourMinute(studyTime)}
            </span>

            {showKickColumn && (
                isCurrentUser ? (
                    <span aria-hidden="true" className="size-10 shrink-0" />
                ) : (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onKickMember();
                        }}
                        className="ui-icon-button text-ink-muted hover:text-pomo-deep"
                        aria-label={`${displayName}님 내보내기`}
                        title="멤버 내보내기"
                    >
                        <UserMinus aria-hidden="true" size={18} strokeWidth={1.8} />
                    </button>
                )
            )}
        </li>
    );
}
