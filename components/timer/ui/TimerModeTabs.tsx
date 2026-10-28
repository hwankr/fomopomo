import { useRef, type KeyboardEvent } from 'react';
import type { TimerMode } from '../hooks/useTimerLogic';

export type TimerModeKey = TimerMode | 'stopwatch';

const MODES: { key: TimerModeKey; label: string }[] = [
  { key: 'focus', label: '뽀모도로' },
  { key: 'shortBreak', label: '짧은 휴식' },
  { key: 'longBreak', label: '긴 휴식' },
  { key: 'stopwatch', label: '스톱워치' },
];

export const getTimerTabId = (key: TimerModeKey) => `timer-mode-tab-${key}`;

type TimerModeTabsProps = {
  value: TimerModeKey;
  onSelect: (key: TimerModeKey) => void;
  panelId: string;
};

// 뽀모도로 / 짧은 휴식 / 긴 휴식 / 스톱워치 알약 탭.
// 모드를 바꾸면 기록 저장·확인이 따라오므로 화살표는 포커스만 옮기고(수동 활성화)
// Enter/Space로 고른다.
export function TimerModeTabs({ value, onSelect, panelId }: TimerModeTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = MODES.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
        : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
          : event.key === 'Home' ? 0
            : event.key === 'End' ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex justify-center px-5 pt-2 md:px-8 md:pt-1">
      <div
        role="tablist"
        aria-label="타이머 모드"
        className="ui-segmented [&>button]:h-8 [&>button]:px-3 [&>button]:text-[13px] md:[&>button]:h-9 md:[&>button]:px-4 md:[&>button]:text-sm"
      >
        {MODES.map((mode, index) => {
          const selected = mode.key === value;
          return (
            <button
              key={mode.key}
              ref={(element) => { tabRefs.current[index] = element; }}
              id={getTimerTabId(mode.key)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(mode.key)}
              onKeyDown={(event) => moveFocus(event, index)}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
