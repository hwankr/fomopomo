'use client';

import { useId } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  'aria-label'?: string;
};

// Encoding every option also makes an explicit empty option distinct from the placeholder.
const optionValue = (value: string) => `option:${value}`;

export default function AppSelect({
  value,
  onValueChange,
  options,
  label,
  id,
  placeholder = '선택',
  disabled = false,
  className,
  compact = false,
  'aria-label': ariaLabel,
}: AppSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const hasEmptyOption = options.some(option => option.value === '');
  const selectedValue = value === '' && !hasEmptyOption ? '' : optionValue(value);

  return (
    <div className={cn('min-w-0', label && 'space-y-1.5', className)}>
      {label ? (
        <label htmlFor={triggerId} className="block text-xs font-medium text-slate-600 dark:text-slate-300">
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
          onKeyDown={event => event.stopPropagation()}
          className={cn(
            'group flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 shadow-sm outline-none transition-[border-color,box-shadow,background-color] hover:border-slate-300 focus-visible:border-rose-400 focus-visible:ring-3 focus-visible:ring-rose-100 data-[state=open]:border-rose-300 data-[placeholder]:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600 dark:focus-visible:border-rose-400 dark:focus-visible:ring-rose-500/20 dark:data-[state=open]:border-rose-500/60',
            compact && 'px-2.5 text-xs',
          )}
        >
          <span className="min-w-0 truncate"><Select.Value placeholder={placeholder} /></span>
          <Select.Icon asChild>
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onKeyDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            className="ui-popover z-[80] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-sm text-slate-700 shadow-lg shadow-slate-900/10 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:shadow-black/25"
            style={{
              maxHeight: 'var(--radix-select-content-available-height)',
              transformOrigin: 'var(--radix-select-content-transform-origin)',
            }}
          >
            <Select.ScrollUpButton className="flex h-6 items-center justify-center text-slate-400">
              <ChevronUp aria-hidden="true" className="h-4 w-4" />
            </Select.ScrollUpButton>
            <Select.Viewport className="max-h-72 p-0.5">
              {options.map(option => (
                <Select.Item
                  key={option.value}
                  value={optionValue(option.value)}
                  disabled={option.disabled}
                  textValue={option.label}
                  className={cn(
                    'relative flex min-h-9 cursor-default select-none items-center rounded-lg py-2 pr-8 pl-2.5 outline-none data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-700 data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-40 dark:data-[highlighted]:bg-rose-500/15 dark:data-[highlighted]:text-rose-200',
                    compact && 'text-xs',
                  )}
                >
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]"><Select.ItemText>{option.label}</Select.ItemText></span>
                  <Select.ItemIndicator className="absolute right-2.5 flex items-center text-rose-500 dark:text-rose-400">
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="flex h-6 items-center justify-center text-slate-400">
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
