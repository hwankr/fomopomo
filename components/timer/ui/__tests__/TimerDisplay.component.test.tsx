import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimerDisplay } from '../TimerDisplay';

const presets = [
  { id: 'preset-25', label: '집중', minutes: 25 },
  { id: 'preset-50', label: '집중', minutes: 50 },
  { id: 'preset-90', label: '집중', minutes: 90 },
];

const renderTimerDisplay = (onPresetClick = vi.fn(), overrides: Partial<Parameters<typeof TimerDisplay>[0]> = {}) =>
  render(
    <TimerDisplay
      timerMode="focus"
      timeLeft={25 * 60}
      isRunning={false}
      isSaving={false}
      cycleCount={1}
      longBreakInterval={4}
      presets={presets}
      showSaveButton={false}
      showResetButton={false}
      onToggleTimer={vi.fn()}
      onResetTimer={vi.fn()}
      onSaveTimer={vi.fn()}
      onChangeMode={vi.fn()}
      onPresetClick={onPresetClick}
      selectedTaskId={null}
      selectedTaskTitle=""
      onOpenTaskSidebar={vi.fn()}
      onClearTask={vi.fn()}
      {...overrides}
    />
  );

describe('TimerDisplay preset buttons', () => {
  it('shows identical labels with distinct durations and clicks the matching preset', () => {
    const onPresetClick = vi.fn();

    renderTimerDisplay(onPresetClick);

    const preset25 = screen.getByRole('button', { name: '집중 25분' });
    const preset50 = screen.getByRole('button', { name: '집중 50분' });
    const preset90 = screen.getByRole('button', { name: '집중 90분' });

    expect(within(preset25).getByText('집중')).toBeInTheDocument();
    expect(within(preset25).getByText('25분')).toBeInTheDocument();
    expect(within(preset50).getByText('집중')).toBeInTheDocument();
    expect(within(preset50).getByText('50분')).toBeInTheDocument();
    expect(within(preset90).getByText('집중')).toBeInTheDocument();
    expect(within(preset90).getByText('90분')).toBeInTheDocument();

    fireEvent.click(preset50);

    expect(onPresetClick).toHaveBeenCalledWith(50);
    expect(onPresetClick).toHaveBeenCalledTimes(1);
  });
});

describe('TimerDisplay task handoff', () => {
  it('completes the selected task without also toggling the timer', () => {
    const onCompleteTask = vi.fn();
    const onToggleTimer = vi.fn();
    renderTimerDisplay(vi.fn(), {
      selectedTaskId: 'task-a', selectedTaskTitle: '작업 A',
      isRunning: true, timeLeft: 300, canCompleteTask: true,
      onCompleteTask, onToggleTimer,
    });

    fireEvent.click(screen.getByRole('button', { name: '작업 완료 · 다음 작업' }));

    expect(onCompleteTask).toHaveBeenCalledOnce();
    expect(onToggleTimer).not.toHaveBeenCalled();
    expect(screen.getByText('05:00')).toBeInTheDocument();
  });

  it('prevents repeat completion while the task is being finalized', () => {
    const onCompleteTask = vi.fn();
    renderTimerDisplay(vi.fn(), {
      selectedTaskId: 'task-a', selectedTaskTitle: '작업 A',
      canCompleteTask: true, isCompletingTask: true, onCompleteTask,
    });
    const button = screen.getByRole('button', { name: '작업 완료 처리 중…' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onCompleteTask).not.toHaveBeenCalled();
  });

  it('offers reopening the next-task picker while the remainder is paused', () => {
    const onToggleTimer = vi.fn();
    renderTimerDisplay(vi.fn(), { timeLeft: 300, isChoosingNextTask: true, onToggleTimer });
    fireEvent.click(screen.getByRole('button', { name: '다음 작업 선택' }));
    expect(onToggleTimer).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('남은 시간부터');
    expect(screen.getByText('05:00')).toBeInTheDocument();
  });
});
