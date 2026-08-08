import { describe, expect, it } from 'vitest';
import {
  getSeoulStudyDayRange,
  getStudyDayRange,
  getStudyMonthRange,
  getStudyWeekRange,
  getStudyYearRange,
  splitIntervalAtStudyDayBoundary,
} from '../dateUtils';

// 로컬 시각 생성 헬퍼 — 테스트가 실행 머신의 타임존과 무관하게 로컬 05:00
// 경계 의미를 검증하도록 로컬 시각 생성자만 사용한다.
const local = (
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
  s = 0,
  ms = 0
) => new Date(y, m, d, h, min, s, ms).getTime();

describe('splitIntervalAtStudyDayBoundary', () => {
  it('04:59:59에 끝나는 세션은 분할하지 않는다', () => {
    const interval = {
      start: local(2026, 7, 7, 4, 0),
      end: local(2026, 7, 7, 4, 59, 59),
    };

    expect(splitIntervalAtStudyDayBoundary(interval)).toEqual([interval]);
  });

  it('05:00 정각에 끝나는 세션은 한 조각으로 이전 공부일에 귀속된다(end = 04:59:59.999)', () => {
    const result = splitIntervalAtStudyDayBoundary({
      start: local(2026, 7, 7, 4, 30),
      end: local(2026, 7, 7, 5, 0),
    });

    expect(result).toEqual([
      { start: local(2026, 7, 7, 4, 30), end: local(2026, 7, 7, 4, 59, 59, 999) },
    ]);
    // 반올림 후 duration은 정확히 30분이다.
    expect(Math.round((result[0].end - result[0].start) / 1000)).toBe(1800);
  });

  it('05:00을 가로지르는 세션(04:30~05:30)은 두 조각이 되고 각각 제 공부일에 귀속된다', () => {
    const result = splitIntervalAtStudyDayBoundary({
      start: local(2026, 7, 7, 4, 30),
      end: local(2026, 7, 7, 5, 30),
    });

    expect(result).toEqual([
      { start: local(2026, 7, 7, 4, 30), end: local(2026, 7, 7, 4, 59, 59, 999) },
      { start: local(2026, 7, 7, 5, 0), end: local(2026, 7, 7, 5, 30) },
    ]);
    expect(result.map((piece) => Math.round((piece.end - piece.start) / 1000))).toEqual([
      1800, 1800,
    ]);
  });

  it('자정을 가로질러도 05:00 전이면 분할하지 않는다', () => {
    const interval = {
      start: local(2026, 7, 6, 23, 30),
      end: local(2026, 7, 7, 0, 30),
    };

    expect(splitIntervalAtStudyDayBoundary(interval)).toEqual([interval]);
  });

  it('월 경계(8/31→9/1)의 05:00에서 분할한다', () => {
    const result = splitIntervalAtStudyDayBoundary({
      start: local(2026, 8, 1, 4, 0),
      end: local(2026, 8, 1, 6, 0),
    });

    expect(result).toEqual([
      { start: local(2026, 8, 1, 4, 0), end: local(2026, 8, 1, 4, 59, 59, 999) },
      { start: local(2026, 8, 1, 5, 0), end: local(2026, 8, 1, 6, 0) },
    ]);
  });

  it('연 경계(12/31→1/1)의 05:00에서 분할한다', () => {
    const result = splitIntervalAtStudyDayBoundary({
      start: local(2026, 11, 31, 23, 0),
      end: local(2027, 0, 1, 6, 0),
    });

    expect(result).toEqual([
      { start: local(2026, 11, 31, 23, 0), end: local(2027, 0, 1, 4, 59, 59, 999) },
      { start: local(2027, 0, 1, 5, 0), end: local(2027, 0, 1, 6, 0) },
    ]);
  });

  it('두 경계 이상을 가로지르는 장시간 세션은 경계마다 조각난다', () => {
    const result = splitIntervalAtStudyDayBoundary({
      start: local(2026, 7, 7, 4, 0),
      end: local(2026, 7, 9, 6, 0),
    });

    expect(result).toEqual([
      { start: local(2026, 7, 7, 4, 0), end: local(2026, 7, 7, 4, 59, 59, 999) },
      { start: local(2026, 7, 7, 5, 0), end: local(2026, 7, 8, 4, 59, 59, 999) },
      { start: local(2026, 7, 8, 5, 0), end: local(2026, 7, 9, 4, 59, 59, 999) },
      { start: local(2026, 7, 9, 5, 0), end: local(2026, 7, 9, 6, 0) },
    ]);
  });

  it('1초 미만 조각은 버린다', () => {
    expect(
      splitIntervalAtStudyDayBoundary({
        start: local(2026, 7, 7, 4, 59, 59, 700),
        end: local(2026, 7, 7, 5, 0, 0, 200),
      })
    ).toEqual([]);
  });
});

describe('study day range helpers', () => {
  it('getStudyDayRange: 05:00 이후는 그날 05:00 ~ 다음날 04:59:59.999', () => {
    const range = getStudyDayRange(new Date(2026, 7, 7, 12, 0));

    expect(range.start.getTime()).toBe(local(2026, 7, 7, 5, 0));
    expect(range.end.getTime()).toBe(local(2026, 7, 8, 4, 59, 59, 999));
  });

  it('getStudyDayRange: 05:00 이전은 전날 공부일에 속한다', () => {
    const range = getStudyDayRange(new Date(2026, 7, 7, 3, 0));

    expect(range.start.getTime()).toBe(local(2026, 7, 6, 5, 0));
    expect(range.end.getTime()).toBe(local(2026, 7, 7, 4, 59, 59, 999));
  });

  it('getStudyWeekRange: 월요일 05:00 ~ 다음 월요일 04:59:59.999', () => {
    // 2026-08-07은 금요일; 그 주의 월요일은 2026-08-03
    const range = getStudyWeekRange(new Date(2026, 7, 7, 12, 0));

    expect(range.start.getTime()).toBe(local(2026, 7, 3, 5, 0));
    expect(range.end.getTime()).toBe(local(2026, 7, 10, 4, 59, 59, 999));
  });

  it('getStudyMonthRange: 1일 05:00 ~ 다음달 1일 04:59:59.999', () => {
    const range = getStudyMonthRange(new Date(2026, 7, 15));

    expect(range.start.getTime()).toBe(local(2026, 7, 1, 5, 0));
    expect(range.end.getTime()).toBe(local(2026, 8, 1, 4, 59, 59, 999));
  });

  it('getStudyYearRange: 1/1 05:00 ~ 다음해 1/1 04:59:59.999 (명시적 연도 선택에 05:00 보정 없음)', () => {
    // 사용자가 2026년을 선택해 1월 1일 자정이 넘어와도 2026년 범위여야 한다.
    const range = getStudyYearRange(new Date(2026, 0, 1, 0, 0));

    expect(range.start.getTime()).toBe(local(2026, 0, 1, 5, 0));
    expect(range.end.getTime()).toBe(local(2027, 0, 1, 4, 59, 59, 999));
  });
});

describe('getSeoulStudyDayRange', () => {
  // KST 05:00 = 전날 20:00 UTC. 절대 시각으로 검증하므로 머신 타임존과 무관하다.
  it('KST 05:00 이후: 그날 05:00 KST(= 전날 20:00 UTC)부터 시작한다', () => {
    // 2026-08-07 12:00 KST = 03:00 UTC
    const range = getSeoulStudyDayRange(new Date('2026-08-07T03:00:00Z'));

    expect(range.start.toISOString()).toBe('2026-08-06T20:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-08-07T19:59:59.999Z');
  });

  it('KST 05:00 이전: 전날 공부일에 속한다', () => {
    // 2026-08-07 03:00 KST = 2026-08-06 18:00 UTC
    const range = getSeoulStudyDayRange(new Date('2026-08-06T18:00:00Z'));

    expect(range.start.toISOString()).toBe('2026-08-05T20:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-08-06T19:59:59.999Z');
  });

  it('월 경계: 1일 새벽(KST)은 전월 마지막 공부일이다', () => {
    // 2026-09-01 01:00 KST = 2026-08-31 16:00 UTC
    const range = getSeoulStudyDayRange(new Date('2026-08-31T16:00:00Z'));

    expect(range.start.toISOString()).toBe('2026-08-30T20:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-08-31T19:59:59.999Z');
  });
});
