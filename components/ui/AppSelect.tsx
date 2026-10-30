'use client';

import { useEffect, useId, useRef } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stopAllKeys, stopSelectTriggerKeys } from './keyBoundary';

export type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type AppSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  label?: string;
  id?: string;
  placeholder?: string;
  displayValue?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  'aria-label'?: string;
};

// Encoding every option also makes an explicit empty option distinct from the placeholder.
const optionValue = (value: string) => `option:${value}`;

// 손가락을 뗀 뒤 그 탭의 click을 기다리는 시간. 길게 누르거나 스크롤하면 click이 오지 않는다.
const TAP_CLICK_WAIT_MS = 600;
const TAP_GUARD_EVENTS = ['pointerdown', 'pointerup', 'pointercancel', 'touchend', 'mousedown', 'mouseup', 'click'];

/**
 * 열린 목록은 페이지의 포인터 입력을 막으므로 마우스로 바깥을 누르면 html이 눌리고 목록만 닫힌다.
 * 터치·펜은 목록이 닫힌 뒤 오는 호환 mousedown·mouseup·click이 손가락 아래 요소에 가므로, 그 탭의 것만 삼킨다.
 * 끝내는 함수를 돌려준다.
 */
function swallowTapFollowUps(press: PointerEvent) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const end = () => {
    clearTimeout(timer);
    for (const type of TAP_GUARD_EVENTS) window.removeEventListener(type, handle, true);
  };
  function handle(event: Event) {
    switch (event.type) {
      case 'pointerdown': // 새 누름
        return end();
      case 'pointercancel': // 스크롤이 되었다. click은 오지 않는다.
        if ((event as PointerEvent).pointerId === press.pointerId) end();
        return;
      case 'pointerup':
        if ((event as PointerEvent).pointerId !== press.pointerId) return;
        clearTimeout(timer);
        timer = setTimeout(end, TAP_CLICK_WAIT_MS);
        return;
      case 'touchend':
        // 브라우저가 호환 이벤트를 아예 만들지 않게 한다(iOS Safari에서 믿을 수 있는 방법).
        if (event.cancelable) event.preventDefault();
        return;
    }
    // mousedown·mouseup·click. 키보드·코드가 보낸 click(detail 0)은 그대로 둔다.
    if ((event as MouseEvent).detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'click') end();
  }
  // 캡처 단계는 이미 지났으므로, 지금 처리 중인 pointerdown은 이 처리기에 오지 않는다.
  for (const type of TAP_GUARD_EVENTS) window.addEventListener(type, handle, { capture: true, passive: false });
  return end;
}

export default function AppSelect({
  value,
  onValueChange,
  options,
  label,
  id,
  placeholder = '선택',
  displayValue,
  disabled = false,
  className,
  compact = false,
  'aria-label': ariaLabel,
}: AppSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const hasEmptyOption = options.some(option => option.value === '');
  const selectedValue = value === '' && !hasEmptyOption ? '' : optionValue(value);
  const endTapGuardRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endTapGuardRef.current?.(), []);

  return (
    <div className={cn('min-w-0', label && 'space-y-1.5', className)}>
      {label ? (
        <label htmlFor={triggerId} className="block text-[13px] font-semibold text-ink-muted">
          {label}
        </label>
      ) : null}
      <Select.Root
        value={selectedValue}
        onValueChange={next => onValueChange(next.slice('option:'.length))}
        disabled={disabled}
      >
        <Select.Trigger
          id={triggerId}
          type="button"
          aria-label={ariaLabel ?? (label ? undefined : placeholder)}
          onKeyDown={stopSelectTriggerKeys}
          className={cn(
            'group flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-control border-0 bg-surface px-3.5 text-left text-[15px] text-ink transition-[filter] hover:brightness-97 data-[placeholder]:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50',
            compact && 'h-9 rounded-chip px-3 text-[13px]',
          )}
        >
          <span className="min-w-0 truncate"><Select.Value placeholder={placeholder}>{displayValue}</Select.Value></span>
          <Select.Icon asChild>
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onKeyDown={stopAllKeys}
            onPointerDownOutside={event => {
              const press = event.detail.originalEvent;
              // 막힌 페이지(html)를 누른 터치·펜만. 진짜 요소에 닿은 누름은 마우스로 눌러도 그 요소가 받는다.
              if (press.pointerType === 'mouse' || press.target !== document.documentElement) return;
              endTapGuardRef.current?.();
              endTapGuardRef.current = swallowTapFollowUps(press);
            }}
            onClick={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            className="ui-popover ui-popover-surface z-[80] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden p-1.5 text-[15px] outline-none"
            style={{
              // Cap the first measurement too, and keep scroll buttons inside that cap
              // so mounting them cannot resize the popup or flip its placement.
              maxHeight: 'min(18rem, var(--radix-select-content-available-height, 18rem))',
              transformOrigin: 'var(--radix-select-content-transform-origin)',
            }}
          >
            <Select.ScrollUpButton className="flex h-6 items-center justify-center text-ink-faint">
              <ChevronUp aria-hidden="true" className="h-4 w-4" />
            </Select.ScrollUpButton>
            <Select.Viewport className="min-h-0 p-0.5">
              {options.map(option => (
                <Select.Item
                  key={option.value}
                  value={optionValue(option.value)}
                  disabled={option.disabled}
                  textValue={option.label}
                  className={cn(
                    'relative flex min-h-10 cursor-pointer select-none items-center rounded-control py-2 pr-9 pl-3 text-ink outline-none data-[highlighted]:bg-hover data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                    compact && 'min-h-9 text-sm',
                  )}
                >
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]"><Select.ItemText>{option.label}</Select.ItemText></span>
                  <Select.ItemIndicator className="absolute right-3 flex items-center text-pomo">
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="flex h-6 items-center justify-center text-ink-faint">
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
