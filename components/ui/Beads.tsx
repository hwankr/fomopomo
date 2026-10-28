import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export type BeadState = 'done' | 'current' | 'empty' | 'planned' | 'past';
export type BeadTone = 'pomo' | 'rest' | 'watch';

type BeadProps = {
  state?: BeadState;
  tone?: BeadTone;
  /** 지름(px). 디자인에서는 6–12px을 쓴다. */
  size?: number;
  className?: string;
};

type BeadsProps = {
  /** 스크린 리더가 읽을 요약. 예: "뽀모도로 2 / 4" */
  label: string;
  /** 구슬마다 상태를 직접 줄 때. 주면 done/planned/total/current는 무시한다. */
  states?: BeadState[];
  /** 끝낸 구슬 수 */
  done?: number;
  /** done 바로 다음 구슬을 지금 진행 중(박동)으로 표시 */
  current?: boolean;
  /** 계획했지만 아직 하지 않은 구슬 수 */
  planned?: number;
  /** 전체 칸 수. 남는 칸은 빈 구슬로 채운다. */
  total?: number;
  tone?: BeadTone;
  size?: number;
  gap?: number;
  /** row: 가로 줄, column: 위에서 아래, column-reverse: 아래에서 위로 쌓기(7일 기록) */
  direction?: 'row' | 'column' | 'column-reverse';
  wrap?: boolean;
  className?: string;
};

export function buildBeadStates({
  done = 0,
  current = false,
  planned = 0,
  total,
}: Pick<BeadsProps, 'done' | 'current' | 'planned' | 'total'>): BeadState[] {
  const doneCount = Math.max(0, Math.floor(done));
  const plannedCount = Math.max(0, Math.floor(planned));
  const states: BeadState[] = Array.from({ length: doneCount }, () => 'done');
  if (current) states.push('current');
  for (let i = 0; i < plannedCount; i += 1) states.push('planned');
  if (total === undefined) return states;
  // total이 있으면 칸 수를 그만큼으로 맞춘다(넘치는 구슬은 자르고 모자라면 빈 구슬).
  const length = Math.max(0, Math.floor(total));
  while (states.length < length) states.push('empty');
  return states.slice(0, length);
}

export function Bead({ state = 'done', tone = 'pomo', size = 8, className }: BeadProps) {
  return (
    <span
      aria-hidden="true"
      data-state={state}
      data-bead-tone={tone}
      className={cn('ui-bead', className)}
      style={{ '--bead-size': `${size}px` } as CSSProperties}
    />
  );
}

// 뽀모도로 1분(또는 1개) = 구슬 1알. 타이머·작업 목표·달력·7일 기록이 같은 구슬을 쓴다.
export default function Beads({
  label,
  states,
  done,
  current,
  planned,
  total,
  tone = 'pomo',
  size = 8,
  gap = 4,
  direction = 'row',
  wrap = false,
  className,
}: BeadsProps) {
  const items = states ?? buildBeadStates({ done, current, planned, total });

  return (
    <span
      role="img"
      aria-label={label}
      data-bead-tone={tone}
      className={cn(
        'inline-flex shrink-0',
        direction === 'row' ? 'flex-row items-center' : direction === 'column' ? 'flex-col' : 'flex-col-reverse',
        wrap && 'flex-wrap',
        className,
      )}
      style={{ gap: `${gap}px`, '--bead-size': `${size}px` } as CSSProperties}
    >
      {items.map((state, index) => (
        <span key={index} aria-hidden="true" data-state={state} className="ui-bead" />
      ))}
    </span>
  );
}
