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
