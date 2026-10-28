'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDayStart } from '@/lib/dateUtils';

interface LiveStudyDurationProps {
  studyStartTime: string | null;
  savedSeconds?: number;
  showSavedTime?: boolean;
  className?: string;
}

/**
 * 지금 진행 중인 공부가 since(기본: 오늘 공부일 시작) 이후로 쌓은 초.
 * 공부일·공부주 경계 전에 시작했으면 경계부터 센다.
 */
export function getLiveSeconds(
  studyStartTime: string,
  since: Date = getDayStart(),
  now: number = Date.now()
): number {
  const startTime = new Date(studyStartTime).getTime();
  const effectiveStart = Math.max(startTime, since.getTime());
  return Math.max(0, Math.floor((now - effectiveStart) / 1000));
}

function calculateLiveSeconds(studyStartTime: string): number {
  return getLiveSeconds(studyStartTime);
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

/** 시:분(예: 2:05). 친구 순위처럼 초가 필요 없는 누적 시간에 쓴다. */
export function formatHoursMinutes(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * active인 동안 1초마다 바뀌는 지금 시각(ms). 여러 줄의 실시간 시간을 한 시계로 맞춰
 * 계산할 때 쓴다(예: 친구 순위 정렬). active가 아니면 마지막 값에서 멈춘다.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }

    const update = () => {
      setNow(Date.now());
    };

    update();
    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, [active]);

  return now;
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
