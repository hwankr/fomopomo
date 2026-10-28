import { cn } from '@/lib/utils';
import type { BeadTone } from '@/components/ui/Beads';
import { formatClock, TONE_DEEP_TEXT } from './timerDisplayUtils';

type TimerDigitsProps = {
  seconds: number;
  /** 스크린 리더가 읽을 문장. 예: "남은 시간 24분 51초" */
  label: string;
  /** 실행 중이면 모드의 짙은 색, 아니면 먹색 */
  runningTone: BeadTone | null;
};

// 큰 타이머 숫자. 글자마다 고정 폭 칸에 넣어 초가 바뀌어도 줄이 흔들리지 않는다.
export function TimerDigits({ seconds, label, runningTone }: TimerDigitsProps) {
  const text = formatClock(seconds);
  const hasHours = text.length > 5;

  return (
    <div
      role="timer"
      aria-label={label}
      className={cn(
        'flex items-baseline justify-center font-display font-bold tracking-[-0.035em] transition-colors duration-(--duration-emphasized)',
        hasHours
          ? 'text-[min(90px,22vw)] md:text-[min(150px,19vw)]'
          : 'text-[min(124px,31vw)] md:text-[min(232px,19vw)]',
        // 글자 크기 뒤에 둬야 tailwind-merge가 줄 높이를 지우지 않는다.
        'leading-[0.95]',
        runningTone ? TONE_DEEP_TEXT[runningTone] : 'text-ink',
      )}
    >
      {text.split('').map((char, index) =>
        char === ':' ? (
          <span key={index} aria-hidden="true" className="relative -top-[0.05em] inline-block w-[0.26em] text-center">
            :
          </span>
        ) : (
          <span key={index} aria-hidden="true" className="inline-block w-[0.58em] text-center">
            {char}
          </span>
        ),
      )}
    </div>
  );
}
