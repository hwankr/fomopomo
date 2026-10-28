import { useId, useRef } from 'react';
import { TaskItem } from '../hooks/useTasks';
import SubjectSelect from '@/components/subjects/SubjectSelect';
import ModalDialog from '@/components/ui/ModalDialog';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { cn } from '@/lib/utils';

interface TaskModalProps {
  isOpen: boolean;
  dbTasks: TaskItem[];
  selectedTask: string;
  selectedTaskId: string | null;
  selectedSubjectId?: string | null;
  userId?: string | null;
  onSelectSubject?: (subjectId: string | null) => void;
  isSaving?: boolean;
  labelsLocked?: boolean;
  onSelectTask: (taskTitle: string, taskId: string | null) => void;
  onSave: () => void;
  onSkip: () => void;
  onDisablePopup: () => void;
}

// 기록은 이미 보관돼 있으므로 Escape로 닫지 않는다. 저장하거나 건너뛰어야 끝난다.
const keepOpen = () => {};

// The input mirrors the parent's selectedTask directly: the saved value and
// the displayed value must be the same state, or a reopened modal can show a
// stale task name while the record is saved with an empty one.
export const TaskModal = ({
  isOpen,
  dbTasks,
  selectedTask,
  selectedTaskId,
  selectedSubjectId = null,
  userId,
  onSelectSubject,
  isSaving = false,
  labelsLocked = false,
  onSelectTask,
  onSave,
  onSkip,
  onDisablePopup,
}: TaskModalProps) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { subjects, loading, error, createSubject } = useStudySubjects(isOpen ? userId : null);
  const locked = labelsLocked || isSaving;

  return (
    <ModalDialog
      open={isOpen}
      onClose={keepOpen}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      initialFocusRef={inputRef}
      className="md:max-w-[420px]"
    >
      <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="ui-dialog-title">무엇에 집중하셨나요?</h2>
        <p id={`${id}-description`} className="m-0 text-sm text-ink-muted">
          목록에서 작업을 고르거나 직접 적어 주세요.
        </p>
      </div>

      {dbTasks.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-[13px] font-semibold text-ink-muted">오늘 할 일</p>
          <div className="-mx-2 flex max-h-44 flex-col gap-0.5 overflow-y-auto px-2 py-1">
            {dbTasks.map((task) => {
              const selected = selectedTaskId === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelectTask(task.title, task.id)}
                  disabled={locked}
                  aria-pressed={selected}
                  className={cn(
                    'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-control px-3 text-left text-[15px] [overflow-wrap:anywhere] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    selected ? 'bg-pomo-tint font-semibold text-pomo-deep' : 'hover:bg-hover',
                  )}
                >
                  {task.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-task`} className="text-[13px] font-semibold text-ink-muted">
          직접 입력
        </label>
        <input
          ref={inputRef}
          id={`${id}-task`}
          type="text"
          value={selectedTask}
          disabled={locked}
          onChange={(e) => onSelectTask(e.target.value, null)}
          placeholder="예: 독서, 코딩..."
          className="ui-input w-full"
        />
      </div>

      {onSelectSubject && (
        <div>
          <SubjectSelect
            subjects={subjects}
            value={selectedSubjectId}
            onChange={onSelectSubject}
            onCreate={createSubject}
            disabled={loading || locked}
            label="공부 과목"
          />
          {error && <p role="alert" className="mt-2 text-[13px] text-pomo-deep">{error}</p>}
        </div>
      )}

      {labelsLocked && !isSaving && (
        <p role="status" className="m-0 text-[13px] text-ink-muted">
          기록은 임시 보관 중이에요. 같은 내용으로 다시 저장해 주세요.
        </p>
      )}

      <div className="flex gap-2 md:justify-end">
        <button
          type="button"
          onClick={onSkip}
          disabled={locked}
          className="ui-button-secondary ui-press min-h-[50px] flex-1 rounded-tile px-5 md:min-h-12 md:flex-none"
        >
          건너뛰기
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || (!labelsLocked && !selectedTask.trim())}
          className="ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile px-6 md:min-h-12 md:flex-none"
        >
          {isSaving ? '저장 중...' : labelsLocked ? '다시 저장' : '저장'}
        </button>
      </div>

      <button
        type="button"
        onClick={onDisablePopup}
        disabled={isSaving}
        className="ui-button-ghost min-h-10 self-center px-3 text-[13px] font-medium text-ink-muted"
      >
        다시 보지 않기
      </button>
    </ModalDialog>
  );
};
