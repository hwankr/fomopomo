import type { Ref } from 'react';
import { ChevronDown } from 'lucide-react';

type TaskPickerTriggerProps = {
  title: string | null;
  subject?: string | null;
  open?: boolean;
  /** 열려 있는 동안 aria-controls로 가리킬 선택기 내용의 id */
  controls?: string;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
};

// 구슬 아래 "지금 하는 일" 버튼. 작업 선택 팝오버(모바일은 시트)를 연다.
export function TaskPickerTrigger({ title, subject, open = false, controls, onClick, ref }: TaskPickerTriggerProps) {
  return (
    <button
      ref={ref}
      type="button"
      data-task-picker-trigger=""
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      onClick={onClick}
      className="ui-press inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-chip pr-2 pl-3 text-[13px] font-semibold transition-[color,background-color,scale] hover:bg-hover md:h-10 md:gap-2 md:rounded-control md:pr-2.5 md:pl-3.5 md:text-sm"
    >
      <span className="shrink-0 font-medium text-ink-muted">지금 하는 일</span>
      <span className="min-w-0 truncate">{title || '작업을 골라 주세요'}</span>
      {subject ? <span className="shrink-0 text-xs font-medium text-ink-muted md:text-[13px]">{subject}</span> : null}
      <ChevronDown aria-hidden="true" strokeWidth={2.2} className="size-3.5 shrink-0 text-ink-muted md:size-[15px]" />
    </button>
  );
}
