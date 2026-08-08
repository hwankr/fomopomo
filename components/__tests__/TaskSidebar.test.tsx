import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TaskSidebar from '../TaskSidebar';
import type { TaskItem } from '../timer/hooks/useTasks';

const makeTask = (
  over: Partial<TaskItem> & { id: string; title: string }
): TaskItem => ({
  status: 'todo',
  durationSeconds: 0,
  kind: 'daily',
  ...over,
});

const noop = () => {};

function renderSidebar(over: Partial<Parameters<typeof TaskSidebar>[0]> = {}) {
  return render(
    <TaskSidebar
      isOpen
      onClose={noop}
      tasks={[]}
      weeklyPlans={[]}
      monthlyPlans={[]}
      onSelectTask={noop}
      onToggleTask={noop}
      selectedTaskId={null}
      {...over}
    />
  );
}

describe('TaskSidebar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders all three sections with duration badges', () => {
    renderSidebar({
      tasks: [makeTask({ id: 't1', title: '오늘 작업', durationSeconds: 5400 })],
      weeklyPlans: [
        makeTask({ id: 'w1', title: '주간 작업', kind: 'weekly', durationSeconds: 600 }),
      ],
      monthlyPlans: [
        makeTask({ id: 'm1', title: '월간 작업', kind: 'monthly', durationSeconds: 60 }),
      ],
    });

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('This month')).toBeInTheDocument();
    expect(screen.getByText('오늘 작업')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
    expect(screen.getByText('10m')).toBeInTheDocument();
    expect(screen.getByText('1m')).toBeInTheDocument();
  });

  it('does not render a duration badge for zero seconds', () => {
    renderSidebar({
      tasks: [makeTask({ id: 't1', title: '시간 없음', durationSeconds: 0 })],
    });

    expect(screen.getByText('시간 없음')).toBeInTheDocument();
    expect(screen.queryByText('0m')).not.toBeInTheDocument();
  });

  it('sorts done tasks below todo tasks and strikes them through', () => {
    const { container } = renderSidebar({
      tasks: [
        makeTask({ id: 't1', title: '끝난 작업', status: 'done' }),
        makeTask({ id: 't2', title: '남은 작업' }),
      ],
    });

    const text = container.textContent ?? '';
    expect(text.indexOf('남은 작업')).toBeLessThan(text.indexOf('끝난 작업'));
    expect(screen.getByText('끝난 작업').closest('button')).toHaveClass(
      'line-through'
    );
    expect(screen.getByText('남은 작업').closest('button')).not.toHaveClass(
      'line-through'
    );
  });

  it('toggles without selecting or closing', () => {
    const onSelectTask = vi.fn();
    const onToggleTask = vi.fn();
    const onClose = vi.fn();
    const task = makeTask({ id: 't1', title: '작업' });

    renderSidebar({ tasks: [task], onSelectTask, onToggleTask, onClose });

    fireEvent.click(screen.getByRole('button', { name: '완료로 표시' }));

    expect(onToggleTask).toHaveBeenCalledWith(task);
    expect(onSelectTask).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('selects a task (even a done one) and closes', () => {
    const onSelectTask = vi.fn();
    const onClose = vi.fn();
    const task = makeTask({ id: 't1', title: '끝난 작업', status: 'done' });

    renderSidebar({ tasks: [task], onSelectTask, onClose });

    fireEvent.click(screen.getByText('끝난 작업'));

    expect(onSelectTask).toHaveBeenCalledWith(task);
    expect(onClose).toHaveBeenCalled();
  });

  it('clears the selection via "Start without a task"', () => {
    const onSelectTask = vi.fn();
    const onClose = vi.fn();

    renderSidebar({ onSelectTask, onClose, selectedTaskId: 't1' });

    fireEvent.click(screen.getByText('Start without a task'));

    expect(onSelectTask).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });
});
