/**
 * Date utilities for day reset time handling.
 * 
 * The study day resets at 5 AM instead of midnight (00:00).
 * This is because students often study past midnight, and having
 * the day reset at midnight causes confusion (e.g., study time 
 * resetting to 0 at 00:00 while still studying).
 */

/** The hour at which the study day resets (5 AM) */
export const DAY_RESET_HOUR = 5;

/**
 * Get the start of the current "study day" based on the reset hour.
 * 
 * If current time is before DAY_RESET_HOUR (e.g., 3 AM), 
 * the day start is yesterday at DAY_RESET_HOUR.
 * 
 * @param date - The reference date (defaults to now)
 * @returns Date object representing the start of the study day
 * 
 * @example
 * // If it's December 12, 2025 at 3:00 AM:
 * getDayStart() // Returns December 11, 2025 at 5:00 AM
 * 
 * // If it's December 12, 2025 at 10:00 AM:
 * getDayStart() // Returns December 12, 2025 at 5:00 AM
 */
export function getDayStart(date: Date = new Date()): Date {
    const d = new Date(date);

    if (d.getHours() < DAY_RESET_HOUR) {
        // Before reset hour, so the "study day" started yesterday
        d.setDate(d.getDate() - 1);
    }

    d.setHours(DAY_RESET_HOUR, 0, 0, 0);
    return d;
}

/**
 * Get the end of the current "study day" based on the reset hour.
 * 
 * The day ends at DAY_RESET_HOUR - 1 millisecond of the next calendar day.
 * 
 * @param date - The reference date (defaults to now)
 * @returns Date object representing the end of the study day
 * 
 * @example
 * // If it's December 12, 2025 at 10:00 AM:
 * getDayEnd() // Returns December 13, 2025 at 4:59:59.999 AM
 */
export function getDayEnd(date: Date = new Date()): Date {
    const start = getDayStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(end.getMilliseconds() - 1);
    return end;
}

/**
 * Check if two dates are on the same "study day".
 * 
 * @param date1 - First date to compare
 * @param date2 - Second date to compare
 * @returns true if both dates fall within the same study day
 */
export function isSameStudyDay(date1: Date, date2: Date): boolean {
    return getDayStart(date1).getTime() === getDayStart(date2).getTime();
}

/**
 * Get the start of a specific calendar date's study day.
 * This is useful when the user selects a specific date (e.g., in a calendar).
 * 
 * Unlike getDayStart(), this always returns the reset hour of the given date,
 * regardless of the current time.
 * 
 * @param date - The calendar date
 * @returns Date object representing 5 AM of that date
 */
export function getCalendarDayStart(date: Date): Date {
    const d = new Date(date);
    d.setHours(DAY_RESET_HOUR, 0, 0, 0);
    return d;
}

/**
 * Get the end of a specific calendar date's study day.
 *
 * @param date - The calendar date
 * @returns Date object representing 4:59:59.999 AM of the next day
 */
export function getCalendarDayEnd(date: Date): Date {
    const start = getCalendarDayStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(end.getMilliseconds() - 1);
    return end;
}

/*
 * ── 타임존/경계 정책 ──
 *
 * 클라이언트 지표는 "기기 로컬 시각" 기준 05:00 경계를 사용한다(이 파일의 기존
 * getDayStart/getDayEnd 의미 그대로). 서버 RPC에는 날짜 문자열이 아니라 아래
 * 범위 헬퍼가 계산한 timestamptz 절대 범위(ISO 문자열)를 전달하고, 서버에서는
 * 날짜 캐스트를 하지 않는다.
 *
 * 예외: 관리자 지표는 청중이 한국이므로 기기 타임존과 무관하게
 * Asia/Seoul(+09:00 고정, DST 없음) 기준 05:00 경계를 사용한다
 * (getSeoulStudyDayRange).
 *
 * 범위는 [start, end] 양끝 포함이며 end는 start + 기간 - 1ms
 * (기존 getDayEnd 관례). 클라이언트가 쓰는 created_at은 항상 ms 정밀도라서
 * 1ms 틈에 행이 떨어지는 일은 없다.
 */

/** [start, end] 형태의 조회 범위. 양끝 포함(gte/lte)으로 사용한다. */
export interface TimeRange {
    start: Date;
    end: Date;
}

/**
 * 지정 시각이 속한 "공부일"의 범위.
 * 05:00 이전이면 전날 05:00부터 시작하는 공부일에 속한다(getDayStart 의미).
 */
export function getStudyDayRange(date: Date = new Date()): TimeRange {
    return { start: getDayStart(date), end: getDayEnd(date) };
}

/**
 * 사용자가 명시적으로 고른 달력 날짜의 공부일 범위:
 * 그 날짜 05:00 ~ 다음날 04:59:59.999. (현재 시각 기준 보정 없음)
 */
export function getCalendarStudyDayRange(date: Date): TimeRange {
    return { start: getCalendarDayStart(date), end: getCalendarDayEnd(date) };
}

/**
 * 달력 날짜 first~last(포함)를 잇는 공부일 범위:
 * first 05:00 ~ last 다음날 04:59:59.999.
 */
export function getStudyRangeForCalendarDays(first: Date, last: Date): TimeRange {
    return { start: getCalendarDayStart(first), end: getCalendarDayEnd(last) };
}

/**
 * 지정 날짜가 속한 달력 주(월요일 시작)의 공부주 범위:
 * 월요일 05:00 ~ 다음 월요일 04:59:59.999.
 *
 * 주/월/연 범위는 사용자가 화면에서 고른 "달력 기간"에 붙는 개념이므로
 * 현재 시각의 05:00 이전 보정을 적용하지 않는다(적용하면 1월 1일 새벽에
 * 전년도로 튀는 식의 기간 이탈이 생긴다).
 */
export function getStudyWeekRange(date: Date = new Date()): TimeRange {
    const monday = new Date(date);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // 월=0 … 일=6
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return getStudyRangeForCalendarDays(monday, sunday);
}

/**
 * 지정 날짜가 속한 달력 월의 공부월 범위:
 * 1일 05:00 ~ 다음달 1일 04:59:59.999.
 */
export function getStudyMonthRange(date: Date = new Date()): TimeRange {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return getStudyRangeForCalendarDays(first, last);
}

/**
 * 지정 날짜가 속한 달력 연도의 공부연 범위:
 * 1월 1일 05:00 ~ 다음해 1월 1일 04:59:59.999.
 */
export function getStudyYearRange(date: Date = new Date()): TimeRange {
    const first = new Date(date.getFullYear(), 0, 1);
    const last = new Date(date.getFullYear(), 11, 31);
    return getStudyRangeForCalendarDays(first, last);
}

/** Asia/Seoul은 DST 없이 UTC+9 고정이다. */
const SEOUL_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 관리자 지표 전용: 기기 타임존과 무관하게 Asia/Seoul 기준 05:00 공부일 범위.
 * 서울 벽시계로 공부일의 달력 날짜를 정한 뒤 절대 시각(UTC)으로 되돌린다.
 */
export function getSeoulStudyDayRange(now: Date = new Date()): TimeRange {
    // UTC 게터로 읽으면 서울 벽시계가 되도록 +9h 이동한 시각
    const seoulClock = new Date(now.getTime() + SEOUL_UTC_OFFSET_MS);
    let studyDayDate = new Date(Date.UTC(
        seoulClock.getUTCFullYear(),
        seoulClock.getUTCMonth(),
        seoulClock.getUTCDate()
    ));
    if (seoulClock.getUTCHours() < DAY_RESET_HOUR) {
        studyDayDate = new Date(studyDayDate.getTime() - DAY_MS);
    }
    const startMs =
        studyDayDate.getTime() + DAY_RESET_HOUR * 60 * 60 * 1000 - SEOUL_UTC_OFFSET_MS;
    return { start: new Date(startMs), end: new Date(startMs + DAY_MS - 1) };
}

/**
 * 인터벌(ms epoch)을 공부일 경계(기기 로컬 05:00)에서 분할한다.
 *
 * 경계에 걸린 조각의 end는 경계 정각이 아니라 "경계 - 1ms"로 자른다.
 * 행의 created_at(= 조각 end 시각)이 경계 정각이 되면 [05:00, 다음날
 * 04:59:59.999] 범위 조회에서 다음 공부일로 귀속되어 분할의 의미가 없어지기
 * 때문이다. 잘린 1ms는 다음 조각이 경계 정각에서 시작하므로 유실되지 않고,
 * duration은 초 단위 반올림이라 값이 달라지지 않는다.
 *
 * 1초 미만 조각은 버린다(기존 자정 분할과 동일).
 */
export function splitIntervalAtStudyDayBoundary(
    interval: { start: number; end: number }
): { start: number; end: number }[] {
    const result: { start: number; end: number }[] = [];
    let currentStart = interval.start;
    const finalEnd = interval.end;

    while (currentStart < finalEnd) {
        // currentStart가 속한 공부일의 다음 05:00 경계
        const nextBoundary = getDayStart(new Date(currentStart));
        nextBoundary.setDate(nextBoundary.getDate() + 1);
        const boundaryMs = nextBoundary.getTime();

        // 경계 정각에 끝나는 인터벌도 "경계에 걸린" 것으로 취급해 이전
        // 공부일에 귀속시킨다.
        const clipped = boundaryMs <= finalEnd;
        const currentEnd = clipped ? boundaryMs - 1 : finalEnd;

        if (currentEnd - currentStart >= 1000) {
            result.push({ start: currentStart, end: currentEnd });
        }

        currentStart = clipped ? boundaryMs : finalEnd;
    }

    return result;
}
