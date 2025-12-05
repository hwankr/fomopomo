declare module '@kyungseopk1m/holidays-kr' {
    export function holidays(year: string | number): Promise<{
        success: boolean;
        message: string;
        data: Array<{
            date: number | string;
            name: string;
        }>;
    }>;
}
