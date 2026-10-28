'use client';

import { useRef, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { playPop } from '@/components/ui/motion';
import type { NumberField } from './useSettingsForm';

type SettingsSectionProps = {
  id: string;
  title: string;
  description?: ReactNode;
  /** 줄(행) 목록 섹션은 제목 아래 간격이 좁다(기본 시간, 자동 시작, 알림 소리). */
  rows?: boolean;
  className?: string;
  headingClassName?: string;
  children: ReactNode;
};

type SectionHeadingProps = {
  id: string;
  title: string;
  description?: ReactNode;
  className?: string;
};

export function SectionHeading({ id, title, description, className }: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-col gap-[3px] md:gap-1', className)}>
      <h2 id={id} className="ui-h2">{title}</h2>
      {description ? <p className="m-0 text-[13px] text-ink-muted md:text-sm">{description}</p> : null}
    </div>
  );
}

// 흰 페이지의 섹션: 카드·구분선 없이 제목 크기와 여백으로만 나눈다.
export function SettingsSection({ id, title, description, rows = false, className, headingClassName, children }: SettingsSectionProps) {
  return (
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col', rows ? 'gap-1 md:gap-2' : 'gap-2.5 md:gap-3', className)}>
      <SectionHeading id={id} title={title} description={description} className={cn(rows && 'mb-1.5 md:mb-1', headingClassName)} />
      {children}
    </section>
  );
}

type SettingRowProps = {
  label: ReactNode;
  description?: ReactNode;
  /** 라벨을 컨트롤의 <label>로 쓸 때 */
  htmlFor?: string;
  children: ReactNode;
};

export function SettingRow({ label, description, htmlFor, children }: SettingRowProps) {
  const LabelTag = htmlFor ? 'label' : 'span';
  return (
    // 보드의 줄은 내용 최소 높이(모바일 52 / 데스크톱 56)에 위아래 여백을 더한 높이다.
    <div className="flex min-h-14 items-center justify-between gap-3 py-0.5 md:min-h-16 md:gap-4 md:py-1">
      <div className="flex min-w-0 flex-col gap-px md:gap-0.5">
        <LabelTag htmlFor={htmlFor} className="font-semibold">{label}</LabelTag>
        {description ? <span className="text-xs text-ink-muted md:text-[13px]">{description}</span> : null}
      </div>
      {children}
    </div>
  );
}

type SettingSwitchProps = {
  label: string;
  checked: boolean;
  onChange: () => void;
};

export function SettingSwitch({ label, checked, onChange }: SettingSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        // 보이는 길은 48×28, 누르는 영역은 위아래로 늘려 48×44. 길 색은 바뀌고 손잡이는 미끄러진다.
        "ui-press relative h-7 w-12 shrink-0 rounded-[14px] transition-[background-color,scale] before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] disabled:cursor-not-allowed disabled:opacity-50",
        checked ? 'bg-pomo' : 'bg-bar',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[3px] left-[3px] size-[22px] rounded-full bg-white shadow-knob transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

type StepperProps = {
  /** 숫자 입력칸 이름(예: '집중 시간 (분)') */
  inputLabel: string;
  decreaseLabel: string;
  increaseLabel: string;
  value: NumberField;
  /** 입력칸을 비웠을 때 −/+가 기준으로 삼는 값(저장하면 이 값으로 돌아간다) */
  fallback: number;
  onChange: (value: NumberField) => void;
  unit: string;
  step: number;
  min: number;
  max: number;
  /** 값 칸 최소 너비. 프리셋은 좁게, 기본 시간은 넓게 */
  valueClassName?: string;
};

// 보이는 원은 38px(모바일)·40px, 누르는 영역은 44px. 늘린 영역은 옆 요소와 겹치지 않는다.
const STEP_BUTTON = "ui-icon-button-surface size-[38px] before:absolute before:-inset-[3px] before:content-[''] md:size-10 md:before:-inset-0.5";

// − 값 + 단계 조절기. 값은 직접 입력할 수도 있다(입력하는 동안 비울 수 있고, 저장할 때 범위를 맞춘다).
export function Stepper({
  inputLabel,
  decreaseLabel,
  increaseLabel,
  value,
  fallback,
  onChange,
  unit,
  step,
  min,
  max,
  valueClassName,
}: StepperProps) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const current = value === '' ? fallback : value;
  // 단계 눈금에 맞춰 움직인다: 31분에서 −는 30, +는 35.
  const remainder = current % step;
  const decreased = Math.max(min, remainder === 0 ? current - step : current - remainder);
  const increased = Math.min(max, current - remainder + step);
  // −/+로 바꾼 값은 한 번 톡 튄다(animate-pop과 같다). 입력칸을 새로 그리지 않도록 Web Animation(playPop)으로 재생한다.
  const stepTo = (next: number) => {
    onChange(next);
    playPop(valueRef.current);
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5 md:gap-1.5">
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={current <= min}
        onClick={() => stepTo(decreased)}
        className={STEP_BUTTON}
      >
        <Minus aria-hidden="true" size={18} strokeWidth={2} />
      </button>
      <span ref={valueRef} className={cn('flex items-baseline justify-center text-[15px] font-bold md:text-base', valueClassName)}>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          aria-label={inputLabel}
          value={value}
          onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
          // 숫자 길이만큼만 차지해 단위가 바로 붙는다.
          style={{ width: `${Math.max(String(value).length, 1) + 0.25}ch` }}
          className="m-0 rounded-[6px] border-0 bg-transparent p-0 text-right font-bold text-ink [appearance:textfield] focus:bg-surface [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span>{unit}</span>
      </span>
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={current >= max}
        onClick={() => stepTo(increased)}
        className={STEP_BUTTON}
      >
        <Plus aria-hidden="true" size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
