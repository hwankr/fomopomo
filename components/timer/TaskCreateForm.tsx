'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import SubjectSelect from '@/components/subjects/SubjectSelect';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { useSuggestedSubject } from '@/hooks/useSuggestedSubject';
import type { CreateTaskInput, TaskItem, TaskKind } from './hooks/useTasks';

type TaskCreateFormProps = {
  userId: string;
  onCreateTask: (input: CreateTaskInput) => Promise<TaskItem | null>;
};

export default function TaskCreateForm(props: TaskCreateFormProps) {
  const [isAdding, setIsAdding] = useState(false);
  return isAdding ? <CreateForm {...props} onClose={() => setIsAdding(false)} /> : (
    <button type="button" onClick={() => setIsAdding(true)}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-rose-200 px-3 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30">
      <Plus className="h-4 w-4" aria-hidden="true" />일정 추가
    </button>
  );
}

function CreateForm({ userId, onCreateTask, onClose }: TaskCreateFormProps & { onClose: () => void }) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('daily');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const active = useRef(false);
  const { subjects, createSubject } = useStudySubjects(userId);
  const { subjectId, selectSubject, resetSubject, isAutomatic } = useSuggestedSubject(title, subjects);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || !title.trim()) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const created = await onCreateTask({ title: title.trim(), kind, subjectId });
      if (!active.current) return;
      if (created) onClose();
      else setError('일정을 추가하지 못했어요. 다시 시도해주세요.');
    } catch {
      if (active.current) setError('일정을 추가하지 못했어요. 다시 시도해주세요.');
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  };

  return (
    <form aria-label="일정 추가" onSubmit={submit}
      className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <fieldset disabled={saving} className="min-w-0 space-y-3">
        <div>
          <label htmlFor={`${id}-title`} className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">일정 제목</label>
          <input id={`${id}-title`} autoFocus value={title} onChange={event => setTitle(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}
            placeholder="어떤 일을 계획하고 있나요?" required aria-describedby={error ? `${id}-error` : undefined}
            className="ui-input w-full min-w-0 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor={`${id}-kind`} className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">기간</label>
          <select id={`${id}-kind`} value={kind} onChange={event => setKind(event.target.value as TaskKind)}
            className="ui-input w-full px-3 py-2 text-sm">
            <option value="daily">오늘</option>
            <option value="weekly">이번 주</option>
            <option value="monthly">이번 달</option>
          </select>
        </div>
        <SubjectSelect subjects={subjects} value={subjectId} onChange={selectSubject}
          onCreate={createSubject} automatic={isAutomatic} onAutoSelect={resetSubject} disabled={saving} />
      </fieldset>
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={saving}
          className="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-slate-700">취소</button>
        <button type="submit" disabled={saving || !title.trim()} aria-busy={saving}
          className="ui-button-primary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50">{saving ? '추가 중…' : '추가'}</button>
      </div>
    </form>
  );
}
