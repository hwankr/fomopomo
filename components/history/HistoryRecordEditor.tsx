'use client';

import { useId, type KeyboardEvent, type RefObject } from 'react';
import AppSelect from '@/components/ui/AppSelect';
import type { StudySubject } from '@/lib/studySubjects';
import { cn } from '@/lib/utils';

const UNCLASSIFIED = '__unclassified__';

type HistoryRecordEditorProps = {
  /** inline: 데스크톱 행 아래 펼침, sheet: 모바일 대화상자 안 */
  variant: 'inline' | 'sheet';
  id?: string;
  memo: string;
  onMemoChange: (memo: string) => void;
  subjectId: string | null;
  onSubjectChange: (subjectId: string | null) => void;
  subjects: StudySubject[];
  saving: boolean;
  /** 저장·삭제가 진행 중이라 다른 동작을 막아야 할 때 */
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  memoRef?: RefObject<HTMLInputElement | null>;
};

// 기록 하나의 작업 메모·과목 편집. 메모는 study_sessions.task만, 과목은 분류 RPC로 바꾼다(HistoryList 참고).
export default function HistoryRecordEditor({
  variant, id, memo, onMemoChange, subjectId, onSubjectChange, subjects,
  saving, busy, onSave, onCancel, onDelete, memoRef,
}: HistoryRecordEditorProps) {
  const fieldId = useId();
  const inline = variant === 'inline';
  const subjectOptions = [
    { value: UNCLASSIFIED, label: '미분류' },
    ...(subjectId && !subjects.some(subject => subject.id === subjectId) ? [{ value: subjectId, label: '지정된 과목' }] : []),
    ...subjects.map(subject => ({ value: subject.id, label: subject.name })),
  ];

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    // 모바일 대화상자에서는 ModalDialog가 키 입력을 가두고 Escape를 취소로 처리한다.
    if (!inline) return;
    // 편집 중 키 입력이 타이머 전역 단축키(Space)로 새지 않게 한다.
    event.stopPropagation();
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onCancel();
    }
  };

  const memoInput = (
    <input
      ref={memoRef}
      id={`${fieldId}-memo`}
      type="text"
      aria-label={inline ? '작업 메모' : undefined}
      maxLength={200}
      value={memo}
      onChange={event => onMemoChange(event.target.value)}
      disabled={saving}
      placeholder="예: 블록체인 9/12 복습"
      className={cn('ui-input w-full', inline ? 'flex-1' : 'min-h-[46px]')}
    />
  );
  const subjectSelect = (
    <AppSelect
      id={`${fieldId}-subject`}
      aria-label={inline ? '과목' : undefined}
      label={inline ? undefined : '과목'}
      value={subjectId ?? UNCLASSIFIED}
      onValueChange={next => onSubjectChange(next === UNCLASSIFIED ? null : next)}
      options={subjectOptions}
      disabled={saving}
      className={inline ? 'w-[140px] shrink-0' : undefined}
    />
  );

  return (
    <form
      id={id}
      onSubmit={event => { event.preventDefault(); onSave(); }}
      onKeyDown={handleKeyDown}
      // 펼친 인라인 편집은 행 아래에서 떠오른다. 모바일 대화상자는 ModalDialog가 움직인다.
      className={inline ? 'flex animate-fade-up flex-col gap-2 pb-3 pl-[98px] pt-1' : 'flex flex-col gap-3'}
    >
      {inline ? (
        <div className="flex gap-2">{memoInput}{subjectSelect}</div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${fieldId}-memo`} className="text-[13px] font-semibold text-ink-muted">작업 메모</label>
            {memoInput}
          </div>
          {subjectSelect}
        </>
      )}
      {inline ? (
        <div className="flex items-center gap-1.5">
          <button type="submit" disabled={busy} className="ui-button-primary ui-press">
            {saving ? '저장 중…' : '저장'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className="ui-button-ghost">취소</button>
          <button type="button" onClick={onDelete} disabled={busy} className="ui-button-ghost ml-auto text-pomo-deep">
            기록 삭제
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 pt-1.5">
            <button type="button" onClick={onCancel} disabled={saving} className="ui-button-secondary min-h-[50px] flex-1 rounded-tile">
              취소
            </button>
            <button type="submit" disabled={busy} className="ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile">
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
          <button type="button" onClick={onDelete} disabled={busy} className="ui-button-ghost min-h-10 self-center text-sm text-pomo-deep">
            이 기록 삭제
          </button>
        </>
      )}
    </form>
  );
}
