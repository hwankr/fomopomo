import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskModal } from '../TaskModal';
import type { TaskItem } from '../../hooks/useTasks';

vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: () => ({
    subjects: [{ id: 'blockchain', user_id: 'user-1', name: '블록체인' }],
    loading: false,
    error: null,
    createSubject: vi.fn(),
  }),
}));

const dbTasks: TaskItem[] = [
  { id: 't1', title: '독서', status: 'todo', durationSeconds: 0, kind: 'daily' },
];

const baseProps = {
  isOpen: true,
  dbTasks: [],
  selectedTask: '',
  selectedTaskId: null,
  onSelectTask: vi.fn(),
  onSave: vi.fn(),
  onSkip: vi.fn(),
  onDisablePopup: vi.fn(),
};

describe('TaskModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the parent selectedTask as the input value', () => {
    render(<TaskModal {...baseProps} selectedTask="독서" />);
    expect(screen.getByPlaceholderText('예: 독서, 코딩...')).toHaveValue('독서');
  });

  it('does not keep a stale task name when reopened after the parent reset', () => {
    const { rerender } = render(<TaskModal {...baseProps} selectedTask="독서" />);
    rerender(<TaskModal {...baseProps} isOpen={false} selectedTask="" />);
    rerender(<TaskModal {...baseProps} isOpen={true} selectedTask="" />);

    expect(screen.getByPlaceholderText('예: 독서, 코딩...')).toHaveValue('');
  });

  it('propagates typed input to the parent and clears the task id', () => {
    render(<TaskModal {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText('예: 독서, 코딩...'), {
      target: { value: '코딩' },
    });

    expect(baseProps.onSelectTask).toHaveBeenCalledWith('코딩', null);
  });

  it('selects a db task with its id when its button is clicked', () => {
    render(<TaskModal {...baseProps} dbTasks={dbTasks} />);

    fireEvent.click(screen.getByRole('button', { name: '독서' }));

    expect(baseProps.onSelectTask).toHaveBeenCalledWith('독서', 't1');
  });

  it('enables the save button only when a task name is present', () => {
    const { rerender } = render(<TaskModal {...baseProps} selectedTask="  " />);
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();

    rerender(<TaskModal {...baseProps} selectedTask="독서" />);
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
  });

  it('lets a freeform completion record choose a subject without changing its task title', async () => {
    const onSelectSubject = vi.fn();
    render(<TaskModal {...baseProps} selectedTask="블록체인 9/12 복습" onSelectSubject={onSelectSubject} />);

    fireEvent.keyDown(screen.getByRole('combobox', { name: '공부 과목' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '블록체인' }));

    expect(onSelectSubject).toHaveBeenCalledWith('blockchain');
    expect(baseProps.onSelectTask).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('예: 독서, 코딩...')).toHaveValue('블록체인 9/12 복습');
  });

  it('locks attempted labels but permits retrying an unlabeled save', () => {
    render(<TaskModal {...baseProps} labelsLocked onSelectSubject={vi.fn()} />);
    expect(screen.getByPlaceholderText('예: 독서, 코딩...')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '공부 과목' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '건너뛰기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }));
    expect(baseProps.onSave).toHaveBeenCalledOnce();
  });
});
