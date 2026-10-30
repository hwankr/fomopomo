import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { RotateCcw, SlidersVertical } from 'lucide-react';
import Beads, { type BeadState, type BeadTone } from '@/components/ui/Beads';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/hooks/useIsDesktop';

// 상태 문구 + 사이클 표시(있을 때만). 상태가 바뀌면 보조기기에 알린다.
export function StageStatus({ status, detail }: { status: string; detail?: string }) {
  return (
    <p aria-live="polite" className="m-0 mb-1.5 flex items-baseline gap-2 text-sm font-semibold md:-mb-2 md:gap-2.5 md:text-base">
      {status}
      {detail && <span className="text-[13px] font-medium text-ink-muted md:text-sm">{detail}</span>}
    </p>
  );
}

// 구슬 n알을 폭 available(px)에 담을 때 줄 폭. 한 줄에 들어가면 한 줄 그대로 두고, 아니면 줄 수(L)는 가장 적게,
// 마지막 줄 말고는 ceil(n / L)알씩 들어가는 폭을 돌려준다. 폭이 구슬 하나보다 좁아도 한 줄에 한 알은 둔다.
export function balancedBeadRowWidth(count: number, size: number, gap: number, available: number) {
  if (count <= 1) return Math.max(0, count) * size;
  const fit = Math.max(1, Math.floor((available + gap) / (size + gap)));
  const perLine = Math.ceil(count / Math.ceil(count / fit));
  return perLine * size + (perLine - 1) * gap;
}

// 1분 = 구슬 1알. 데스크톱 10px·간격 8px(30알 넘으면 7·6), 모바일 8·5(6·4).
// 줄은 340px(데스크톱 560px)과 무대 폭 + 양옆 여백 12px씩 중 좁은 쪽까지 쓴다. 넘치면 줄 수는 가장 적게 두고 구슬을
// 고르게 나눠 가운데 맞춘다(25알이 24 + 1이 아니라 13 + 12). 무대 폭은 처음 그리기 전에 재고, 바뀌면 다시 잰다.
// 줄 폭은 전환 없이 바로 바꾼다(움직임 줄이기의 0.01ms 전환이 재기 전 폭을 한 프레임 보이지 않게).
export function StageBeads({ label, states, tone }: { label: string; states: BeadState[]; tone: BeadTone }) {
  const isDesktop = useIsDesktop();
  const many = states.length > 30;
  const size = isDesktop ? (many ? 7 : 10) : (many ? 6 : 8);
  const gap = isDesktop ? (many ? 6 : 8) : (many ? 4 : 5);
  const columnRef = useRef<HTMLDivElement>(null);
  // 재기 전(서버 렌더)이나 숨어 있어 0일 때는 모른다(null).
  const [columnWidth, setColumnWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const measure = (width: number) => {
      if (width > 0) setColumnWidth(width);
    };
    measure(column.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(column);
    return () => observer.disconnect();
  }, []);
  const cap = isDesktop ? 560 : 340;
  const available = columnWidth === null ? cap : Math.min(cap, columnWidth + 24);
  return (
    <div
      ref={columnRef}
      className="mt-[18px] flex w-full justify-center md:mt-0"
      style={{ '--stage-beads-max': `${balancedBeadRowWidth(states.length, size, gap, available)}px` } as CSSProperties}
    >
      <Beads
        label={label}
        states={states}
        tone={tone}
        popCompleted
        size={size}
        gap={gap}
        wrap
        className="min-h-2 max-w-[min(var(--stage-beads-max),calc(100%+24px))] justify-center transition-none md:min-h-3.5"
      />
    </div>
  );
}

// 무대 위 48px 원형 보조 버튼(재설정, 타이머 설정).
export function StageIconButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn('ui-icon-button-surface ui-press size-12 bg-white/75 transition-[background-color,filter,scale]', className)}
    >
      {children}
    </button>
  );
}

// 시작 버튼 왼쪽의 재설정(타이머·스톱워치 초기화).
export function StageResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <StageIconButton aria-label={label} onClick={onClick}>
      <RotateCcw aria-hidden="true" size={20} strokeWidth={2} />
    </StageIconButton>
  );
}

// 데스크톱 시작 버튼 옆의 타이머 설정. 모바일은 상단 바에 같은 버튼이 있다.
export function StageSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <StageIconButton aria-label="타이머 설정" onClick={onClick} className="hidden md:inline-flex">
      <SlidersVertical aria-hidden="true" size={20} strokeWidth={1.8} />
    </StageIconButton>
  );
}

// [재설정][시작][설정]. 양옆 칸은 비어 있어도 48px을 차지해서 시작 버튼이 늘 가운데에 머문다.
export function StageControls({ reset, settings, children }: { reset?: ReactNode; settings?: ReactNode; children: ReactNode }) {
  return (
    <div data-stage-controls="" className="mt-6 flex items-center justify-center gap-2.5 md:mt-1">
      <div data-stage-slot="reset" className="flex w-12 shrink-0 justify-center">{reset}</div>
      {children}
      <div data-stage-slot="settings" className="flex w-12 shrink-0 justify-center">{settings}</div>
    </div>
  );
}

// 기록 저장·작업 완료처럼 자주 쓰지 않는 동작. 시작 버튼 아래 작은 칩으로 둔다.
export function StageChipButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn('ui-button-secondary ui-press min-h-10 rounded-control bg-white/75 px-4 text-sm', className)}
    />
  );
}

// 칩이 없어도 한 줄(칩 높이)을 비워 둔다. 칩이 나타나고 사라져도 위쪽이 움직이지 않는다.
export function StageActions({ children }: { children?: ReactNode }) {
  return <div data-stage-chip-row="" className="mt-3 flex min-h-10 w-full flex-wrap items-center justify-center gap-2 md:-mt-3">{children}</div>;
}
