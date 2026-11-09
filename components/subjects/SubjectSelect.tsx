'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { isArchivedSubject, subjectNameKey, validateSubjectName, type StudySubject } from '@/lib/studySubjects';
import AppSelect from '@/components/ui/AppSelect';
import { cn } from '@/lib/utils';

/** 보관한 과목의 선택지 글자. 이미 지정된 값이나 지난 기록 정리에서만 보인다. */
export const archivedSubjectLabel = (subject: Pick<StudySubject, 'name'>) => `${subject.name} (보관)`;

type SubjectSelectProps = {
  /** 보관한 과목도 함께 받는다. 선택지에는 사용 중 과목만 두고, 보관 여부는 isArchivedSubject로 가른다. */
  subjects: StudySubject[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate?: (name: string) => Promise<StudySubject | null>;
  disabled?: boolean;
  label?: string;
  id?: string;
  compact?: boolean;
  automatic?: boolean;
  onAutoSelect?: () => void;
  /** '+ 새 과목'을 별도 버튼 대신 목록의 마지막 항목으로 둔다(타이머 작업 추가 보드). */
  createAsOption?: boolean;
  /** 자동 선택 중일 때 칸에 보일 글자: 추론한 과목 이름(기본) 또는 '제목에 맞춰 선택' */
  automaticDisplay?: 'subject' | 'option';
  /** 선택 칸 앞에 같은 줄로 둘 요소(예: 작업 제목 입력). 새 과목 입력 줄은 그 아래 전체 폭으로 열린다. */
  leading?: ReactNode;
  /** 선택 칸 너비 조정 */
  selectClassName?: string;
  onCreatingChange?: (creating: boolean) => void;
  /** 보관한 과목도 고를 수 있게 사용 중 과목 뒤에 둔다(지난 기록을 정리하는 곳만). */
  includeArchived?: boolean;
};

export default function SubjectSelect({
  subjects, value, onChange, onCreate, disabled = false, label = '과목', id, compact = false,
  automatic = false, onAutoSelect, createAsOption = false, automaticDisplay = 'subject', leading,
  selectClassName, onCreatingChange, includeArchived = false,
}: SubjectSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const [creating, setCreatingState] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 방금 만든 과목. 목록(subjects)이 다시 불러와지기 전에도 이름으로 선택돼 보이게 둔다.
  const [createdSubjects, setCreatedSubjects] = useState<StudySubject[]>([]);
  // 목록에 한 번 나타난 과목은 캐시에서 뺀다. 남겨 두면 그 과목을 지웠을 때 목록에서는 빠져도 캐시에서 다시 합쳐져
  // 선택지에 남고, 같은 이름으로 다시 만들 때 지운 과목을 "이미 있음"으로 찾아 지운 ID를 고른다.
  // (렌더 중 갱신: 다음 렌더에서는 겹치는 과목이 없어 한 번에 멈춘다.)
  if (createdSubjects.some(created => subjects.some(subject => subject.id === created.id))) {
    setCreatedSubjects(current => current.filter(created => !subjects.some(subject => subject.id === created.id)));
  }
  const pending = useRef(false);
  const unclassifiedValue = '__unclassified__';
  const automaticValue = '__automatic__';
  const createValue = '__create__';
  const offerCreateOption = createAsOption && Boolean(onCreate);
  const knownSubjects = [
    ...subjects,
    ...createdSubjects.filter(created => !subjects.some(subject => subject.id === created.id)),
  ];
  // 보관한 과목은 새로 고르지 않는다. 이미 그 과목이 지정된 값이면 미분류·'지정된 과목'으로 바꾸지 않고
  // 이름과 함께 보인다(보관해도 할 일·기록의 과목은 그대로다).
  const activeSubjects = knownSubjects.filter(subject => !isArchivedSubject(subject));
  const archivedSubjects = includeArchived ? knownSubjects.filter(subject => isArchivedSubject(subject)) : [];
  const currentSubject = value ? knownSubjects.find(subject => subject.id === value) : undefined;
  // includeArchived면 보관한 과목이 모두 뒤에 있으므로 따로 두지 않는다(고른 뒤에도 순서가 그대로다).
  const currentArchived = currentSubject && isArchivedSubject(currentSubject) && !includeArchived ? currentSubject : null;
  const automaticLabel = automaticDisplay === 'option'
    ? '제목에 맞춰 선택'
    : value ? currentSubject?.name ?? '지정된 과목' : '미분류';
  const options = [
    ...(onAutoSelect ? [{ value: automaticValue, label: '제목에 맞춰 선택' }] : []),
    { value: unclassifiedValue, label: '미분류' },
    ...(value && !currentSubject ? [{ value, label: '지정된 과목' }] : []),
    ...(currentArchived ? [{ value: currentArchived.id, label: archivedSubjectLabel(currentArchived) }] : []),
    ...activeSubjects.map(subject => ({ value: subject.id, label: subject.name })),
    ...archivedSubjects.map(subject => ({ value: subject.id, label: archivedSubjectLabel(subject) })),
    ...(offerCreateOption ? [{ value: createValue, label: '+ 새 과목' }] : []),
  ];

  const setCreating = (next: boolean) => {
    setCreatingState(next);
    onCreatingChange?.(next);
  };

  const create = async () => {
    if (!onCreate || disabled || pending.current) return;
    const validationError = validateSubjectName(draft);
    if (validationError) { setError(validationError); return; }
    // 사용 중 과목과 같은 이름이면 그 과목을 고른다. 보관한 과목과 같은 이름이면 ID만 고르지 않고
    // onCreate로 보낸다. 과목 목록 훅이 그 과목을 다시 사용으로 바꿔 돌려주므로 기록이 이어진다.
    const existing = activeSubjects.find(subject => subjectNameKey(subject.name) === subjectNameKey(draft));
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
      setCreatedSubjects(current => [...current.filter(item => item.id !== subject.id), subject]);
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
      {/* 앞 요소가 있으면 위쪽을 맞춘다(폼 안의 Radix 선택은 숨은 select를 덧붙여 아래 여백이 생긴다). */}
      <div className={cn('flex min-w-0 gap-2', leading ? 'flex-wrap items-start' : 'items-end')}>
        {leading}
        <AppSelect
          id={selectId}
          label={compact ? undefined : label}
          aria-label={compact ? label : undefined}
          value={onAutoSelect && automatic ? automaticValue : value ?? unclassifiedValue}
          displayValue={onAutoSelect && automatic ? automaticLabel : undefined}
          onValueChange={next => {
            // 폼 안의 Radix 선택은 숨은 native select를 두는데, 값이 아직 등록되지 않은 항목으로
            // 바뀌는 순간 그 select가 ""를 보낸다. 목록에 없는 값은 선택으로 받지 않는다.
            if (!options.some(option => option.value === next)) return;
            if (next === createValue) { setCreating(true); setError(null); }
            else if (next === automaticValue && onAutoSelect) onAutoSelect();
            else onChange(next === unclassifiedValue ? null : next);
          }}
          options={options}
          disabled={disabled || saving}
          compact={compact}
          className={cn('min-w-0 flex-1', selectClassName)}
        />
        {onCreate && !offerCreateOption ? (
          <button type="button" disabled={disabled || saving} aria-expanded={creating} aria-controls={`${selectId}-create`}
            onClick={() => { setCreating(!creating); setError(null); }}
            className={`ui-button-ghost ui-press shrink-0 text-pomo ${compact ? 'min-h-9 rounded-chip px-2.5 text-[13px]' : 'min-h-11 px-3 text-sm'}`}>
            {creating ? '닫기' : '+ 새 과목'}
          </button>
        ) : null}
      </div>
      {creating ? (
        <div id={`${selectId}-create`} className="ui-panel-enter mt-2 flex items-center gap-2">
          <input
            aria-label="새 과목 이름" placeholder="예: 블록체인" value={draft} maxLength={80}
            disabled={saving || disabled} onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void create(); }
              else if (offerCreateOption && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setCreating(false); setDraft(''); setError(null); }
            }}
            className="ui-input min-w-0 flex-1"
          />
          <button type="button" disabled={saving || disabled || !draft.trim()} onClick={() => { void create(); }}
            className="ui-button-primary ui-press shrink-0">
            {saving ? '추가 중…' : '추가'}
          </button>
          {offerCreateOption ? (
            <button type="button" disabled={saving} onClick={() => { setCreating(false); setDraft(''); setError(null); }}
              className="ui-button-ghost ui-press shrink-0 px-3">
              닫기
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-1 text-[13px] text-pomo-deep">{error}</p> : null}
    </div>
  );
}
