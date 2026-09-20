'use client';

import { useId, useRef, useState } from 'react';
import { validateSubjectName, type StudySubject } from '@/lib/studySubjects';
import AppSelect from '@/components/ui/AppSelect';

type SubjectSelectProps = {
  subjects: StudySubject[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate?: (name: string) => Promise<StudySubject | null>;
  disabled?: boolean;
  label?: string;
  id?: string;
  compact?: boolean;
};

export default function SubjectSelect({
  subjects, value, onChange, onCreate, disabled = false, label = '과목', id, compact = false,
}: SubjectSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const unclassifiedValue = '__unclassified__';
  const options = [
    { value: unclassifiedValue, label: '미분류' },
    ...(value && !subjects.some(subject => subject.id === value) ? [{ value, label: '지정된 과목' }] : []),
    ...subjects.map(subject => ({ value: subject.id, label: subject.name })),
  ];

  const create = async () => {
    if (!onCreate || disabled || pending.current) return;
    const validationError = validateSubjectName(draft);
    if (validationError) { setError(validationError); return; }
    const existing = subjects.find(subject => subject.name.trim().toLocaleLowerCase() === draft.trim().toLocaleLowerCase());
    if (existing) {
      onChange(existing.id);
      setCreating(false);
      setDraft('');
      setError(null);
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const subject = await onCreate(draft.trim());
      if (!subject) { setError('과목을 추가하지 못했습니다. 이름을 확인하고 다시 시도해주세요.'); return; }
      onChange(subject.id);
      setDraft('');
      setCreating(false);
    } catch {
      setError('과목을 추가하지 못했습니다. 다시 시도해주세요.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <div className={compact ? 'min-w-0 text-xs' : 'min-w-0 space-y-2 text-sm'}>
      <div className="flex min-w-0 items-end gap-2">
        <AppSelect
          id={selectId}
          label={label}
          value={value ?? unclassifiedValue}
          onValueChange={next => onChange(next === unclassifiedValue ? null : next)}
          options={options}
          disabled={disabled || saving}
          compact={compact}
          className="min-w-0 flex-1"
        />
        {onCreate ? (
          <button type="button" disabled={disabled || saving} aria-expanded={creating} aria-controls={`${selectId}-create`}
            onClick={() => { setCreating(!creating); setError(null); }}
            className={`ui-press h-10 shrink-0 rounded-xl border border-transparent font-medium text-rose-600 transition-colors hover:border-rose-100 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:border-rose-900/40 dark:hover:bg-rose-950/40 ${compact ? 'px-2 text-xs' : 'px-3 text-sm'}`}>
            {creating ? '닫기' : '+ 새 과목'}
          </button>
        ) : null}
      </div>
      {creating ? (
        <div id={`${selectId}-create`} className="ui-panel-enter mt-2 flex items-center gap-2 rounded-xl bg-rose-50/60 p-2 dark:bg-rose-950/20">
          <input
            aria-label="새 과목 이름" placeholder="예: 블록체인" value={draft} maxLength={80}
            disabled={saving || disabled} onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void create(); } }}
            className="ui-input min-w-0 flex-1 px-3 py-2 text-sm"
          />
          <button type="button" disabled={saving || disabled || !draft.trim()} onClick={() => { void create(); }}
            className="ui-button-primary ui-press shrink-0 px-3 py-2 text-sm font-medium">
            {saving ? '추가 중…' : '추가'}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
