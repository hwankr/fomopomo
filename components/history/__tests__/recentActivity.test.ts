import { describe, expect, it } from 'vitest';
import {
  formatMinutes,
  formatRecordDuration,
  formatRecordTime,
  formatTodaySummary,
  getRecentQueryStart,
  getRecentStudyDays,
  getWeekBeadStates,
  summarizeRecentActivity,
  WEEK_BEAD_CAP,
  type RecentSessionRow,
} from '../recentActivity';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
let nextId = 1;
const row = (createdAt: Date, overrides: Partial<RecentSessionRow> = {}): RecentSessionRow => ({
  id: nextId++, mode: 'pomo', duration: 1500, created_at: createdAt.toISOString(), ...overrides,
});

describe('getRecentStudyDays', () => {
  it('오늘을 마지막으로 05:00 공부일 7개를 오래된 날부터 돌려준다', () => {
    const days = getRecentStudyDays(at(28, 21, 40));
    expect(days.map(day => day.key)).toEqual([
      '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28',
    ]);
    expect(days.map(day => day.weekday).join('')).toBe('목금토일월화수');
    expect(days[0].start).toEqual(at(22, 5));
    expect(days.filter(day => day.isToday).map(day => day.key)).toEqual(['2026-10-28']);
  });

  it('새벽 5시 전에는 전날을 오늘로 본다', () => {
    const days = getRecentStudyDays(at(29, 3));
    expect(days[6].key).toBe('2026-10-28');
  });
});

describe('summarizeRecentActivity', () => {
  it('배치마다 한 번, 가장 이른 조각의 공부일에 뽀모도로를 센다', () => {
    const rows = [
      // 05:00 경계를 넘긴 한 번의 집중: 이른 조각이 어제 공부일 → 어제 1개
      row(at(28, 4, 50), { duration: 600, session_batch_id: 'split' }),
      row(at(28, 5, 15), { duration: 900, session_batch_id: 'split' }),
      row(at(28, 9)),
      row(at(28, 10), { mode: 'focus', group_id: 'legacy' }),
      row(at(28, 11), { mode: 'stopwatch', duration: 1200 }),
      row(at(25, 20)),
    ];
    const summary = summarizeRecentActivity(rows, at(28, 21));
    expect(summary.days.map(day => day.pomodoros)).toEqual([0, 0, 0, 1, 0, 1, 2]);
    expect(summary.weekPomodoros).toBe(4);
    expect(summary.todayPomodoros).toBe(2);
    // 집중 시간은 조각마다 created_at의 공부일에 더하고 스톱워치도 포함한다(05:15 900 + 1500 + 1500 + 1200).
    expect(summary.todaySeconds).toBe(900 + 1500 + 1500 + 1200);
    expect(formatTodaySummary(summary)).toBe('오늘 1시간 25분 집중, 뽀모도로 2개');
  });

  it('첫 공부일 경계에 걸친 배치는 이른 조각의 날(창 밖)로 돌려 세지 않는다', () => {
    const now = at(28, 21);
    expect(getRecentQueryStart(now)).toEqual(at(21, 5));
    const rows = [
      row(at(22, 4, 50), { duration: 600, session_batch_id: 'edge' }),
      row(at(22, 5, 10), { duration: 900, session_batch_id: 'edge' }),
    ];
    expect(summarizeRecentActivity(rows, now).days[0].pomodoros).toBe(0);
  });

  it('기록이 없으면 모든 날이 0이다', () => {
    const summary = summarizeRecentActivity([], at(28, 12));
    expect(summary.days).toHaveLength(7);
    expect(summary.weekPomodoros).toBe(0);
    expect(formatTodaySummary(summary)).toBe('오늘 0분 집중, 뽀모도로 0개');
  });
});

describe('getWeekBeadStates', () => {
  it('오늘은 모드 색, 지난 날은 회색, 0개는 빈 구슬 하나이고 상한을 넘지 않는다', () => {
    expect(getWeekBeadStates(0, true)).toEqual(['empty']);
    expect(getWeekBeadStates(0, false)).toEqual(['empty']);
    expect(getWeekBeadStates(3, true)).toEqual(['done', 'done', 'done']);
    expect(getWeekBeadStates(2, false)).toEqual(['past', 'past']);
    expect(getWeekBeadStates(20, false)).toHaveLength(WEEK_BEAD_CAP);
  });
});

describe('formatting', () => {
  it('분을 시간·분으로 쓴다', () => {
    expect(formatMinutes(25)).toBe('25분');
    expect(formatMinutes(65)).toBe('1시간 5분');
    expect(formatMinutes(120)).toBe('2시간');
    expect(formatMinutes(0)).toBe('0분');
  });

  it('기록 길이는 분 단위로 내리고 1분 미만은 초로 쓴다', () => {
    expect(formatRecordDuration(1500)).toBe('25분');
    expect(formatRecordDuration(3959)).toBe('1시간 5분');
    expect(formatRecordDuration(45)).toBe('45초');
  });

  it('기록 시각은 오늘·어제·그 전을 달력 날짜로 나눈다', () => {
    const now = at(28, 1, 30);
    expect(formatRecordTime(at(28, 0, 10), now)).toBe('0:10');
    expect(formatRecordTime(at(27, 21, 5), now)).toBe('어제 21:05');
    expect(formatRecordTime(at(26, 9, 7), now)).toBe('10/26 9:07');
  });
});
