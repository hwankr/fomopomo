import { describe, expect, it } from 'vitest';
import {
    buildInviteLink,
    formatHourMinute,
    formatHoursText,
    getLiveStudySeconds,
    getMemberDisplayName,
    readGroupId,
} from '@/components/groups/groupUtils';

describe('groupUtils', () => {
    it('formats ranking times as h:mm and totals as 시간·분 text', () => {
        expect(formatHourMinute(19 * 3600 + 40 * 60 + 59)).toBe('19:40');
        expect(formatHourMinute(5 * 60)).toBe('0:05');
        expect(formatHourMinute(-10)).toBe('0:00');
        expect(formatHoursText(88 * 3600 + 15 * 60)).toBe('88시간 15분');
        expect(formatHoursText(2 * 3600)).toBe('2시간');
        expect(formatHoursText(40 * 60)).toBe('40분');
        expect(formatHoursText(0)).toBe('0분');
    });

    it('adds the running part of a member who is studying or paused', () => {
        const now = Date.parse('2026-10-28T10:00:00.000Z');
        const weekStart = Date.parse('2026-10-26T20:00:00.000Z');
        const base = { status: 'online', study_start_time: null, total_stopwatch_time: null };

        expect(getLiveStudySeconds(base, 1200, weekStart, now)).toBe(1200);
        expect(
            getLiveStudySeconds({ ...base, status: 'studying', study_start_time: '2026-10-28T09:30:00.000Z' }, 1200, weekStart, now)
        ).toBe(1200 + 30 * 60);
        // 주 시작 전에 시작한 세션은 주 시작부터 센다.
        expect(
            getLiveStudySeconds({ ...base, status: 'studying', study_start_time: '2026-10-20T00:00:00.000Z' }, 0, weekStart, now)
        ).toBe((now - weekStart) / 1000);
        expect(getLiveStudySeconds({ ...base, status: 'paused', total_stopwatch_time: 900 }, 1200, weekStart, now)).toBe(2100);
    });

    it('picks the display name, created group id and invite link', () => {
        expect(getMemberDisplayName({ nickname: '지훈', profiles: { email: 'j@example.com' } })).toBe('지훈');
        expect(getMemberDisplayName({ nickname: null, profiles: { email: 'minji@example.com' } })).toBe('minji');
        expect(getMemberDisplayName({ nickname: null, profiles: null })).toBe('멤버');
        expect(readGroupId([{ id: 'group-1' }])).toBe('group-1');
        expect(readGroupId({ id: 'group-2' })).toBe('group-2');
        expect(readGroupId(null)).toBeUndefined();
        expect(buildInviteLink('https://fomopomo.com', 'DAWN05')).toBe('https://fomopomo.com/groups?code=DAWN05');
    });
});
