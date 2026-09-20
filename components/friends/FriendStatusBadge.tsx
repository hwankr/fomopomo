'use client';

import { useLiveStudyDuration, formatDurationCompact } from '@/components/common/LiveStudyDuration';

interface FriendCardStatusProps {
    status: 'online' | 'offline' | 'studying' | 'paused' | null;
    task: string | null;
    studyStartTime: string | null;
    totalStopwatchTime?: number | null;
    dailyStudyTime?: number; // 당일 누적 공부 시간 (초)
}

/**
 * Real-time status badge for friend card
 * Displays live studying duration when friend is studying
 * Now includes daily accumulated study time like group page
 */
export function FriendStatusBadge({ status, task, studyStartTime, totalStopwatchTime, dailyStudyTime = 0 }: FriendCardStatusProps) {
    // Track live time with saved daily time when actively studying
    const liveSeconds = useLiveStudyDuration(
        status === 'studying' ? studyStartTime : null,
        dailyStudyTime,
        true // include saved daily time
    );

    // For paused state: show daily time + current stopwatch time
    const pausedSeconds = dailyStudyTime + (totalStopwatchTime || 0);

    // Determine what time to display
    const displaySeconds = status === 'studying' 
        ? liveSeconds 
        : status === 'paused' 
            ? pausedSeconds 
            : dailyStudyTime;

    // Format elapsed time for display
    const formatTime = (seconds: number) => {
        if (seconds <= 0) return '';
        return ` ${formatDurationCompact(seconds)}`;
    };

    switch (status) {
        case 'studying':
            return (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    <span className="min-w-0 truncate" title={`공부 중${formatTime(displaySeconds)}${task ? ` • ${task}` : ''}`}>
                        공부 중{formatTime(displaySeconds)}
                        {task ? ` • ${task}` : ''}
                    </span>
                </span>
            );
        case 'paused':
            return (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="min-w-0 truncate" title={`일시정지${formatTime(displaySeconds)}${task ? ` • ${task}` : ''}`}>
                        일시정지{formatTime(displaySeconds)}
                        {task ? ` • ${task}` : ''}
                    </span>
                </span>
            );
        case 'online':
            return (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="min-w-0 truncate" title={`온라인${dailyStudyTime > 0 ? formatTime(dailyStudyTime) : ''}`}>
                        온라인{dailyStudyTime > 0 ? formatTime(dailyStudyTime) : ''}
                    </span>
                </span>
            );
        default:
            return (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-gray-400" />
                    <span className="min-w-0 truncate" title={`오프라인${dailyStudyTime > 0 ? formatTime(dailyStudyTime) : ''}`}>
                        오프라인{dailyStudyTime > 0 ? formatTime(dailyStudyTime) : ''}
                    </span>
                </span>
            );
    }
}

