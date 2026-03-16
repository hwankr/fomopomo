'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDayStart } from '@/lib/dateUtils';

interface LiveStudyDurationProps {
  studyStartTime: string | null;
  savedSeconds?: number;
  showSavedTime?: boolean;
  className?: string;
}

function calculateLiveSeconds(studyStartTime: string): number {
  const now = Date.now();
  const startTime = new Date(studyStartTime).getTime();
  const dayStartMs = getDayStart().getTime();
  const effectiveStart = Math.max(startTime, dayStartMs);
  return Math.max(0, Math.floor((now - effectiveStart) / 1000));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  if (minutes > 0) {
    return `${minutes}분${secs.toString().padStart(2, '0')}초`;
  }
  return `${secs}초`;
}

export function formatDurationCompact(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function useLiveStudyDuration(
  studyStartTime: string | null,
  savedSeconds = 0,
  includesSaved = false
): number {
  const [liveSeconds, setLiveSeconds] = useState(0);

  useEffect(() => {
    if (!studyStartTime) {
      return;
    }

    const update = () => {
      setLiveSeconds(calculateLiveSeconds(studyStartTime));
    };

    update();
    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, [studyStartTime]);

  const baseSeconds = includesSaved ? savedSeconds : 0;
  return studyStartTime ? baseSeconds + liveSeconds : baseSeconds;
}

export function LiveStudyDuration({
  studyStartTime,
  savedSeconds = 0,
  showSavedTime = false,
  className = '',
}: LiveStudyDurationProps) {
  const totalSeconds = useLiveStudyDuration(
    studyStartTime,
    savedSeconds,
    showSavedTime
  );
  const displayTime = useMemo(
    () => formatDuration(totalSeconds),
    [totalSeconds]
  );

  return <span className={className}>{displayTime}</span>;
}

export default LiveStudyDuration;
