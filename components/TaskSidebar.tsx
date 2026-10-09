'use client';

import { useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, ChevronDown, Circle, CircleDashed, Play } from 'lucide-react';
import type {
  CreateTaskInput,
  LongTermSubtaskItem,
  LongTermTaskItem,
  TaskItem,
} from '@/components/timer/hooks/useTasks';
import { formatDuration } from '@/lib/formatDuration';
import {
  getLongTermTaskBreadcrumb,
  getLongTermTaskChildren,
  getLongTermTaskProgress,
  getLongTermTaskRoots,
} from '@/lib/longTermTasks';
import TaskCreateForm from '@/components/timer/TaskCreateForm';

interface TaskSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskItem[];
  weeklyPlans?: TaskItem[];
  monthlyPlans?: TaskItem[];
  longTermTasks?: LongTermTaskItem[];
  onSelectTask: (task: TaskItem | null) => void;
  onToggleTask: (task: TaskItem) => void;
  // 첫 선택 시 챕터가 오늘 할 일로 구체화되므로, 실제로 선택된 tasks 행을
  // (실패 시 null을) resolve하는 promise를 돌려줘야 한다.
  onSelectSubtask: (subtask: LongTermSubtaskItem) => Promise<TaskItem | null>;
  onSelectLongTermTask: (task: LongTermTaskItem) => Promise<TaskItem | null>;
  onToggleSubtask: (subtask: LongTermSubtaskItem) => void;
  pendingToggleSubtaskIds?: ReadonlySet<string>;
  selectedTaskId: string | null;
  choosingNextTask?: boolean;
  selectionDisabled?: boolean;
  excludedTaskId?: string | null;
  userId?: string | null;
  onCreateTask?: (input: CreateTaskInput) => Promise<TaskItem | null>;
}

type SectionColor = 'rose' | 'indigo' | 'purple' | 'emerald';

const SECTION_STYLES: Record<
  SectionColor,
  { selected: string; check: string; badge: string }
> = {
  rose: {
    selected:
      'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-400',
    check: 'text-rose-500',
    badge:
      'bg-rose-50 text-rose-500 dark:bg-rose-900/30',
  },
  indigo: {
    selected:
      'border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-900/50 dark:bg-indigo-900/20 dark:text-indigo-400',
    check: 'text-indigo-500',
    badge:
      'bg-indigo-50 text-indigo-500 dark:bg-indigo-900/30',
  },
  purple: {
    selected:
      'border-purple-100 bg-purple-50 text-purple-600 dark:border-purple-900/50 dark:bg-purple-900/20 dark:text-purple-400',
    check: 'text-purple-500',
    badge:
      'bg-purple-50 text-purple-500 dark:bg-purple-900/30',
  },
  emerald: {
    selected:
      'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400',
    check: 'text-emerald-500',
    badge:
      'bg-emerald-50 text-emerald-500 dark:bg-emerald-900/30',
  },
};

const EMPTY_SUBTASK_IDS: ReadonlySet<string> = new Set();

// 미완료를 위로, 완료를 아래로. sort는 stable이라 나머지 순서는 보존된다.
const partitionDoneLast = <T,>(items: T[], isDone: (item: T) => boolean) =>
  [...items].sort((a, b) => Number(isDone(a)) - Number(isDone(b)));

function TaskSection({
  title,
  items,
  color,
  selectedTaskId,
  onSelectTask,
  onToggleTask,
}: {
  title: string;
  items: TaskItem[];
  color: SectionColor;
  selectedTaskId: string | null;
  onSelectTask: (task: TaskItem) => void;
  onToggleTask: (task: TaskItem) => void;
}) {
  if (items.length === 0) return null;

  const styles = SECTION_STYLES[color];

  return (
    <div className="space-y-2">
      <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-gray-400">
        {title}
      </h3>
      {partitionDoneLast(items, (task) => task.status === 'done').map((task) => {
        const isDone = task.status === 'done';
        const durationLabel = formatDuration(task.durationSeconds);
        return (
          <div
            key={task.id}
            className={`flex w-full items-center rounded-xl border pr-2 transition-all ${
              selectedTaskId === task.id
                ? styles.selected
                : 'border-transparent hover:bg-gray-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <button
              onClick={() => onToggleTask(task)}
              aria-label={isDone ? '완료 해제' : '완료로 표시'}
              className={`flex-shrink-0 p-2 pl-3 transition-colors ${
                isDone ? styles.check : 'text-gray-300 hover:text-gray-400'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={() => onSelectTask(task)}
              className={`min-w-0 flex-1 py-3 pl-1 pr-2 text-left text-sm font-medium ${
                isDone
                  ? 'text-gray-400 line-through dark:text-gray-500'
                  : selectedTaskId === task.id
                    ? ''
                    : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <span className="block truncate">{task.title}</span>
              {task.parentTitle && (
                <span className="block truncate text-xs font-normal text-gray-400 dark:text-gray-500">
                  {task.parentTitle}
                </span>
              )}
            </button>
            {durationLabel && (
              <span
                className={`flex-shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${styles.badge}`}
              >
                {durationLabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LongTermTaskSection({
  items,
  materializedSubtaskIds,
  pendingSubtaskId,
  pendingLongTermTaskId,
  unavailableParentIds,
  pendingToggleSubtaskIds,
  onSelectLongTermTask,
  onSelectSubtask,
  onToggleSubtask,
}: {
  items: LongTermTaskItem[];
  materializedSubtaskIds: Set<string>;
  pendingSubtaskId: string | null;
  pendingLongTermTaskId: string | null;
  unavailableParentIds: ReadonlySet<string>;
  pendingToggleSubtaskIds: ReadonlySet<string>;
  onSelectLongTermTask: (task: LongTermTaskItem) => void;
  onSelectSubtask: (subtask: LongTermSubtaskItem) => void;
  onToggleSubtask: (subtask: LongTermSubtaskItem) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const roots = getLongTermTaskRoots(items);
  if (roots.length === 0) return null;

  const styles = SECTION_STYLES.emerald;

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTask = (task: LongTermTaskItem): ReactNode => {
    const isExpanded = expandedIds.has(task.id);
    const hasSubtasks = task.subtasks.length > 0;
    const children = task.parent_task_id ? [] : getLongTermTaskChildren(items, task.id);
    const hasDetails = hasSubtasks || children.length > 0;
    const progress = getLongTermTaskProgress(task, items);
    const breadcrumb = getLongTermTaskBreadcrumb(task, items);
    const isPending = task.id === pendingLongTermTaskId;
    const selectionPending = pendingSubtaskId !== null || pendingLongTermTaskId !== null;
    const durationLabel = task.durationSeconds === undefined
      ? '누적 시간 확인 불가'
      : `누적 ${formatDuration(task.durationSeconds) || '0m'}`;
    return (
      <div key={task.id} className="space-y-2">
        <div className="rounded-xl border border-gray-100 px-3 py-2 transition-colors hover:border-emerald-100 hover:bg-emerald-50/50 focus-within:border-emerald-200 focus-within:bg-emerald-50/50 dark:border-slate-800 dark:hover:border-emerald-900/60 dark:hover:bg-emerald-950/30 dark:focus-within:border-emerald-800 dark:focus-within:bg-emerald-950/30">
          <div className="flex items-center gap-2">
            {hasDetails ? (
              <button onClick={() => toggleExpanded(task.id)} aria-expanded={isExpanded}
                aria-label={task.parent_task_id ? breadcrumb : undefined}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md py-1 text-left text-sm font-medium text-gray-700 outline-none transition-colors hover:text-emerald-700 focus-visible:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-300 dark:text-gray-300 dark:hover:text-emerald-300 dark:focus-visible:text-emerald-300 dark:focus-visible:ring-emerald-700">
                <span className="truncate">{task.title}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate py-1 text-sm font-medium text-gray-700 dark:text-gray-300">{task.title}</span>
            )}
            {!unavailableParentIds.has(task.id) && (
              <button onClick={() => onSelectLongTermTask(task)} disabled={selectionPending}
                aria-label={`${breadcrumb} 공부하기`} aria-busy={isPending}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 outline-none transition-colors hover:border-emerald-200 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:border-emerald-900/50 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-900/50 dark:focus-visible:ring-emerald-600 dark:focus-visible:ring-offset-gray-900">
                <Play aria-hidden="true" className="h-3 w-3" />
                {isPending ? '준비 중…' : '공부하기'}
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
            <span>{durationLabel}</span>
            {progress.totalCount > 0 && <span>{`완료 ${progress.completedCount}/${progress.totalCount}`}</span>}
          </div>
        </div>
        {hasDetails && isExpanded && (
          <div className="ml-2 space-y-2 border-l border-gray-100 pl-2 dark:border-slate-800">
            {partitionDoneLast(
              task.subtasks,
              (subtask) => subtask.completed_at !== null
            ).map((subtask) => {
              const isDone = subtask.completed_at !== null;
              const isPending = subtask.id === pendingSubtaskId;
              const isTogglePending = pendingToggleSubtaskIds.has(
                subtask.id
              );
              return (
                <div
                  key={subtask.id}
                  className="flex w-full items-center rounded-xl border border-transparent pr-2 transition-all hover:bg-gray-50 dark:hover:bg-slate-800/50"
                >
                  <button
                    onClick={() => onToggleSubtask(subtask)}
                    disabled={isTogglePending}
                    aria-busy={isTogglePending}
                    aria-label={isDone ? '완료 해제' : '완료로 표시'}
                    className={`flex-shrink-0 p-2 pl-3 transition-colors disabled:cursor-wait disabled:opacity-60 ${
                      isDone
                        ? styles.check
                        : 'text-gray-300 hover:text-gray-400'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </button>
                  {isDone ? (
                    <span className="min-w-0 flex-1 py-3 pl-1 pr-2 text-left text-sm font-medium text-gray-400 line-through dark:text-gray-500">
                      <span className="block truncate">{subtask.title}</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => onSelectSubtask(subtask)}
                      disabled={selectionPending}
                      aria-busy={isPending}
                      className="min-w-0 flex-1 py-3 pl-1 pr-2 text-left text-sm font-medium text-gray-700 disabled:opacity-60 dark:text-gray-300"
                    >
                      <span className="block truncate">{subtask.title}</span>
                    </button>
                  )}
                  {materializedSubtaskIds.has(subtask.id) && (
                    <span
                      className={`flex-shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${SECTION_STYLES.rose.badge}`}
                    >
                      오늘
                    </span>
                  )}
                  {isPending && (
                    <span
                      aria-hidden
                      className="ml-1 h-4 w-4 flex-shrink-0 animate-spin rounded-full border-b-2 border-emerald-500"
                    />
                  )}
                </div>
              );
            })}
            {children.map(renderTask)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-gray-400">
        장기 과제
      </h3>
      {roots.map(renderTask)}
    </div>
  );
}

export default function TaskSidebar({
  isOpen,
  onClose,
  tasks,
  weeklyPlans = [],
  monthlyPlans = [],
  longTermTasks = [],
  onSelectTask,
  onToggleTask,
  onSelectSubtask,
  onSelectLongTermTask,
  onToggleSubtask,
  pendingToggleSubtaskIds = EMPTY_SUBTASK_IDS,
  selectedTaskId,
  choosingNextTask = false,
  selectionDisabled = false,
  excludedTaskId = null,
  userId,
  onCreateTask,
}: TaskSidebarProps) {
  const [pendingSubtaskId, setPendingSubtaskId] = useState<string | null>(null);
  const [pendingLongTermTaskId, setPendingLongTermTaskId] = useState<string | null>(null);
  const pendingSelectionRef = useRef(false);
  const selectionRequestRef = useRef(0);

  if (!isOpen) return null;

  const closeSidebar = () => {
    selectionRequestRef.current += 1;
    setPendingSubtaskId(null);
    setPendingLongTermTaskId(null);
    pendingSelectionRef.current = false;
    onClose();
  };

  const selectAndClose = (task: TaskItem | null) => {
    if (selectionDisabled || (task && task.id === excludedTaskId)) return;
    onSelectTask(task);
    closeSidebar();
  };

  // 구체화가 끝나 tasks 행이 실제로 선택된 뒤에만 드로어를 닫는다.
  // 실패하면 드로어를 열어둔 채 에러 토스트를 띄운다.
  const selectSubtaskAndClose = async (subtask: LongTermSubtaskItem) => {
    if (selectionDisabled || pendingSelectionRef.current) return;
    pendingSelectionRef.current = true;
    const request = ++selectionRequestRef.current;
    setPendingSubtaskId(subtask.id);
    try {
      let selected: TaskItem | null = null;
      try {
        selected = await onSelectSubtask(subtask);
      } catch (error) {
        console.error('Error selecting long-term subtask:', error);
      }
      if (request !== selectionRequestRef.current) return;
      if (selected) closeSidebar();
      else toast.error('챕터를 오늘 할 일로 가져오지 못했어요. 다시 시도해주세요.');
    } finally {
      if (request === selectionRequestRef.current) {
        setPendingSubtaskId(null);
        pendingSelectionRef.current = false;
      }
    }
  };

  const selectLongTermTaskAndClose = async (task: LongTermTaskItem) => {
    if (selectionDisabled || pendingSelectionRef.current) return;
    pendingSelectionRef.current = true;
    const request = ++selectionRequestRef.current;
    setPendingLongTermTaskId(task.id);
    try {
      let selected: TaskItem | null = null;
      try {
        selected = await onSelectLongTermTask(task);
      } catch (error) {
        console.error('Error selecting long-term task:', error);
      }
      if (request !== selectionRequestRef.current) return;
      if (selected) closeSidebar();
      else toast.error('장기 과제를 선택하지 못했어요. 다시 시도해주세요.');
    } finally {
      if (request === selectionRequestRef.current) {
        setPendingLongTermTaskId(null);
        pendingSelectionRef.current = false;
      }
    }
  };

  // 오늘 이미 구체화된 챕터에 '오늘' 칩을 달기 위한 lookup.
  const materializedSubtaskIds = new Set(
    tasks.flatMap((task) => (task.sourceSubtaskId ? [task.sourceSubtaskId] : []))
  );
  const excludedSubtaskId = tasks.find((task) => task.id === excludedTaskId)?.sourceSubtaskId;
  const availableTasks = (items: TaskItem[]) => items.filter((task) =>
    task.id !== excludedTaskId && (!choosingNextTask || task.status !== 'done'));
  const unavailableParentIds = new Set(tasks.flatMap(task => task.sourceLongTermTaskId &&
    (task.id === excludedTaskId || (choosingNextTask && task.status === 'done')) ? [task.sourceLongTermTaskId] : []));
  const filteredLongTermTasks = longTermTasks.map((task) => ({
    ...task,
    subtasks: task.subtasks.filter((subtask) => subtask.id !== excludedSubtaskId &&
      (!choosingNextTask || subtask.completed_at === null)),
  }));
  const isTaskAvailable = (task: LongTermTaskItem) =>
    !unavailableParentIds.has(task.id) || task.subtasks.length > 0;
  const availableLongTermTasks = filteredLongTermTasks.filter((task) =>
    isTaskAvailable(task) || (!task.parent_task_id &&
      getLongTermTaskChildren(filteredLongTermTasks, task.id).some(isTaskAvailable)));
  const hasNextTask = availableTasks(tasks).length + availableTasks(weeklyPlans).length +
    availableTasks(monthlyPlans).length + getLongTermTaskRoots(availableLongTermTasks).length > 0;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={closeSidebar}
      />

      {/* Radix Select locks body scrolling; keep this fixed edge aligned with its scrollbar compensation. */}
      <div role="dialog" aria-modal="true" aria-labelledby="task-sidebar-title" className="right-scroll-bar-position fixed right-0 top-0 z-50 h-dvh w-80 max-w-[calc(100%_-_var(--removed-body-scroll-bar-size,0px))] bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:bg-gray-900">
        <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
          <div className="mb-6 flex shrink-0 items-center justify-between sm:mb-8">
            <h2 id="task-sidebar-title" className="text-xl font-bold text-gray-800 dark:text-white">
              {choosingNextTask ? '다음 작업 선택' : '작업 목록'}
            </h2>
            <button
              onClick={closeSidebar}
              aria-label="작업 목록 닫기"
              className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-6 w-6 text-gray-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {choosingNextTask && (
            <p role="status" className="mb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {selectionDisabled
                ? '현재 작업을 마무리하고 있어요. 남은 시간은 멈춰 있어요.'
                : '타이머가 잠시 멈췄어요. 다음 작업을 고르면 남은 시간부터 자동으로 시작해요.'}
            </p>
          )}
          <fieldset disabled={selectionDisabled} className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overscroll-contain disabled:opacity-60">
            {userId && onCreateTask && <TaskCreateForm key={userId} userId={userId} onCreateTask={onCreateTask} />}
            {!choosingNextTask && <button
              onClick={() => selectAndClose(null)}
              aria-pressed={selectedTaskId === null}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-rose-300 dark:focus-visible:ring-rose-700 ${
                selectedTaskId === null
                  ? SECTION_STYLES.rose.selected
                  : 'border-transparent text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-slate-800/50'
              }`}
            >
              <CircleDashed aria-hidden="true" className="h-5 w-5 shrink-0 opacity-70" />
              작업 없이 시작
            </button>}
            {choosingNextTask && !hasNextTask && (
              <p className="rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                이어서 할 작업이 없어요. 일정을 추가한 뒤 다음 작업으로 선택해주세요. 남은 시간은 유지돼요.
              </p>
            )}

            <TaskSection
              title="오늘"
              items={availableTasks(tasks)}
              color="rose"
              selectedTaskId={selectedTaskId}
              onSelectTask={selectAndClose}
              onToggleTask={onToggleTask}
            />
            <TaskSection
              title="이번 주"
              items={availableTasks(weeklyPlans)}
              color="indigo"
              selectedTaskId={selectedTaskId}
              onSelectTask={selectAndClose}
              onToggleTask={onToggleTask}
            />
            <TaskSection
              title="이번 달"
              items={availableTasks(monthlyPlans)}
              color="purple"
              selectedTaskId={selectedTaskId}
              onSelectTask={selectAndClose}
              onToggleTask={onToggleTask}
            />
            <LongTermTaskSection
              items={availableLongTermTasks}
              materializedSubtaskIds={materializedSubtaskIds}
              pendingSubtaskId={pendingSubtaskId}
              pendingLongTermTaskId={pendingLongTermTaskId}
              unavailableParentIds={unavailableParentIds}
              pendingToggleSubtaskIds={pendingToggleSubtaskIds}
              onSelectLongTermTask={(task) => { void selectLongTermTaskAndClose(task); }}
              onSelectSubtask={(subtask) => {
                void selectSubtaskAndClose(subtask);
              }}
              onToggleSubtask={onToggleSubtask}
            />
          </fieldset>
        </div>
      </div>
    </>
  );
}
