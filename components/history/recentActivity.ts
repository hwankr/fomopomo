import type { BeadState } from '@/components/ui/Beads';
import { getDayStart } from '@/lib/dateUtils';
import { countPomodorosByStudyDay, getStudyDayKey, type PomodoroSessionRow } from '@/lib/pomodoroCounts';

/** 최근 7일 집계에 쓰는 study_sessions 열 */
export type RecentSessionRow = PomodoroSessionRow & { id: number; duration: number };

export type RecentDay = {
  /** 'yyyy-MM-dd' 공부일 키 */
  key: string;
  /** 그 공부일의 시작(05:00) */
  start: Date;
  /** 요일 한 글자(일·월·…) */
  weekday: string;
  isToday: boolean;
};

export type RecentActivitySummary = {
  days: (RecentDay & { pomodoros: number })[];
  weekPomodoros: number;
  todaySeconds: number;
  todayPomodoros: number;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const RECENT_DAY_COUNT = 7;
/** 7일 기록에서 하루 기둥에 쌓는 최대 구슬 수(디자인 보드 기준) */
export const WEEK_BEAD_CAP = 8;

/** 오늘을 마지막으로 하는 최근 7개 공부일(05:00 경계), 오래된 날부터. */
export function getRecentStudyDays(now: Date): RecentDay[] {
  const todayStart = getDayStart(now);
  return Array.from({ length: RECENT_DAY_COUNT }, (_, index) => {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - (RECENT_DAY_COUNT - 1 - index));
    return {
      key: getStudyDayKey(start),
      start,
      weekday: WEEKDAYS[start.getDay()],
      isToday: index === RECENT_DAY_COUNT - 1,
    };
  });
}

/**
 * 7일 집계 조회의 시작 시각. 첫 공부일 05:00 경계에 걸친 배치의 이른 조각까지 읽어야
 * 그 배치를 원래 공부일(창 밖)로 돌릴 수 있으므로 하루 더 앞에서 읽는다.
 */
export function getRecentQueryStart(now: Date): Date {
  const start = new Date(getRecentStudyDays(now)[0].start);
  start.setDate(start.getDate() - 1);
  return start;
}

/**
 * 최근 7일의 공부일별 뽀모도로 수와 오늘의 집중 시간·뽀모도로 수.
 * 뽀모도로는 lib/pomodoroCounts의 공통 규칙(배치 1개 = 1개, 가장 이른 조각의 공부일)으로 세고,
 * 집중 시간은 통계 화면처럼 각 행을 created_at이 속한 공부일에 더한다(스톱워치 포함).
 */
export function summarizeRecentActivity(rows: readonly RecentSessionRow[], now: Date): RecentActivitySummary {
  const days = getRecentStudyDays(now);
  const today = days[days.length - 1];
  const counts = countPomodorosByStudyDay(rows);
  const withCounts = days.map(day => ({ ...day, pomodoros: counts.get(day.key) ?? 0 }));
  const todaySeconds = rows.reduce((sum, row) => {
    const createdAt = new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime()) || getStudyDayKey(createdAt) !== today.key) return sum;
    return sum + Math.max(0, row.duration);
  }, 0);

  return {
    days: withCounts,
    weekPomodoros: withCounts.reduce((sum, day) => sum + day.pomodoros, 0),
    todaySeconds,
    todayPomodoros: counts.get(today.key) ?? 0,
  };
}

/** 하루 기둥의 구슬: 오늘은 모드 색, 지난 날은 회색, 0개인 날은 빈 구슬 하나. */
export function getWeekBeadStates(pomodoros: number, isToday: boolean): BeadState[] {
  if (pomodoros <= 0) return ['empty'];
  return Array.from({ length: Math.min(pomodoros, WEEK_BEAD_CAP) }, () => (isToday ? 'done' : 'past'));
}

/** 25 → "25분", 65 → "1시간 5분", 120 → "2시간" */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

/** 기록 길이(초). 1분 미만은 초로 보여 준다. */
export function formatRecordDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return total < 60 ? `${total}초` : formatMinutes(total / 60);
}

export function formatTodaySummary(summary: Pick<RecentActivitySummary, 'todaySeconds' | 'todayPomodoros'>): string {
  return `오늘 ${formatMinutes(summary.todaySeconds / 60)} 집중, 뽀모도로 ${summary.todayPomodoros}개`;
}

const isSameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** 기록 시각: 오늘 "21:05", 어제 "어제 21:05", 그 전 "10/26 21:05"(달력 날짜 기준) */
export function formatRecordTime(createdAt: Date, now: Date): string {
  const time = `${createdAt.getHours()}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
  if (isSameDate(createdAt, now)) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDate(createdAt, yesterday)) return `어제 ${time}`;
  return `${createdAt.getMonth() + 1}/${createdAt.getDate()} ${time}`;
}
