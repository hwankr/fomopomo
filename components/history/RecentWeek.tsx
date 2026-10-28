import Beads from '@/components/ui/Beads';
import { cn } from '@/lib/utils';
import { getWeekBeadStates, type RecentActivitySummary } from './recentActivity';

// 최근 7일: 데스크톱은 요일마다 아래에서 위로 쌓은 구슬 기둥, 모바일 보드는 한 줄 요약만 둔다.
export default function RecentWeek({ summary }: { summary: RecentActivitySummary }) {
  const total = `뽀모도로 ${summary.weekPomodoros}개`;
  const label = `최근 7일 뽀모도로: ${summary.days.map(day => `${day.weekday} ${day.pomodoros}개`).join(', ')}`;

  return (
    <section aria-label="최근 7일">
      <p className="m-0 pt-2.5 text-[13px] text-ink-muted md:hidden">최근 7일 {total}</p>
      <div className="hidden flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-4 md:flex">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-ink-muted">최근 7일</span>
          <span className="text-lg font-bold leading-[1.3] tracking-[-0.02em]">{total}</span>
        </div>
        <div role="img" aria-label={label} className="flex items-end gap-3.5">
          {summary.days.map(day => (
            <div key={day.key} className="flex flex-col items-center gap-2">
              <Beads
                label={`${day.weekday} ${day.pomodoros}개`}
                states={getWeekBeadStates(day.pomodoros, day.isToday)}
                direction="column-reverse"
                size={10}
                gap={4}
                className="min-h-[92px]"
              />
              <span className={cn('text-xs', day.isToday ? 'font-bold text-ink' : 'font-medium text-ink-muted')}>
                {day.weekday}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
