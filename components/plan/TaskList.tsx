'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { format, parse } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Check,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ConfirmModal from '@/components/ConfirmModal';
import SubjectSelect from '@/components/subjects/SubjectSelect';
import Beads, { type BeadState } from '@/components/ui/Beads';
import ModalDialog from '@/components/ui/ModalDialog';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { useSuggestedSubject } from '@/hooks/useSuggestedSubject';
import {
  clampPomodoroGoal,
  countPomodorosByTask,
  getTaskPomodoroGoal,
  POMODORO_GOAL_MAX,
  POMODORO_GOAL_MIN,
  type PomodoroSessionRow,
} from '@/lib/pomodoroCounts';
import { notifyStudySubjectsChanged, type StudySubject } from '@/lib/studySubjects';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatDayLabel, formatStudyTime, useIsDesktop } from './planUi';

interface Task {
  id: string;
  title: string;
  subject_id: string | null;
  status: 'todo' | 'in_progress' | 'done';
  estimated_pomodoros: number;
  duration?: number;
  /** 이 작업으로 끝낸 뽀모도로 수(lib/pomodoroCounts 규칙) */
  pomodoros?: number;
  position: number;
  source_subtask_id: string | null;
  source_long_term_task_id?: string | null;
  source_pinned_task_id: string | null;
  parentTitle?: string;
}

interface PinnedTask {
  id: string;
  title: string;
  subject_id: string | null;
  position: number;
}

type TaskRow = {
  id: string;
  title: string;
  subject_id: string | null;
  status: Task['status'];
  estimated_pomodoros: number | null;
  position: number | null;
  source_subtask_id: string | null;
  source_long_term_task_id?: string | null;
  source_pinned_task_id: string | null;
};

type SubtaskParentRow = {
  id: string;
  long_term_tasks: LongTermParentTitle | LongTermParentTitle[] | null;
};

type LongTermParentTitle = { title: string; parent_task_id?: string | null };

type PinnedTaskRow = {
  id: string;
  title: string;
  subject_id: string | null;
  position: number | null;
};

type SessionDurationRow = PomodoroSessionRow & {
  duration: number | null;
};

// 새 계획의 뽀모도로 목표 기본값(디자인 보드의 추가 양식과 같다)
const DEFAULT_POMODORO_GOAL = 2;
// 작업 행에 그리는 구슬 상한(목표를 넘겨 끝낸 경우)
const MAX_ROW_BEADS = 12;

function buildTaskBeads(done: number, goal: number, finished: boolean): BeadState[] {
  const shownDone = Math.min(done, Math.max(goal, MAX_ROW_BEADS));
  const remaining = Math.max(0, goal - shownDone);
  return [
    ...Array<BeadState>(shownDone).fill('done'),
    // 끝낸 작업에 남은 칸은 더 계획한 것이 아니므로 빈 구슬로 둔다.
    ...Array<BeadState>(remaining).fill(finished ? 'empty' : 'planned'),
  ];
}

const normalizeTaskRows = (rows: TaskRow[] | null | undefined): Task[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    estimated_pomodoros: row.estimated_pomodoros ?? 0,
    position: row.position ?? 0,
    source_subtask_id: row.source_subtask_id ?? null,
    source_long_term_task_id: row.source_long_term_task_id ?? null,
    source_pinned_task_id: row.source_pinned_task_id ?? null,
    subject_id: row.subject_id ?? null,
  }));

const normalizePinnedTaskRows = (
  rows: PinnedTaskRow[] | null | undefined
): PinnedTask[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    position: row.position ?? 0,
    subject_id: row.subject_id ?? null,
  }));

interface SortableTaskItemProps {
  task: Task;
  toggleTaskStatus: (task: Task) => void;
  deleteTask: (id: string) => void;
  updateTask: (id: string, title: string, subjectId: string | null) => void;
  pinTask: (task: Task) => void;
  isPinned: boolean;
  subjects: StudySubject[];
  createSubject: (name: string) => Promise<StudySubject | null>;
  isDesktop: boolean;
}

function SortableTaskItem({
  task,
  toggleTaskStatus,
  deleteTask,
  updateTask,
  pinTask,
  isPinned,
  subjects,
  createSubject,
  isDesktop,
}: SortableTaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [editedSubjectId, setEditedSubjectId] = useState(task.subject_id);
  const [showActions, setShowActions] = useState(false);
  const actionsId = useId();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSave = () => {
    if (editedTitle.trim() && (editedTitle.trim() !== task.title || editedSubjectId !== task.subject_id)) {
      updateTask(task.id, editedTitle.trim(), editedSubjectId);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedTitle(task.title);
    setEditedSubjectId(task.subject_id);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSave();
    } else if (event.key === 'Escape') {
      handleCancel();
    }
  };

  const isDone = task.status === 'done';
  const done = task.pomodoros ?? 0;
  const goal = getTaskPomodoroGoal(task.estimated_pomodoros);
  const subjectName = subjects.find((subject) => subject.id === task.subject_id)?.name ?? '미분류';
  // 데스크톱은 행에 마우스를 올리거나 포커스가 들어올 때만 보인다(포커스가 들어오면 Tab으로 닿는다).
  const revealOnHover = 'hidden group-hover:inline-flex group-focus-within:inline-flex';

  const actions = (
    <>
      <button
        type="button"
        onClick={() => pinTask(task)}
        title={isPinned ? '작업 고정 해제' : '작업 고정'}
        aria-label={isPinned ? `${task.title} 고정 해제` : `${task.title} 고정`}
        className={cn(
          isDesktop ? 'ui-icon-button size-8' : 'ui-button-ghost min-h-11 gap-1.5 rounded-control px-3 text-[13px]',
          isPinned ? 'text-pomo' : cn('text-ink-muted', isDesktop && revealOnHover)
        )}
      >
        <Pin aria-hidden="true" className={cn('size-4', isPinned && 'fill-current')} strokeWidth={1.8} />
        {isDesktop ? null : isPinned ? '고정 해제' : '고정'}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditedTitle(task.title);
          setEditedSubjectId(task.subject_id);
          setShowActions(false);
          setIsEditing(true);
        }}
        aria-label={`${task.title} 수정`}
        className={cn(
          'text-ink-muted',
          isDesktop ? cn('ui-icon-button size-8', revealOnHover) : 'ui-button-ghost min-h-11 gap-1.5 rounded-control px-3 text-[13px]'
        )}
      >
        <Pencil aria-hidden="true" className="size-4" strokeWidth={1.8} />
        {isDesktop ? null : '수정'}
      </button>
      <button
        type="button"
        onClick={() => deleteTask(task.id)}
        aria-label={`${task.title} 삭제`}
        className={cn(
          isDesktop
            ? cn('ui-icon-button size-8 text-ink-muted hover:text-pomo-deep', revealOnHover)
            : 'ui-button-ghost min-h-11 gap-1.5 rounded-control px-3 text-[13px] text-pomo-deep'
        )}
      >
        <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
        {isDesktop ? null : '삭제'}
      </button>
    </>
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative -mx-3 flex min-h-[68px] flex-wrap items-center gap-x-2 gap-y-1 rounded-tile px-3 py-2 transition-colors md:min-h-14 md:gap-x-2.5',
        isEditing ? 'bg-surface' : 'hover:bg-hover',
        isDragging && 'bg-white shadow-popover'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={`${task.title} 순서 바꾸기`}
        className={cn(
          // 모바일은 손가락으로 잡기 쉽게 44px 칸(아이콘은 그대로), 행 왼쪽 여백까지 쓴다.
          '-ml-3 flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-chip text-ink-faint hover:text-ink-muted active:cursor-grabbing md:ml-0 md:h-9 md:w-4',
          // 데스크톱은 행 왼쪽 바깥 여백에 띄워 체크 원이 제목 줄과 같은 선에서 시작하게 한다.
          'md:absolute md:top-1/2 md:-left-4 md:-translate-y-1/2 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'
        )}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </div>

      <button
        type="button"
        onClick={() => toggleTaskStatus(task)}
        aria-pressed={isDone}
        aria-label={`${task.title} 완료`}
        className={cn('-mx-2 flex size-11 shrink-0 items-center justify-center rounded-full md:-mx-1.5 md:size-9', isDone && 'ui-focus-ink')}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-[22px] items-center justify-center rounded-full border-[1.5px] transition-colors',
            isDone ? 'border-pomo bg-pomo text-white' : 'border-control text-transparent'
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      </button>

      {isEditing ? (
        <div className="flex min-w-0 flex-1 basis-[min(100%,16rem)] flex-wrap items-center gap-2 [&_[role=combobox]]:bg-white">
          <input
            type="text"
            aria-label="작업 제목"
            value={editedTitle}
            onChange={(event) => setEditedTitle(event.target.value)}
            onKeyDown={handleKeyDown}
            className="ui-input min-h-11 min-w-0 flex-[1_1_12rem] bg-white md:min-h-10"
            autoFocus
          />
          <div className="min-w-0 flex-[1_1_10rem]">
            <SubjectSelect
              subjects={subjects}
              value={editedSubjectId}
              onChange={setEditedSubjectId}
              onCreate={createSubject}
              compact
            />
          </div>
          <div className="ml-auto flex shrink-0 items-center">
            <button
              type="button"
              onClick={handleSave}
              aria-label="작업 저장"
              className="ui-icon-button size-11 text-pomo md:size-9"
            >
              <Check aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              aria-label="작업 수정 취소"
              className="ui-icon-button size-11 text-ink-muted md:size-9"
            >
              <X aria-hidden="true" className="size-[18px]" strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
            <span
              title={task.title}
              className={cn(
                'text-[15px] font-semibold break-words max-md:line-clamp-2 md:truncate',
                isDone ? 'text-ink-muted line-through' : 'text-ink'
              )}
            >
              {task.title}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Beads label={`뽀모도로 ${done} / ${goal}`} states={buildTaskBeads(done, goal, isDone)} />
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-subtle">
                <span className="shrink-0">{subjectName}</span>
                {task.parentTitle ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="min-w-0 truncate">{task.parentTitle}</span>
                  </>
                ) : null}
                {task.duration ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0 whitespace-nowrap">{formatStudyTime(task.duration)}</span>
                  </>
                ) : null}
              </span>
            </span>
          </div>

          {isDesktop ? (
            // 평소에는 (고정 표시 +) 개수, 마우스를 올리면 개수 자리에 동작 버튼이 나온다.
            <div className="flex min-w-[104px] shrink-0 items-center justify-end">
              {actions}
              <span aria-hidden="true" className="w-10 text-right text-[13px] text-ink-muted group-focus-within:hidden group-hover:hidden">
                {done} / {goal}
              </span>
            </div>
          ) : (
            <>
              {isPinned ? (
                // 고정·해제 버튼은 더보기 안에 두고, 고정 상태는 항상 보인다.
                <span role="img" aria-label="고정된 작업" className="flex shrink-0 text-pomo">
                  <Pin aria-hidden="true" className="size-3.5 fill-current" strokeWidth={1.8} />
                </span>
              ) : null}
              <span aria-hidden="true" className="shrink-0 text-[13px] text-ink-muted">
                {done} / {goal}
              </span>
              <button
                type="button"
                onClick={() => setShowActions((current) => !current)}
                aria-expanded={showActions}
                aria-controls={actionsId}
                aria-label={`${task.title} 더보기`}
                className="ui-icon-button -mr-3 size-11 shrink-0 text-ink-muted"
              >
                <MoreHorizontal aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
              </button>
              <div id={actionsId} hidden={!showActions} className="basis-full pl-16">
                <div className="flex flex-wrap gap-1">{actions}</div>
              </div>
            </>
          )}
        </>
      )}
    </li>
  );
}

interface TaskListProps {
  selectedDate: Date;
  userId: string;
  /** 선택한 날 끝낸 뽀모도로 수(계획이 없을 때 요약에 쓴다). 모르면 생략한다. */
  dayPomodoros?: number;
}

export default function TaskList({ selectedDate, userId, dayPomodoros }: TaskListProps) {
  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');

  // A new owner/date gets fresh UI state, including drafts and confirmations.
  // Returning to an earlier key still creates a new request lifetime.
  return (
    <ScopedTaskList
      key={`${userId}:${selectedDateKey}`}
      selectedDateKey={selectedDateKey}
      userId={userId}
      dayPomodoros={dayPomodoros}
    />
  );
}

const createRequestScope = () => ({
  active: true,
  taskRequest: 0,
  taskReadPending: false,
  mutations: 0,
  refreshTasks: false,
  pinMutations: new Set<string>(),
});

function ScopedTaskList({ selectedDateKey, userId, dayPomodoros }: {
  selectedDateKey: string;
  userId: string;
  dayPomodoros?: number;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newGoal, setNewGoal] = useState(DEFAULT_POMODORO_GOAL);
  const { subjects, createSubject } = useStudySubjects(userId);
  const { subjectId: newSubjectId, isAutomatic, selectSubject, resetSubject } = useSuggestedSubject(newTaskTitle, subjects);
  const [isAdding, setIsAdding] = useState(false);
  const isDesktop = useIsDesktop();
  const formTitleId = useId();
  const sheetTitleId = useId();
  const goalLabelId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const scopeRef = useRef<ReturnType<typeof createRequestScope> | null>(null);

  useLayoutEffect(() => {
    const scope = createRequestScope();
    scopeRef.current = scope;
    // Use a new object on every setup: StrictMode cleanup must permanently
    // invalidate the work started by its previous setup.
    return () => { scope.active = false; };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchTasks = useCallback(async () => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    if (scope.mutations > 0) {
      scope.refreshTasks = true;
      return;
    }
    const request = ++scope.taskRequest;
    const isCurrent = () => scope.active && request === scope.taskRequest;
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    scope.taskReadPending = true;
    setLoading(true);

    const { data: pinnedData, error: pinnedError } = await supabase
      .from('pinned_tasks')
      .select('id, title, position, subject_id')
      .eq('user_id', userId)
      .order('position', { ascending: true });

    if (!isCurrent()) return;
    if (pinnedError) {
      console.error('Error fetching pinned tasks for task list:', pinnedError);
    }

    const pinnedRows = normalizePinnedTaskRows(pinnedData as PinnedTaskRow[]);

    const { data: taskData, error: taskError } = await supabase
      .from('tasks')
      .select(
        'id, title, status, estimated_pomodoros, position, source_subtask_id, source_long_term_task_id, source_pinned_task_id, subject_id'
      )
      .eq('user_id', userId)
      .eq('due_date', selectedDateKey)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (!isCurrent()) return;
    if (taskError) {
      console.error('Error fetching tasks:', taskError);
      scope.taskReadPending = false;
      setLoading(false);
      return;
    }

    let taskRows = normalizeTaskRows(taskData as TaskRow[]);
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const existingPinIds = new Set(taskRows.map((task) => task.source_pinned_task_id));
    const missingPins = pinnedRows.filter((pin) => !existingPinIds.has(pin.id));

    if (selectedDateKey >= todayKey && missingPins.length > 0) {
      // The database owns source/date uniqueness. Two tabs can both observe a
      // missing occurrence, but the RPC returns the same winning daily task.
      const { data: materialized, error: insertError } = await supabase.rpc(
        'materialize_pinned_tasks',
        { p_user_id: userId, p_due_date: selectedDateKey }
      );
      if (!isCurrent()) return;
      if (insertError) {
        console.error('Error auto-creating pinned tasks:', insertError);
      } else {
        const canonical = normalizeTaskRows(materialized as TaskRow[]);
        const merged = new Map(taskRows.map((task) => [task.id, task]));
        for (const task of canonical) merged.set(task.id, task);
        taskRows = [...merged.values()].sort((a, b) => a.position - b.position);
        if (missingPins.some((pin) => pin.subject_id)) notifyStudySubjectsChanged();
      }
    }

    const sourceSubtaskIds = [
      ...new Set(
        taskRows.flatMap((task) =>
          task.source_subtask_id ? [task.source_subtask_id] : []
        )
      ),
    ];

    const projectIdByTaskId = new Map<string, string>();
    if (sourceSubtaskIds.length > 0) {
      const { data: parentData, error: parentError } = await supabase
        .from('long_term_subtasks')
        .select('id, long_term_tasks(title, parent_task_id)')
        .in('id', sourceSubtaskIds);

      if (!isCurrent()) return;
      if (parentError) {
        console.error('Error fetching long-term task titles:', parentError);
      } else {
        const parentTitleBySubtaskId = new Map<string, string>();
        const projectIdBySubtaskId = new Map<string, string>();
        for (const row of (parentData ?? []) as SubtaskParentRow[]) {
          const relation = Array.isArray(row.long_term_tasks)
            ? row.long_term_tasks[0]
            : row.long_term_tasks;
          if (relation?.title) {
            parentTitleBySubtaskId.set(row.id, relation.title);
          }
          if (relation?.parent_task_id) {
            projectIdBySubtaskId.set(row.id, relation.parent_task_id);
          }
        }

        taskRows = taskRows.map((task) => {
          const projectId = task.source_subtask_id && projectIdBySubtaskId.get(task.source_subtask_id);
          if (projectId) projectIdByTaskId.set(task.id, projectId);
          return {
            ...task,
            parentTitle: task.source_subtask_id
              ? parentTitleBySubtaskId.get(task.source_subtask_id)
              : undefined,
          };
        });
      }
    }

    const sourceLongTermTaskIds = [...new Set(taskRows.flatMap((task) =>
      task.source_long_term_task_id ? [task.source_long_term_task_id] : []
    ))];

    if (sourceLongTermTaskIds.length > 0) {
      const { data: parentData, error: parentError } = await supabase
        .from('long_term_tasks')
        .select('id, title, parent_task_id')
        .eq('user_id', userId)
        .in('id', sourceLongTermTaskIds);

      if (!isCurrent()) return;
      if (parentError) {
        console.error('Error fetching long-term task titles:', parentError);
      } else {
        const parents = new Map(
          ((parentData ?? []) as Array<LongTermParentTitle & { id: string }>).map((parent) => [parent.id, parent])
        );
        taskRows = taskRows.map((task) => {
          const parent = task.source_long_term_task_id && parents.get(task.source_long_term_task_id);
          if (parent && parent.parent_task_id) projectIdByTaskId.set(task.id, parent.parent_task_id);
          return { ...task, parentTitle: parent ? parent.title : task.parentTitle };
        });
      }
    }

    if (projectIdByTaskId.size > 0) {
      const { data: projects, error: projectError } = await supabase
        .from('long_term_tasks')
        .select('id, title')
        .eq('user_id', userId)
        .in('id', [...new Set(projectIdByTaskId.values())]);
      if (!isCurrent()) return;
      if (projectError) {
        console.error('Error fetching long-term project titles:', projectError);
      } else {
        const projectTitles = new Map(
          ((projects ?? []) as Array<{ id: string; title: string }>).map((project) => [project.id, project.title])
        );
        taskRows = taskRows.map((task) => {
          const projectId = projectIdByTaskId.get(task.id);
          const projectTitle = projectId ? projectTitles.get(projectId) : undefined;
          return {
            ...task,
            parentTitle: projectTitle && task.parentTitle
              ? `${projectTitle} › ${task.parentTitle}`
              : task.parentTitle,
          };
        });
      }
    }

    const taskIds = taskRows.map((task) => task.id);
    const durationByTaskId = new Map<string, number>();
    const pomodorosByTaskId = new Map<string, number>();

    if (taskIds.length > 0) {
      // RLS로 보이는 타인 세션(그룹/친구 조회 허용분)이 합산되지 않도록
      // 본인 세션으로 한정한다.
      const { data: sessions, error: sessionsError } = await supabase
        .from('study_sessions')
        .select('id, created_at, mode, task_id, session_batch_id, group_id, duration')
        .eq('user_id', userId)
        .in('task_id', taskIds);

      if (!isCurrent()) return;
      if (sessionsError) {
        console.error('Error fetching task study durations:', sessionsError);
      } else {
        const sessionRows = (sessions as SessionDurationRow[] | null | undefined) ?? [];
        sessionRows.forEach((row) => {
          if (!row.task_id) return;
          durationByTaskId.set(
            row.task_id,
            (durationByTaskId.get(row.task_id) ?? 0) + (row.duration ?? 0)
          );
        });
        countPomodorosByTask(sessionRows).forEach((count, taskId) => pomodorosByTaskId.set(taskId, count));
      }
    }

    scope.taskReadPending = false;
    setTasks(
      taskRows.map((task) => ({
        ...task,
        duration: durationByTaskId.get(task.id) ?? 0,
        pomodoros: pomodorosByTaskId.get(task.id) ?? 0,
      }))
    );
    setLoading(false);
  }, [selectedDateKey, userId]);

  const beginMutation = () => {
    const scope = scopeRef.current;
    if (!scope?.active) return null;
    // Reads already in flight cannot overwrite local changes. Realtime
    // refreshes during writes are deferred until all current writes settle.
    scope.taskRequest += 1;
    scope.refreshTasks ||= scope.taskReadPending;
    scope.taskReadPending = false;
    scope.mutations += 1;
    setLoading(false);
    return scope;
  };

  const finishMutation = (scope: ReturnType<typeof createRequestScope>) => {
    if (!scope.active) return;
    scope.mutations -= 1;
    if (scope.mutations > 0) return;
    if (scope.refreshTasks) {
      scope.refreshTasks = false;
      void fetchTasks();
    }
  };

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    const initialFetch = setTimeout(() => {
      if (!scope.active) return;
      void fetchTasks();
    }, 0);

    if (!userId) return () => clearTimeout(initialFetch);

    const taskChannel = supabase
      .channel('task-list-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (!scope.active) return;
          void fetchTasks();
        }
      )
      .subscribe();

    const sessionChannel = supabase
      .channel('task-list-session-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_sessions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (!scope.active) return;
          void fetchTasks();
        }
      )
      .subscribe();

    const pinnedChannel = supabase
      .channel('task-list-pinned-updates')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pinned_tasks', filter: `user_id=eq.${userId}`,
      }, () => {
        if (!scope.active) return;
        void fetchTasks();
      })
      .subscribe();

    return () => {
      clearTimeout(initialFetch);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(pinnedChannel);
    };
  }, [fetchTasks, userId]);

  const pinTaskFromTask = async (task: Task) => {
    if (!userId || scopeRef.current?.pinMutations.has(task.id)) return;
    const scope = beginMutation();
    if (!scope) return;
    scope.pinMutations.add(task.id);

    try {
      if (task.source_pinned_task_id) {
        const pinId = task.source_pinned_task_id;
        const { error } = await supabase.from('pinned_tasks').delete()
          .eq('id', pinId).eq('user_id', userId);
        if (!scope.active) return;
        if (error) throw error;
        // The FK performs the same unlink for every date without deleting work.
        setTasks((current) => current.map((row) => row.source_pinned_task_id === pinId
          ? { ...row, source_pinned_task_id: null } : row));
      } else {
        const { data, error } = await supabase.rpc('pin_daily_task', { p_task_id: task.id }).single();
        if (!scope.active) return;
        if (error || !data) throw error ?? new Error('No pinned task returned');
        const pin = normalizePinnedTaskRows([data as PinnedTaskRow])[0];
        setTasks((current) => current.map((row) => row.id === task.id
          ? { ...row, source_pinned_task_id: pin.id } : row));
      }
    } catch (error) {
      if (scope.active) {
        console.error('Error changing pinned task:', error);
        toast.error('작업 고정을 변경하지 못했습니다. 다시 시도해주세요.');
        scope.refreshTasks = true;
      }
    } finally {
      scope.pinMutations.delete(task.id);
      finishMutation(scope);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((task) => task.id === active.id);
    const newIndex = tasks.findIndex((task) => task.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;
    const scope = beginMutation();
    if (!scope) return;

    const reorderedTasks = arrayMove(tasks, oldIndex, newIndex).map(
      (task, index) => ({
        ...task,
        position: index,
      })
    );

    setTasks(reorderedTasks);

    try {
      const results = await Promise.all(
        reorderedTasks.map((task) =>
          supabase.from('tasks').update({ position: task.position }).eq('id', task.id)
        )
      );
      if (!scope.active) return;
      const error = results.find((result) => result.error)?.error;
      if (error) throw error;
    } catch (error) {
      if (!scope.active) return;
      console.error('Error reordering tasks:', error);
      scope.refreshTasks = true;
    } finally {
      finishMutation(scope);
    }
  };

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    if (!userId) {
      alert('작업을 추가하려면 로그인해주세요.');
      return;
    }
    const scope = beginMutation();
    if (!scope) return;

    const maxPosition =
      tasks.length > 0 ? Math.max(...tasks.map((task) => task.position)) : -1;

    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title: newTaskTitle.trim(),
          subject_id: newSubjectId,
          due_date: selectedDateKey,
          status: 'todo',
          position: maxPosition + 1,
          estimated_pomodoros: clampPomodoroGoal(newGoal),
        })
        .select(
          'id, title, status, estimated_pomodoros, position, source_subtask_id, source_long_term_task_id, source_pinned_task_id, subject_id'
        )
        .single();

      if (!scope.active) return;
      if (error) throw error;

      const createdTask = normalizeTaskRows([data as TaskRow])[0];
      setTasks((currentTasks) => [...currentTasks, { ...createdTask, duration: 0, pomodoros: 0 }]);
      if (createdTask.subject_id) notifyStudySubjectsChanged();
      setNewTaskTitle('');
      setNewGoal(DEFAULT_POMODORO_GOAL);
      resetSubject();
      setIsAdding(false);
    } catch (error) {
      if (scope.active) console.error('Error adding task:', error);
    } finally {
      finishMutation(scope);
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    const scope = beginMutation();
    if (!scope) return;
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    setTasks((currentTasks) =>
      currentTasks.map((currentTask) =>
        currentTask.id === task.id
          ? { ...currentTask, status: nextStatus }
          : currentTask
      )
    );

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: nextStatus })
        .eq('id', task.id);
      if (!scope.active) return;
      if (error) throw error;
    } catch (error) {
      if (!scope.active) return;
      console.error('Error updating task:', error);
      scope.refreshTasks = true;
    } finally {
      finishMutation(scope);
    }
  };

  const updateTask = async (taskId: string, title: string, subjectId: string | null) => {
    const originalTask = tasks.find((task) => task.id === taskId);
    const scope = beginMutation();
    if (!scope) return;
    setTasks((currentTasks) => currentTasks.map((task) =>
      task.id === taskId ? { ...task, title, subject_id: subjectId } : task
    ));

    try {
      // The RPC uses the current stored source link and commits the daily task
      // and its template together, including when another tab just pinned it.
      const { data, error } = await supabase.rpc('update_daily_task_with_pin', {
        p_task_id: taskId, p_title: title, p_subject_id: subjectId,
      }).single();
      if (!scope.active) return;
      if (error || !data) throw error ?? new Error('No updated task returned');
      const savedTask = normalizeTaskRows([data as TaskRow])[0];
      setTasks((current) => current.map((task) => task.id === taskId
        ? { ...task, ...savedTask } : task));
      if ((originalTask?.subject_id ?? null) !== subjectId) notifyStudySubjectsChanged();
    } catch (error) {
      if (!scope.active) return;
      console.error('Error updating task:', error);
      toast.error('할 일을 저장하지 못했습니다. 다시 시도해주세요.');
      scope.refreshTasks = true;
    } finally {
      finishMutation(scope);
    }
  };

  const confirmDelete = async () => {
    if (!deletingTaskId) return;
    const scope = beginMutation();
    if (!scope) return;

    const taskId = deletingTaskId;
    setTasks((currentTasks) =>
      currentTasks.filter((task) => task.id !== taskId)
    );

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      if (!scope.active) return;
      if (error) throw error;
    } catch (error) {
      if (!scope.active) return;
      console.error('Error deleting task:', error);
      scope.refreshTasks = true;
    } finally {
      finishMutation(scope);
    }
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setNewTaskTitle('');
    setNewGoal(DEFAULT_POMODORO_GOAL);
    resetSubject();
  };

  const selectedDate = parse(selectedDateKey, 'yyyy-MM-dd', new Date());
  const dayLabel = formatDayLabel(selectedDate, !isDesktop);
  const isToday = selectedDateKey === format(new Date(), 'yyyy-MM-dd');
  const dayDone = tasks.reduce((sum, task) => sum + (task.pomodoros ?? 0), 0);
  const dayGoal = tasks.reduce((sum, task) => sum + getTaskPomodoroGoal(task.estimated_pomodoros), 0);
  let summary = '';
  if (tasks.length > 0) {
    summary = isDesktop
      ? `뽀모도로 ${dayDone} / ${dayGoal}개${isToday ? ' (오늘)' : ''}`
      : `${dayDone} / ${dayGoal} 뽀모도로`;
  } else if (!loading) {
    if (dayPomodoros) summary = isDesktop ? `계획 없이 뽀모도로 ${dayPomodoros}개를 했어요` : `계획 없이 ${dayPomodoros}개`;
    else summary = isDesktop ? '아직 계획이 없어요' : '계획 없음';
  }
  const emptyText = dayPomodoros
    ? '계획 없이 한 뽀모도로예요. 다음엔 계획을 세워 볼까요?'
    : isDesktop ? '이날의 계획이 없어요. 계획 추가로 시작해 보세요.' : '이날의 계획이 없어요. + 버튼으로 추가해 보세요.';

  const addForm = (
    <form
      onSubmit={addTask}
      className={cn(
        'flex min-w-0 flex-col',
        // 데스크톱은 회색 판 위 흰 입력칸, 모바일 시트는 흰 바탕 위 회색 입력칸(보드 기준)
        isDesktop
          ? 'gap-3 rounded-panel bg-surface px-5 py-[18px] [&_.ui-input]:bg-white [&_[role=combobox]]:bg-white'
          : 'gap-4'
      )}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={formTitleId} className="text-[13px] font-semibold text-ink-muted">할 일</label>
        <input
          ref={titleInputRef}
          id={formTitleId}
          type="text"
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
          onKeyDown={(event) => {
            // 시트는 대화상자가 Escape를 처리한다.
            if (event.key === 'Escape' && isDesktop) { event.preventDefault(); cancelAdding(); }
          }}
          placeholder="예: 모의고사 풀이"
          className={cn('ui-input w-full', isDesktop ? 'min-h-[46px]' : 'min-h-12 rounded-tile')}
          autoFocus={isDesktop}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3 md:gap-4">
        <div className="min-w-0 flex-[1_1_12rem]">
          <SubjectSelect
            subjects={subjects}
            value={newSubjectId}
            onChange={selectSubject}
            onCreate={createSubject}
            automatic={isAutomatic}
            onAutoSelect={resetSubject}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span id={goalLabelId} className="text-[13px] font-semibold text-ink-muted">뽀모도로</span>
          <div role="group" aria-labelledby={goalLabelId} className="flex items-center gap-1">
            <button
              type="button"
              aria-label="뽀모도로 줄이기"
              disabled={newGoal <= POMODORO_GOAL_MIN}
              onClick={() => setNewGoal((goal) => clampPomodoroGoal(goal - 1))}
              className={cn('ui-icon-button-surface text-xl leading-none', isDesktop ? 'size-[46px] bg-white' : 'size-11')}
            >
              −
            </button>
            <output aria-live="polite" className="min-w-10 text-center text-base font-bold">{newGoal}</output>
            <button
              type="button"
              aria-label="뽀모도로 늘리기"
              disabled={newGoal >= POMODORO_GOAL_MAX}
              onClick={() => setNewGoal((goal) => clampPomodoroGoal(goal + 1))}
              className={cn('ui-icon-button-surface text-xl leading-none', isDesktop ? 'size-[46px] bg-white' : 'size-11')}
            >
              +
            </button>
          </div>
        </div>
      </div>
      <div className={isDesktop ? 'flex justify-end gap-2' : 'flex gap-2 pt-1'}>
        <button
          type="button"
          onClick={cancelAdding}
          className={isDesktop ? 'ui-button-ghost min-h-[46px] px-4' : 'ui-button-secondary min-h-[50px] flex-1 rounded-tile'}
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!newTaskTitle.trim()}
          className={cn('ui-button-primary ui-press', isDesktop ? 'min-h-[46px] px-5' : 'min-h-[50px] flex-1 rounded-tile')}
        >
          추가
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2 md:gap-[18px]">
      <div className="flex items-center justify-between gap-3 md:flex-wrap md:gap-4">
        <div className="flex min-w-0 items-baseline gap-2 md:flex-col md:items-start md:gap-0.5">
          <h2 className="m-0 text-[17px] font-extrabold tracking-[-0.01em] whitespace-nowrap md:text-[22px] md:tracking-[-0.02em]">
            {dayLabel}
          </h2>
          <span className="min-w-0 truncate text-[13px] text-ink-muted md:text-[15px]">{summary || ' '}</span>
        </div>
        {isDesktop ? (
          !isAdding ? (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="ui-button-primary ui-press min-h-11 shrink-0 rounded-tile px-[18px]"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
              계획 추가
            </button>
          ) : null
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            aria-label="계획 추가"
            className="ui-icon-button ui-focus-ink ui-press shrink-0 bg-pomo text-white after:absolute after:-inset-0.5 after:rounded-full after:content-[''] hover:bg-pomo hover:brightness-96"
          >
            <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {isDesktop && isAdding ? addForm : null}

      <div className="min-w-0">
        {loading && tasks.length === 0 ? (
          <p className="m-0 py-3 text-sm text-ink-muted">작업을 불러오는 중...</p>
        ) : tasks.length === 0 ? (
          <p className="m-0 py-3 text-sm text-ink-muted md:text-[15px]">{emptyText}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map((task) => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul aria-label={`${dayLabel} 할 일`} className="m-0 flex list-none flex-col gap-0.5 p-0">
                {tasks.map((task) => (
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    toggleTaskStatus={toggleTaskStatus}
                    deleteTask={(taskId) => setDeletingTaskId(taskId)}
                    updateTask={updateTask}
                    pinTask={pinTaskFromTask}
                    subjects={subjects}
                    createSubject={createSubject}
                    isPinned={Boolean(task.source_pinned_task_id)}
                    isDesktop={isDesktop}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {!isDesktop ? (
        <ModalDialog
          open={isAdding}
          onClose={cancelAdding}
          aria-labelledby={sheetTitleId}
          initialFocusRef={titleInputRef}
          className="md:max-w-[440px]"
        >
          <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
          <h2 id={sheetTitleId} className="ui-dialog-title">{dayLabel} 계획 추가</h2>
          {addForm}
        </ModalDialog>
      ) : null}

      <ConfirmModal
        isOpen={!!deletingTaskId}
        onClose={() => setDeletingTaskId(null)}
        onConfirm={confirmDelete}
        title="작업 삭제"
        message="이 작업을 삭제할까요? 되돌릴 수 없어요."
        confirmText="삭제"
        cancelText="취소"
        confirmTone="danger"
      />
    </div>
  );
}
