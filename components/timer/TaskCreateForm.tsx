'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import SubjectSelect from '@/components/subjects/SubjectSelect';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { useSuggestedSubject } from '@/hooks/useSuggestedSubject';
import type { CreateTaskInput, TaskItem, TaskKind } from './hooks/useTasks';

type TaskCreateFormProps = {
  userId: string;
  onCreateTask: (input: CreateTaskInput) => Promise<TaskItem | null>;
  /** 닫혀 있을 때 '작업 추가' 버튼 옆 오른쪽에 둘 요소 */
  trailing?: ReactNode;
};

const PERIODS: { value: TaskKind; label: string }[] = [
  { value: 'daily', label: '오늘' },
  { value: 'weekly', label: '이번 주' },
  { value: 'monthly', label: '이번 달' },
];

export default function TaskCreateForm({ trailing, ...props }: TaskCreateFormProps) {
  const [isAdding, setIsAdding] = useState(false);
  return isAdding ? <CreateForm {...props} onClose={() => setIsAdding(false)} /> : (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => setIsAdding(true)}
        className="ui-button-ghost -ml-2.5 min-h-11 gap-1.5 rounded-control px-2.5 text-sm md:ml-0 md:min-h-10 md:gap-2 md:rounded-chip">
        <Plus aria-hidden="true" strokeWidth={2.5} className="size-4 md:size-[15px]" />작업 추가
      </button>
      {trailing}
    </div>
  );
}

function CreateForm({ userId, onCreateTask, onClose }: Omit<TaskCreateFormProps, 'trailing'> & { onClose: () => void }) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('daily');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingSubject, setCreatingSubject] = useState(false);
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
      else setError('작업을 추가하지 못했어요. 다시 시도해 주세요.');
    } catch {
      if (active.current) setError('작업을 추가하지 못했어요. 다시 시도해 주세요.');
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  };

  const suggestedName = isAutomatic && subjectId ? subjects.find(subject => subject.id === subjectId)?.name : undefined;
  const hint = creatingSubject
    ? '새 과목은 설정의 과목 관리에도 들어가요'
    : isAutomatic
      ? suggestedName ? `제목으로 보아 ${suggestedName} 과목에 넣을게요` : title.trim() ? '맞는 과목이 없으면 미분류로 저장돼요' : ''
      : '';

  return (
    <form aria-label="작업 추가" data-task-create-form="" onSubmit={submit}
      // Escape는 입력만 닫는다. 팝오버는 이 폼 안의 Escape를 무시하고(preventDefault),
      // 모바일 시트는 preventDefault된 Escape로 닫히지 않는다.
      onKeyDown={event => {
        if (event.key === 'Escape' && !saving && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); }
      }}
      className="ui-panel-enter flex flex-col gap-2 px-0.5 pt-1.5 pb-0.5">
      <fieldset disabled={saving} className="flex min-w-0 flex-col gap-2">
        <SubjectSelect subjects={subjects} value={subjectId} onChange={selectSubject}
          onCreate={createSubject} automatic={isAutomatic} onAutoSelect={resetSubject} disabled={saving}
          createAsOption automaticDisplay="option" onCreatingChange={setCreatingSubject}
          compact={false} label="과목" selectClassName="basis-full md:flex-none md:basis-[164px] [&_label]:sr-only"
          leading={(
            <div className="min-w-0 basis-full md:flex-1 md:basis-0">
              <label htmlFor={`${id}-title`} className="sr-only">새 작업 이름</label>
              <input id={`${id}-title`} autoFocus value={title} onChange={event => setTitle(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}
                placeholder="어떤 일을 계획하고 있나요?" required aria-describedby={error ? `${id}-error` : undefined}
                className="ui-input block w-full" />
            </div>
          )} />
        <div role="group" aria-label="기간" className="flex">
          <div className="ui-segmented [&>button]:h-8 [&>button]:px-3 [&>button]:text-[13px]">
            {PERIODS.map(period => (
              <button key={period.value} type="button" aria-pressed={kind === period.value}
                onClick={() => setKind(period.value)}>
                {period.label}
              </button>
            ))}
          </div>
        </div>
      </fieldset>
      {error && <p id={`${id}-error`} role="alert" className="m-0 text-[13px] text-pomo-deep">{error}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="submit" disabled={saving || !title.trim()} aria-busy={saving}
          className="ui-button-primary ui-press px-4">{saving ? '추가 중…' : '추가'}</button>
        <button type="button" onClick={onClose} disabled={saving}
          className="ui-button-ghost ui-press">취소</button>
        {hint && <span className="text-xs text-ink-subtle">{hint}</span>}
      </div>
    </form>
  );
}
