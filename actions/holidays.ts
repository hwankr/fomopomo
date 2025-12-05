'use server';

import { holidays } from '@kyungseopk1m/holidays-kr';

export async function getKoreanHolidays(year: string) {
    try {
        const response = await holidays(year);
        if (response && response.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return response.data.map((h: any) => typeof h.date === 'string' ? parseInt(h.date) : h.date);
        }
        return [];
    } catch (error) {
        console.error("Failed to fetch holidays on server:", error);
        return [];
    }
}
