'use client';

import { useId, useRef, useState } from 'react';
import { validateSubjectName, type StudySubject } from '@/lib/studySubjects';

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
    <div className={compact ? 'min-w-0 text-xs' : 'space-y-2 text-sm'}>
      <label htmlFor={selectId} className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</label>
      <div className="flex min-w-0 items-center gap-2">
        <select
          id={selectId}
          value={value ?? ''}
          onChange={event => onChange(event.target.value || null)}
          disabled={disabled || saving}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">미분류</option>
          {value && !subjects.some(subject => subject.id === value) ? <option value={value}>지정된 과목</option> : null}
          {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        {onCreate ? (
          <button type="button" disabled={disabled || saving} aria-expanded={creating}
            onClick={() => { setCreating(!creating); setError(null); }}
            className="shrink-0 rounded-lg px-2 py-2 font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 dark:text-indigo-300 dark:hover:bg-slate-700">
            {creating ? '닫기' : '+ 새 과목'}
          </button>
        ) : null}
      </div>
      {creating ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            aria-label="새 과목 이름" placeholder="예: 블록체인" value={draft} maxLength={80}
            disabled={saving || disabled} onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void create(); } }}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button type="button" disabled={saving || disabled || !draft.trim()} onClick={() => { void create(); }}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white disabled:opacity-50">
            {saving ? '추가 중…' : '추가'}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
