'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import ModalDialog from '@/components/ui/ModalDialog';
import type { Preset, Settings } from '../hooks/useSettings';

export type TimerDurationSettings = Pick<Settings, 'pomoTime' | 'shortBreak' | 'longBreak' | 'longBreakInterval'>;

type StepperDefinition = {
  key: keyof TimerDurationSettings;
  label: string;
  min: number;
  max: number;
  unit: string;
};

// 보드의 범위. 다른 화면에서 이보다 길게 정해 둔 값은 줄이지 않는다.
const STEPPERS: StepperDefinition[] = [
  { key: 'pomoTime', label: '뽀모도로', min: 1, max: 90, unit: '분' },
  { key: 'shortBreak', label: '짧은 휴식', min: 1, max: 30, unit: '분' },
  { key: 'longBreak', label: '긴 휴식', min: 1, max: 60, unit: '분' },
  { key: 'longBreakInterval', label: '긴 휴식까지 사이클', min: 1, max: 8, unit: '회' },
];

type TimerSettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  /** 저장에 성공하면 true. 실패하면 창을 열어 둔 채 다시 시도할 수 있게 한다. */
  onSave: (values: TimerDurationSettings) => Promise<boolean>;
  /** 프리셋을 바로 적용하면 true(창을 닫는다). 실행 중이라 못 바꾸면 false. */
  onPresetClick: (minutes: number) => boolean;
};

// 타이머 화면의 빠른 설정. 시간·사이클과 프리셋만 두고 나머지는 /settings로 보낸다.
export function TimerSettingsDialog({ open, onClose, settings, onSave, onPresetClick }: TimerSettingsDialogProps) {
  const titleId = useId();
  return (
    <ModalDialog open={open} onClose={onClose} aria-labelledby={titleId} className="md:gap-5">
      <TimerSettingsBody
        titleId={titleId}
        settings={settings}
        onClose={onClose}
        onSave={onSave}
        onPresetClick={onPresetClick}
      />
    </ModalDialog>
  );
}

function TimerSettingsBody({
  titleId,
  settings,
  onClose,
  onSave,
  onPresetClick,
}: Omit<TimerSettingsDialogProps, 'open'> & { titleId: string }) {
  // 열 때의 값에서 시작하는 초안. 저장하기 전에는 타이머에 반영하지 않는다.
  const [initial] = useState<TimerDurationSettings>(() => ({
    pomoTime: settings.pomoTime,
    shortBreak: settings.shortBreak,
    longBreak: settings.longBreak,
    longBreakInterval: settings.longBreakInterval,
  }));
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  const step = (definition: StepperDefinition, delta: number) => {
    const max = Math.max(definition.max, initial[definition.key]);
    setDraft((current) => ({
      ...current,
      [definition.key]: Math.min(max, Math.max(definition.min, current[definition.key] + delta)),
    }));
  };

  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      if (await onSave(draft)) onClose();
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
      <h2 id={titleId} className="ui-dialog-title">타이머 설정</h2>

      <div className="flex flex-col gap-0.5 md:gap-1">
        {STEPPERS.map((definition) => {
          const value = draft[definition.key];
          const max = Math.max(definition.max, initial[definition.key]);
          return (
            <div
              key={definition.key}
              role="group"
              aria-label={definition.label}
              className="flex min-h-[60px] items-center justify-between gap-3 py-1 md:min-h-[68px] md:gap-4 md:py-1.5"
            >
              <span className="text-sm font-medium md:text-[15px]">{definition.label}</span>
              <div className="flex items-center gap-1 md:gap-1.5">
                <button
                  type="button"
                  aria-label={`${definition.label} 줄이기`}
                  disabled={value <= definition.min}
                  onClick={() => step(definition, -1)}
                  className="ui-icon-button-surface ui-press text-xl leading-none"
                >
                  −
                </button>
                <span aria-live="polite" className="min-w-[58px] text-center text-[15px] font-bold md:min-w-16 md:text-base">
                  {value}
                  {definition.unit}
                </span>
                <button
                  type="button"
                  aria-label={`${definition.label} 늘리기`}
                  disabled={value >= max}
                  onClick={() => step(definition, 1)}
                  className="ui-icon-button-surface ui-press text-xl leading-none"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {settings.presets.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-muted">프리셋으로 바로 바꾸기</span>
          <div className="flex flex-wrap gap-2">
            {settings.presets.map((preset: Preset) => (
              <button
                key={preset.id}
                type="button"
                aria-label={`${preset.label} ${preset.minutes}분`}
                onClick={() => { if (onPresetClick(preset.minutes)) onClose(); }}
                className="ui-button-secondary ui-press min-h-9 max-w-full rounded-full px-3.5 text-sm"
              >
                <span className="min-w-0 truncate" title={preset.label}>{preset.label}</span>
                <span className="shrink-0 font-bold text-ink-muted">{preset.minutes}분</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-2 md:pt-1">
        <Link
          href="/settings"
          className="-ml-2.5 flex min-h-11 items-center self-start rounded-control px-2.5 text-sm font-semibold text-ink-muted no-underline transition-colors hover:bg-hover md:mr-auto md:-ml-3 md:min-h-12 md:self-auto md:rounded-tile md:px-3"
        >
          과목·알림·계정 설정
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="ui-button-secondary ui-press min-h-[50px] flex-1 rounded-tile px-5 md:min-h-12 md:flex-none"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => { void save(); }}
            disabled={saving}
            aria-busy={saving}
            className="ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile px-6 md:min-h-12 md:flex-none"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </>
  );
}
