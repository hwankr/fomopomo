import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudySubject } from '@/lib/studySubjects';
import TaskCreateForm from '../TaskCreateForm';

// Real SubjectSelect + AppSelect (Radix Select) inside a real <form>. Radix adds a
// hidden native <select> to forms; when the value switches to a subject whose
// option has not registered yet, that native select reports "" and used to
// overwrite the new subject (the task was saved with subject_id "").
const mocks = vi.hoisted(() => ({
  subjects: [] as StudySubject[],
  createSubject: vi.fn(),
}));

vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: () => ({ subjects: mocks.subjects, createSubject: mocks.createSubject }),
}));

const MATH: StudySubject = { id: 'math', user_id: 'user-1', name: '수학' };
const NEW: StudySubject = { id: '7f1c0c1e-0000-4000-8000-000000000001', user_id: 'user-1', name: '블록체인' };

const openSubjectList = async () => {
  const trigger = screen.getByRole('combobox', { name: '과목' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  return screen.findAllByRole('option');
};

describe('TaskCreateForm subject selection', () => {
  afterEach(() => {
    mocks.subjects = [];
    mocks.createSubject.mockReset();
  });

  it('keeps a newly created subject selected and saves its id, never an empty string', async () => {
    mocks.subjects = [MATH];
    mocks.createSubject.mockResolvedValue(NEW);
    const onCreateTask = vi.fn().mockResolvedValue({ id: 'task', title: '블록체인 과제', status: 'todo', kind: 'daily', durationSeconds: 0 });
    render(<TaskCreateForm userId="user-1" onCreateTask={onCreateTask} />);

    fireEvent.click(screen.getByRole('button', { name: '작업 추가' }));
    fireEvent.change(screen.getByLabelText('새 작업 이름'), { target: { value: '과제 정리' } });
    await openSubjectList();
    fireEvent.click(screen.getByRole('option', { name: '+ 새 과목' }));
    fireEvent.change(await screen.findByLabelText('새 과목 이름'), { target: { value: '블록체인' } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('새 과목 이름'), { key: 'Enter' });
    });

    await waitFor(() => expect(screen.queryByLabelText('새 과목 이름')).not.toBeInTheDocument());
    // The list has not reloaded yet, but the new subject is shown by name right away.
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('블록체인');

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: '작업 추가' }));
    });

    expect(mocks.createSubject).toHaveBeenCalledWith('블록체인');
    expect(onCreateTask).toHaveBeenCalledWith({ title: '과제 정리', kind: 'daily', subjectId: NEW.id });
  });

  it('keeps an existing subject chosen from the list', async () => {
    mocks.subjects = [MATH];
    const onCreateTask = vi.fn().mockResolvedValue({ id: 'task', title: 't', status: 'todo', kind: 'daily', durationSeconds: 0 });
    render(<TaskCreateForm userId="user-1" onCreateTask={onCreateTask} />);

    fireEvent.click(screen.getByRole('button', { name: '작업 추가' }));
    fireEvent.change(screen.getByLabelText('새 작업 이름'), { target: { value: '복습' } });
    await openSubjectList();
    fireEvent.click(screen.getByRole('option', { name: '수학' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('수학');

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: '작업 추가' }));
    });
    expect(onCreateTask).toHaveBeenCalledWith({ title: '복습', kind: 'daily', subjectId: 'math' });
  });
});
