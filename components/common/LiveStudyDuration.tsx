'use client';

import { useState, useEffect } from 'react';
import { getDayStart } from '@/lib/dateUtils';

interface LiveStudyDurationProps {
    /** ISO string of when study started */
    studyStartTime: string | null;
    /** Already saved seconds for today (from study_sessions) */
    savedSeconds?: number;
    /** Whether to show saved + live combined */
    showSavedTime?: boolean;
    /** Custom class name */
    className?: string;
}

/**
 * Displays real-time study duration that updates every second.
 * Handles cross-midnight scenarios by only counting time from today.
 */
export function LiveStudyDuration({
    studyStartTime,
    savedSeconds = 0,
    showSavedTime = false,
    className = '',
}: LiveStudyDurationProps) {
    const [displayTime, setDisplayTime] = useState('');

    useEffect(() => {
        if (!studyStartTime) {
            // No active session, show saved time only if requested
            if (showSavedTime && savedSeconds > 0) {
                setDisplayTime(formatDuration(savedSeconds));
            } else {
                setDisplayTime('0분');
            }
            return;
        }

        const update = () => {
            const now = Date.now();
            const startTime = new Date(studyStartTime).getTime();

            // Handle day reset at 5 AM: only count time from start of study day
            const dayStart = getDayStart();
            const dayStartMs = dayStart.getTime();

            // If study started before today's reset time, count from reset time
            const effectiveStart = Math.max(startTime, dayStartMs);

            // Calculate live elapsed seconds
            let liveSeconds = Math.floor((now - effectiveStart) / 1000);
            if (liveSeconds < 0) liveSeconds = 0;

            // Total = saved + live
            const totalSeconds = showSavedTime ? savedSeconds + liveSeconds : liveSeconds;

            setDisplayTime(formatDuration(totalSeconds));
        };

        update();
        const interval = setInterval(update, 1000);

        return () => clearInterval(interval);
    }, [studyStartTime, savedSeconds, showSavedTime]);

    return <span className={className}>{displayTime}</span>;
}

/**
 * Format seconds into human-readable duration
 */
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}시간 ${minutes}분`;
    }
    if (minutes > 0) {
        return `${minutes}분 ${secs.toString().padStart(2, '0')}초`;
    }
    return `${secs}초`;
}

/**
 * Compact format: MM:SS or H:MM:SS
 */
export function formatDurationCompact(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Hook version for more control
 */
export function useLiveStudyDuration(
    studyStartTime: string | null,
    savedSeconds: number = 0,
    includesSaved: boolean = false
): number {
    const [totalSeconds, setTotalSeconds] = useState(0);

    useEffect(() => {
        if (!studyStartTime) {
            setTotalSeconds(includesSaved ? savedSeconds : 0);
            return;
        }

        const update = () => {
            const now = Date.now();
            const startTime = new Date(studyStartTime).getTime();

            const dayStart = getDayStart();
            const dayStartMs = dayStart.getTime();

            const effectiveStart = Math.max(startTime, dayStartMs);
            let liveSeconds = Math.floor((now - effectiveStart) / 1000);
            if (liveSeconds < 0) liveSeconds = 0;

            setTotalSeconds(includesSaved ? savedSeconds + liveSeconds : liveSeconds);
        };

        update();
        const interval = setInterval(update, 1000);

        return () => clearInterval(interval);
    }, [studyStartTime, savedSeconds, includesSaved]);

    return totalSeconds;
}

export default LiveStudyDuration;
