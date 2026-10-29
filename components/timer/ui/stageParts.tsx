import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { RotateCcw, SlidersVertical } from 'lucide-react';
import Beads, { type BeadState, type BeadTone } from '@/components/ui/Beads';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/hooks/useIsDesktop';

// 상태 문구 + 사이클 표시. 상태가 바뀌면 보조기기에 알린다.
export function StageStatus({ status, detail }: { status: string; detail: string }) {
  return (
    <p aria-live="polite" className="m-0 mb-1.5 flex items-baseline gap-2 text-sm font-semibold md:-mb-2 md:gap-2.5 md:text-base">
      {status}
      <span className="text-[13px] font-medium text-ink-muted md:text-sm">{detail}</span>
    </p>
  );
}

// 1분 = 구슬 1알. 데스크톱 10px·간격 8px(30알 넘으면 7·6), 모바일 8·5(6·4).
export function StageBeads({ label, states, tone }: { label: string; states: BeadState[]; tone: BeadTone }) {
  const isDesktop = useIsDesktop();
  const many = states.length > 30;
  return (
    <div className="mt-[18px] flex justify-center md:mt-0">
      <Beads
        label={label}
        states={states}
        tone={tone}
        popCompleted
        size={isDesktop ? (many ? 7 : 10) : (many ? 6 : 8)}
        gap={isDesktop ? (many ? 6 : 8) : (many ? 4 : 5)}
        wrap
        className="min-h-2 max-w-[340px] justify-center md:min-h-3.5 md:max-w-[560px]"
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
