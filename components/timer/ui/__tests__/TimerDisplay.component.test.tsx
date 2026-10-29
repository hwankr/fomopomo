import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StopwatchDisplay } from '../StopwatchDisplay';
import { TimerDisplay } from '../TimerDisplay';

const renderTimerDisplay = (overrides: Partial<Parameters<typeof TimerDisplay>[0]> = {}) =>
  render(
    <TimerDisplay
      timerMode="focus"
      timeLeft={25 * 60}
      timerDuration={25 * 60}
      isRunning={false}
      isSaving={false}
      cycleCount={0}
      longBreakInterval={4}
      showSaveButton={false}
      showResetButton={false}
      onToggleTimer={vi.fn()}
      onResetTimer={vi.fn()}
      onSaveTimer={vi.fn()}
      onOpenSettings={vi.fn()}
      selectedTaskId={null}
      selectedTaskTitle=""
      onToggleTaskPicker={vi.fn()}
      {...overrides}
    />
  );

const beadStates = () =>
  Array.from(screen.getByRole('img').querySelectorAll('[data-state]')).map((bead) => bead.getAttribute('data-state'));

// 무대 아래쪽 자리: [재설정 칸][시작][설정 칸] 줄과 그 아래 칩 줄
const controlsRow = () => document.querySelector('[data-stage-controls]') as HTMLElement;
const slot = (name: 'reset' | 'settings') => document.querySelector(`[data-stage-slot="${name}"]`) as HTMLElement;
const chipRow = () => document.querySelector('[data-stage-chip-row]') as HTMLElement;
const buttonNames = (container: HTMLElement) =>
  within(container).queryAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent);

describe('TimerDisplay stage', () => {
  it('shows the resting status, cycle, spoken time and one empty bead per minute', () => {
    renderTimerDisplay();

    expect(screen.getByText('집중할 준비')).toBeInTheDocument();
    expect(screen.getByText('사이클 1 / 4')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveAccessibleName('남은 시간 25분 0초');
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
    expect(screen.getByRole('img', { name: '25분 중 0분 지남' })).toBeInTheDocument();
    expect(beadStates()).toEqual(Array(25).fill('empty'));
    expect(screen.getByRole('button', { name: '시작' })).toBeInTheDocument();
  });

  it('fills elapsed minutes and pulses the current one while running', () => {
    renderTimerDisplay({ isRunning: true, timeLeft: 22 * 60 + 30 });

    expect(screen.getByText('집중 중')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '25분 중 2분 지남' })).toBeInTheDocument();
    expect(beadStates().slice(0, 4)).toEqual(['done', 'done', 'current', 'empty']);
    expect(screen.getByRole('button', { name: '일시정지' })).toBeInTheDocument();
  });

  it('shows the paused status with reset and partial-save actions', () => {
    const onResetTimer = vi.fn();
    const onSaveTimer = vi.fn();
    renderTimerDisplay({ timeLeft: 20 * 60, showResetButton: true, showSaveButton: true, onResetTimer, onSaveTimer });

    expect(screen.getByText('일시정지')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '타이머 초기화' }));
    fireEvent.click(screen.getByRole('button', { name: '기록 저장' }));
    expect(onResetTimer).toHaveBeenCalledOnce();
    expect(onSaveTimer).toHaveBeenCalledOnce();
  });

  it('labels breaks as rest and counts them in the cycle they follow', () => {
    renderTimerDisplay({ timerMode: 'longBreak', timeLeft: 15 * 60, timerDuration: 15 * 60, cycleCount: 4 });

    expect(screen.getByText('쉴 준비')).toBeInTheDocument();
    expect(screen.getByText('사이클 4 / 4')).toBeInTheDocument();
  });

  it('uses hours in the clock and the spoken label for long sessions', () => {
    renderTimerDisplay({ timeLeft: 3900, timerDuration: 3900 });

    expect(screen.getByRole('timer')).toHaveTextContent('01:05:00');
    expect(screen.getByRole('timer')).toHaveAccessibleName('남은 시간 1시간 5분 0초');
  });

  it('opens the quick settings and the task picker from the stage', () => {
    const onOpenSettings = vi.fn();
    const onToggleTaskPicker = vi.fn();
    renderTimerDisplay({
      onOpenSettings, onToggleTaskPicker,
      selectedTaskId: 'task-a', selectedTaskTitle: '알고리즘 문제 풀기', selectedTaskSubject: '컴퓨터과학',
      isTaskPickerOpen: true,
    });

    const trigger = screen.getByRole('button', { name: /지금 하는 일/ });
    expect(trigger).toHaveTextContent('알고리즘 문제 풀기');
    expect(trigger).toHaveTextContent('컴퓨터과학');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: '타이머 설정' }));
    expect(onToggleTaskPicker).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('asks for a task when none is selected', () => {
    renderTimerDisplay();
    expect(screen.getByRole('button', { name: /지금 하는 일/ })).toHaveTextContent('작업을 골라 주세요');
  });
});

describe('TimerDisplay ended banner', () => {
  it('shows the finished focus phase (00:00, full beads, its cycle and colour) while the break is staged', () => {
    const onEndedPrimary = vi.fn();
    const onEndedSecondary = vi.fn();
    renderTimerDisplay({
      timerMode: 'shortBreak', timeLeft: 5 * 60, timerDuration: 5 * 60, cycleCount: 1,
      ended: { mode: 'focus', duration: 25 * 60, cycleCount: 0 }, onEndedPrimary, onEndedSecondary,
      showResetButton: true,
    });

    expect(screen.getByText('집중 끝')).toBeInTheDocument();
    expect(screen.getByText('사이클 1 / 4')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(screen.getByRole('timer')).toHaveAccessibleName('남은 시간 0분 0초');
    expect(screen.getByRole('img', { name: '25분 중 25분 지남' })).toBeInTheDocument();
    expect(beadStates()).toEqual(Array(25).fill('done'));
    expect(screen.getByRole('button', { name: '시작' })).toHaveClass('bg-pomo');
    expect(screen.getByRole('button', { name: '휴식 시작' })).toHaveClass('bg-pomo');
    expect(screen.getByRole('button', { name: '타이머 초기화' })).toBeInTheDocument();
    // 안내 문구는 준비된 다음 단계(5분 휴식)를 말한다.
    expect(screen.getByText('집중 시간이 끝났어요. 5분 쉬어 가요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '휴식 시작' }));
    fireEvent.click(screen.getByRole('button', { name: '계속 집중' }));
    expect(onEndedPrimary).toHaveBeenCalledOnce();
    expect(onEndedSecondary).toHaveBeenCalledOnce();
  });

  it('mentions the long break once the cycle is complete', () => {
    renderTimerDisplay({
      timerMode: 'longBreak', timeLeft: 15 * 60, timerDuration: 15 * 60, cycleCount: 4,
      ended: { mode: 'focus', duration: 25 * 60, cycleCount: 3 },
    });
    expect(screen.getByText('사이클 4 / 4')).toBeInTheDocument();
    expect(screen.getByText('집중 시간이 끝났어요. 사이클을 다 채웠으니 15분 길게 쉬어요.')).toBeInTheDocument();
  });

  it('shows the finished break in its own colour and offers focus or a little more rest', () => {
    renderTimerDisplay({ cycleCount: 1, ended: { mode: 'shortBreak', duration: 5 * 60, cycleCount: 1 } });

    expect(screen.getByText('휴식 끝')).toBeInTheDocument();
    expect(screen.getByText('사이클 1 / 4')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(beadStates()).toEqual(Array(5).fill('done'));
    expect(screen.getByRole('button', { name: '시작' })).toHaveClass('bg-rest');
    expect(screen.getByText('휴식이 끝났어요. 다시 집중해 볼까요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '집중 시작' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '조금 더 쉬기' })).toBeInTheDocument();
  });
});

describe('TimerDisplay motion', () => {
  it('lets the banner rise only for a phase that just ended on screen', () => {
    const ended = { mode: 'focus' as const, duration: 25 * 60, cycleCount: 0 };
    const view = renderTimerDisplay({ timerMode: 'shortBreak', timeLeft: 5 * 60, timerDuration: 5 * 60, ended: { ...ended, live: true } });
    const banner = () => screen.getByText('집중 시간이 끝났어요. 5분 쉬어 가요.').parentElement!;
    expect(banner()).toHaveClass('animate-fade-up');
    view.unmount();

    // 다시 열며 복원한 끝남은 화면과 함께 나타나므로 따로 움직이지 않는다.
    renderTimerDisplay({ timerMode: 'shortBreak', timeLeft: 5 * 60, timerDuration: 5 * 60, ended });
    expect(banner()).not.toHaveClass('animate-fade-up');
  });

  it('pops the minute bead that just finished, not the ones restored on mount', () => {
    const view = renderTimerDisplay({ isRunning: true, timeLeft: 23 * 60 + 5 });
    const beads = () => Array.from(screen.getByRole('img').querySelectorAll('.ui-bead'));
    expect(beads().filter((bead) => bead.classList.contains('animate-pop'))).toHaveLength(0);

    view.rerender(
      <TimerDisplay
        timerMode="focus" timeLeft={22 * 60 + 59} timerDuration={25 * 60} isRunning isSaving={false} cycleCount={0}
        longBreakInterval={4} showSaveButton={false} showResetButton={false} onToggleTimer={vi.fn()} onResetTimer={vi.fn()}
        onSaveTimer={vi.fn()} selectedTaskId={null} selectedTaskTitle="" onToggleTaskPicker={vi.fn()}
      />,
    );
    // 1분 55초 → 2분 1초: 지금이던 두 번째 구슬이 끝났다.
    expect(beads().map((bead) => bead.classList.contains('animate-pop'))).toEqual([false, true, ...Array(23).fill(false)]);
  });

  it('keeps the press (scale) in the transitions the stage controls override', () => {
    renderTimerDisplay({ timeLeft: 20 * 60, showResetButton: true });
    expect(screen.getByRole('button', { name: '시작' }).className).toContain('transition-[filter,background-color,scale]');
    expect(screen.getByRole('button', { name: '타이머 초기화' }).className).toContain('transition-[background-color,filter,scale]');
    expect(screen.getByRole('button', { name: /지금 하는 일/ })).toHaveClass('ui-press');
    expect(screen.getByRole('button', { name: /지금 하는 일/ }).className).toContain('transition-[color,background-color,scale]');
  });

  it('points the task button at the open picker', () => {
    const view = renderTimerDisplay({ taskPickerId: 'picker' });
    const trigger = screen.getByRole('button', { name: /지금 하는 일/ });
    expect(trigger).not.toHaveAttribute('aria-controls');
    view.unmount();
    renderTimerDisplay({ taskPickerId: 'picker', isTaskPickerOpen: true });
    expect(screen.getByRole('button', { name: /지금 하는 일/ })).toHaveAttribute('aria-controls', 'picker');
  });
});

describe('TimerDisplay task handoff', () => {
  it('completes the selected task without also toggling the timer', () => {
    const onCompleteTask = vi.fn();
    const onToggleTimer = vi.fn();
    renderTimerDisplay({
      selectedTaskId: 'task-a', selectedTaskTitle: '작업 A',
      isRunning: true, timeLeft: 300, canCompleteTask: true,
      onCompleteTask, onToggleTimer,
    });

    fireEvent.click(screen.getByRole('button', { name: '작업 완료 · 다음 작업' }));

    expect(onCompleteTask).toHaveBeenCalledOnce();
    expect(onToggleTimer).not.toHaveBeenCalled();
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
  });

  it('prevents repeat completion while the task is being finalized', () => {
    const onCompleteTask = vi.fn();
    renderTimerDisplay({
      selectedTaskId: 'task-a', selectedTaskTitle: '작업 A',
      canCompleteTask: true, isCompletingTask: true, onCompleteTask,
    });
    const button = screen.getByRole('button', { name: '작업 완료 처리 중…' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onCompleteTask).not.toHaveBeenCalled();
  });

  it('keeps the resting stage simple while completion is not possible', () => {
    renderTimerDisplay({ selectedTaskId: 'task-a', selectedTaskTitle: '작업 A', onCompleteTask: vi.fn() });
    expect(screen.queryByRole('button', { name: '작업 완료 · 다음 작업' })).not.toBeInTheDocument();
  });

  it('offers reopening the next-task picker while the remainder is paused', () => {
    const onToggleTimer = vi.fn();
    renderTimerDisplay({
      timeLeft: 300, isChoosingNextTask: true, onToggleTimer,
      selectedTaskTitle: '끝낸 작업',
    });
    fireEvent.click(screen.getByRole('button', { name: '다음 작업 선택' }));
    expect(onToggleTimer).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('남은 시간부터');
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
  });
});

describe('TimerDisplay stage layout', () => {
  it('keeps reset left and settings right of the start button, holding an empty reset slot while reset is hidden', () => {
    const view = renderTimerDisplay();
    expect(Array.from(controlsRow().children)).toEqual([slot('reset'), screen.getByRole('button', { name: '시작' }), slot('settings')]);
    // 빈 칸은 자리만 차지한다(포커스도 낭독도 없음).
    expect(slot('reset')).toBeEmptyDOMElement();
    expect(slot('reset')).not.toHaveAttribute('tabindex');
    expect(slot('reset')).not.toHaveAttribute('role');
    expect(buttonNames(controlsRow())).toEqual(['시작', '타이머 설정']);
    view.unmount();

    renderTimerDisplay({ timeLeft: 20 * 60, showResetButton: true });
    expect(Array.from(controlsRow().children)).toEqual([slot('reset'), screen.getByRole('button', { name: '시작' }), slot('settings')]);
    expect(slot('reset')).toContainElement(screen.getByRole('button', { name: '타이머 초기화' }));
    expect(slot('settings')).toContainElement(screen.getByRole('button', { name: '타이머 설정' }));
    // 탭 순서도 초기화 → 시작 → 설정
    expect(buttonNames(controlsRow())).toEqual(['타이머 초기화', '시작', '타이머 설정']);
  });

  it('keeps both side slots while running and without a settings handler', () => {
    renderTimerDisplay({ isRunning: true, timeLeft: 20 * 60, onOpenSettings: undefined });
    expect(Array.from(controlsRow().children)).toEqual([slot('reset'), screen.getByRole('button', { name: '일시정지' }), slot('settings')]);
    expect(slot('reset')).toBeEmptyDOMElement();
    expect(slot('settings')).toBeEmptyDOMElement();
  });

  it('reserves the chip row below the controls whether or not a chip shows', () => {
    const view = renderTimerDisplay();
    expect(chipRow()).toBeInTheDocument();
    expect(chipRow()).toBeEmptyDOMElement();
    expect(controlsRow().compareDocumentPosition(chipRow()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.unmount();

    renderTimerDisplay({
      timeLeft: 20 * 60, showResetButton: true, showSaveButton: true,
      selectedTaskId: 'task-a', selectedTaskTitle: '작업 A', canCompleteTask: true, onCompleteTask: vi.fn(),
    });
    expect(buttonNames(chipRow())).toEqual(['기록 저장', '작업 완료 · 다음 작업']);
  });
});

describe('StopwatchDisplay', () => {
  const renderStopwatch = (overrides: Partial<Parameters<typeof StopwatchDisplay>[0]> = {}) =>
    render(
      <StopwatchDisplay
        stopwatchTime={0}
        isStopwatchRunning={false}
        isSaving={false}
        onToggleStopwatch={vi.fn()}
        onSaveStopwatch={vi.fn()}
        onResetStopwatch={vi.fn()}
        selectedTaskId={null}
        selectedTaskTitle=""
        onToggleTaskPicker={vi.fn()}
        {...overrides}
      />
    );

  it('grows one bead per elapsed minute plus the current one while running', () => {
    renderStopwatch({ stopwatchTime: 3 * 60 + 5, isStopwatchRunning: true });

    expect(screen.getByText('재는 중')).toBeInTheDocument();
    expect(screen.getByText('시간을 재요')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveAccessibleName('경과 3분 5초');
    expect(screen.getByRole('img', { name: '3분 경과' })).toBeInTheDocument();
    expect(beadStates()).toEqual(['done', 'done', 'done', 'current']);
  });

  it('caps the row at sixty beads', () => {
    renderStopwatch({ stopwatchTime: 2 * 3600 });
    expect(beadStates()).toHaveLength(60);
  });

  it('offers resume, save and reset once paused with progress', () => {
    const onSaveStopwatch = vi.fn();
    const onResetStopwatch = vi.fn();
    renderStopwatch({ stopwatchTime: 90, onSaveStopwatch, onResetStopwatch });

    expect(screen.getByText('일시정지')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재개' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '기록 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '스톱워치 초기화' }));
    expect(onSaveStopwatch).toHaveBeenCalledOnce();
    expect(onResetStopwatch).toHaveBeenCalledOnce();
  });

  it('keeps reset left and settings right of the start button, holding an empty reset slot while reset is hidden', () => {
    const view = renderStopwatch({ onOpenSettings: vi.fn() });
    expect(Array.from(controlsRow().children)).toEqual([slot('reset'), screen.getByRole('button', { name: '시작' }), slot('settings')]);
    expect(slot('reset')).toBeEmptyDOMElement();
    expect(buttonNames(controlsRow())).toEqual(['시작', '타이머 설정']);
    view.unmount();

    renderStopwatch({ stopwatchTime: 90, isStopwatchRunning: true, onOpenSettings: vi.fn() });
    expect(slot('reset')).toBeEmptyDOMElement();
    expect(buttonNames(controlsRow())).toEqual(['일시정지', '타이머 설정']);
  });

  it('puts reset in its slot and the save chip in the reserved row once paused', () => {
    const view = renderStopwatch();
    expect(chipRow()).toBeEmptyDOMElement();
    view.unmount();

    renderStopwatch({ stopwatchTime: 90, onOpenSettings: vi.fn() });
    expect(Array.from(controlsRow().children)).toEqual([slot('reset'), screen.getByRole('button', { name: '재개' }), slot('settings')]);
    expect(buttonNames(controlsRow())).toEqual(['스톱워치 초기화', '재개', '타이머 설정']);
    expect(buttonNames(chipRow())).toEqual(['기록 저장']);
  });
});
