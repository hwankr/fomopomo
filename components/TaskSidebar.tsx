'use client';

import { useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import * as Popover from '@radix-ui/react-popover';
import toast from 'react-hot-toast';
import { Check, ChevronDown, CircleDashed, Play } from 'lucide-react';
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
import type { StudySubject } from '@/lib/studySubjects';
import { cn } from '@/lib/utils';
import Beads from '@/components/ui/Beads';
import ModalDialog from '@/components/ui/ModalDialog';
import TaskCreateForm from '@/components/timer/TaskCreateForm';
import { useIsDesktop } from '@/components/timer/ui/useIsDesktop';

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
  /** 작업 행에 과목 이름을 작게 보여 주기 위한 목록 */
  subjects?: StudySubject[];
  /** 데스크톱 팝오버를 붙일 "지금 하는 일" 버튼 */
  anchorRef?: RefObject<HTMLElement | null>;
  /** 로그아웃 상태에서 로그인 창을 연다 */
  onOpenLogin?: () => void;
}

const EMPTY_SUBTASK_IDS: ReadonlySet<string> = new Set();
const EMPTY_SUBJECTS: StudySubject[] = [];

// 미완료를 위로, 완료를 아래로. sort는 stable이라 나머지 순서는 보존된다.
const partitionDoneLast = <T,>(items: T[], isDone: (item: T) => boolean) =>
  [...items].sort((a, b) => Number(isDone(a)) - Number(isDone(b)));

// 둥근 체크 원. 실제 체크박스라 상태(완료 여부)가 보조기기에 그대로 전달된다.
// 보이는 원은 24px(데스크톱 22px)이고, 감싼 label이 44px 누름 영역이 된다.
// 음수 여백으로 자리는 원 크기 그대로 두어 옆의 작업 선택 버튼과 겹치지 않는다.
function RoundCheck({
  checked,
  label,
  onChange,
  disabled = false,
  busy = false,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <label className="relative -m-2.5 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center has-disabled:cursor-wait md:-m-[11px]">
      <span className="relative inline-flex size-6 items-center justify-center md:size-[22px]">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          aria-busy={busy || undefined}
          aria-label={label}
          className="size-full cursor-pointer appearance-none rounded-full border-[1.5px] border-control bg-white text-ink transition-colors checked:border-pomo checked:bg-pomo disabled:cursor-wait disabled:opacity-60"
        />
        {checked ? (
          <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute size-3.5 text-white md:size-[13px]" />
        ) : null}
      </span>
    </label>
  );
}

function NowBadge() {
  return (
    <span className="shrink-0 rounded-[6px] bg-pomo-tint px-[7px] py-0.5 text-[11px] leading-[1.4] font-semibold text-pomo-deep">
      지금
    </span>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="m-0 px-2.5 pt-2 pb-1 text-xs font-semibold text-ink-muted">{children}</h3>;
}

function TaskSection({
  title,
  items,
  selectedTaskId,
  getSubjectName,
  onSelectTask,
  onToggleTask,
}: {
  title: string;
  items: TaskItem[];
  selectedTaskId: string | null;
  getSubjectName: (id?: string | null) => string | null;
  onSelectTask: (task: TaskItem) => void;
  onToggleTask: (task: TaskItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col">
      <SectionHeading>{title}</SectionHeading>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {partitionDoneLast(items, (task) => task.status === 'done').map((task) => {
          const isDone = task.status === 'done';
          const isSelected = selectedTaskId === task.id;
          const durationLabel = formatDuration(task.durationSeconds);
          const subjectName = getSubjectName(task.subjectId);
          const goal = task.pomodoroGoal ?? 0;
          const count = task.pomodoroCount ?? 0;
          return (
            <li
              key={task.id}
              className="flex min-h-14 items-center gap-3 rounded-control px-2.5 py-[3px] transition-colors hover:bg-hover md:py-1"
            >
              <RoundCheck checked={isDone} label={`${task.title} 완료`} onChange={() => onToggleTask(task)} />
              <button
                type="button"
                onClick={() => onSelectTask(task)}
                aria-pressed={isSelected}
                data-picker-row=""
                data-picker-autofocus={isSelected ? '' : undefined}
                className={cn(
                  'flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left text-[15px] md:min-h-10',
                  isDone ? 'text-ink-muted line-through' : 'text-ink',
                  isSelected ? 'font-semibold' : 'font-medium',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate">{task.title}</span>
                  {subjectName ? <span className="shrink-0 text-xs font-medium text-ink-subtle">{subjectName}</span> : null}
                  {isSelected ? <NowBadge /> : null}
                </span>
                {task.parentTitle || durationLabel ? (
                  <span className="flex min-w-0 gap-2 text-xs font-normal text-ink-subtle">
                    {task.parentTitle ? <span className="min-w-0 truncate">{task.parentTitle}</span> : null}
                    {durationLabel ? <span className="shrink-0">누적 {durationLabel}</span> : null}
                  </span>
                ) : null}
              </button>
              {goal > 0 ? (
                <Beads
                  label={`뽀모도로 ${count} / ${goal}`}
                  done={Math.min(count, goal)}
                  total={goal}
                  size={8}
                  gap={4}
                  wrap
                  className="max-w-[92px] justify-end"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
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
  getSubjectName,
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
  getSubjectName: (id?: string | null) => string | null;
  onSelectLongTermTask: (task: LongTermTaskItem) => void;
  onSelectSubtask: (subtask: LongTermSubtaskItem) => void;
  onToggleSubtask: (subtask: LongTermSubtaskItem) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const roots = getLongTermTaskRoots(items);
  if (roots.length === 0) return null;

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
    const subjectName = getSubjectName(task.subject_id);
    const durationLabel = task.durationSeconds === undefined
      ? '누적 시간 확인 불가'
      : `누적 ${formatDuration(task.durationSeconds) || '0m'}`;
    return (
      <div key={task.id} className="flex flex-col gap-0.5">
        <div className="rounded-control px-2.5 py-1.5 transition-colors hover:bg-hover">
          <div className="flex min-h-10 items-center gap-2">
            {hasDetails ? (
              <button
                type="button"
                onClick={() => toggleExpanded(task.id)}
                aria-expanded={isExpanded}
                aria-label={task.parent_task_id ? breadcrumb : undefined}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-1.5 text-left text-[15px] font-medium"
              >
                <span className="truncate">{task.title}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('size-4 shrink-0 text-ink-muted transition-transform', isExpanded && 'rotate-180')}
                />
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{task.title}</span>
            )}
            {!unavailableParentIds.has(task.id) && (
              <button
                type="button"
                onClick={() => onSelectLongTermTask(task)}
                disabled={selectionPending}
                aria-label={`${breadcrumb} 공부하기`}
                aria-busy={isPending}
                className="ui-button-secondary ui-press min-h-8 shrink-0 gap-1 rounded-chip px-2.5 text-[13px] disabled:cursor-wait"
              >
                <Play aria-hidden="true" className="size-3" />
                {isPending ? '준비 중…' : '공부하기'}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-subtle">
            {subjectName ? <span>{subjectName}</span> : null}
            <span>{durationLabel}</span>
            {progress.totalCount > 0 && <span>{`완료 ${progress.completedCount}/${progress.totalCount}`}</span>}
          </div>
        </div>
        {hasDetails && isExpanded && (
          <div className="flex flex-col gap-0.5 pl-5">
            {partitionDoneLast(
              task.subtasks,
              (subtask) => subtask.completed_at !== null
            ).map((subtask) => {
              const isDone = subtask.completed_at !== null;
              const isSubtaskPending = subtask.id === pendingSubtaskId;
              const isTogglePending = pendingToggleSubtaskIds.has(subtask.id);
              return (
                <div
                  key={subtask.id}
                  className="flex min-h-14 items-center gap-3 rounded-control px-2.5 py-1 transition-colors hover:bg-hover"
                >
                  <RoundCheck
                    checked={isDone}
                    label={`${subtask.title} 완료`}
                    onChange={() => onToggleSubtask(subtask)}
                    disabled={isTogglePending}
                    busy={isTogglePending}
                  />
                  {isDone ? (
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink-muted line-through">
                      {subtask.title}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectSubtask(subtask)}
                      disabled={selectionPending}
                      aria-busy={isSubtaskPending}
                      className="flex min-h-10 min-w-0 flex-1 items-center text-left text-[15px] font-medium disabled:opacity-60"
                    >
                      <span className="truncate">{subtask.title}</span>
                    </button>
                  )}
                  {materializedSubtaskIds.has(subtask.id) && (
                    <span className="shrink-0 rounded-[6px] bg-pomo-tint px-[7px] py-0.5 text-[11px] leading-[1.4] font-semibold text-pomo-deep">
                      오늘
                    </span>
                  )}
                  {isSubtaskPending && (
                    <span
                      aria-hidden
                      className="size-4 shrink-0 animate-spin rounded-full border-2 border-bead border-t-pomo"
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
    <div className="flex flex-col">
      <SectionHeading>장기 과제</SectionHeading>
      <div className="flex flex-col gap-0.5">{roots.map(renderTask)}</div>
    </div>
  );
}

// 타이머의 "지금 하는 일" 선택기. 데스크톱은 버튼 아래 팝오버, 모바일은 아래 시트.
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
  subjects = EMPTY_SUBJECTS,
  anchorRef,
  onOpenLogin,
}: TaskSidebarProps) {
  const titleId = useId();
  const isDesktop = useIsDesktop();
  const [pendingSubtaskId, setPendingSubtaskId] = useState<string | null>(null);
  const [pendingLongTermTaskId, setPendingLongTermTaskId] = useState<string | null>(null);
  const pendingSelectionRef = useRef(false);
  const selectionRequestRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const interactedOutsideRef = useRef(false);

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

  // 구체화가 끝나 tasks 행이 실제로 선택된 뒤에만 선택기를 닫는다.
  // 실패하면 선택기를 열어둔 채 에러 토스트를 띄운다.
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

  const getSubjectName = (id?: string | null) =>
    id ? subjects.find((subject) => subject.id === id)?.name ?? null : null;

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
  const nextTaskCount = availableTasks(tasks).length + availableTasks(weeklyPlans).length +
    availableTasks(monthlyPlans).length + getLongTermTaskRoots(availableLongTermTasks).length;
  const hasNextTask = nextTaskCount > 0;

  const title = choosingNextTask ? '다음 작업 선택' : '작업 목록';
  const canCreate = Boolean(userId && onCreateTask);

  // 고를 작업도, 해제할 선택도 없으면(로그아웃 등) 굳이 보이지 않는다.
  const clearButton = choosingNextTask || (selectedTaskId === null && nextTaskCount === 0) ? null : (
    <button
      type="button"
      onClick={() => selectAndClose(null)}
      aria-pressed={selectedTaskId === null}
      className={cn(
        'ui-button-ghost ui-press -mr-1 min-h-10 gap-1.5 rounded-chip px-2.5 text-sm',
        selectedTaskId === null ? 'text-ink' : 'font-medium text-ink-muted',
      )}
    >
      <CircleDashed aria-hidden="true" className="size-4 shrink-0 opacity-70" />
      작업 없이 시작
    </button>
  );

  const body = (
    <>
      {choosingNextTask && (
        <p role="status" className="m-0 px-2.5 pt-1 text-[13px] leading-relaxed text-ink-muted">
          {selectionDisabled
            ? '현재 작업을 마무리하고 있어요. 남은 시간은 멈춰 있어요.'
            : '타이머가 잠시 멈췄어요. 다음 작업을 고르면 남은 시간부터 자동으로 시작해요.'}
        </p>
      )}
      <fieldset disabled={selectionDisabled} className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0 disabled:opacity-60">
        {choosingNextTask && !hasNextTask && (
          <p className="m-0 px-2.5 py-2 text-sm leading-relaxed text-ink-muted">
            이어서 할 작업이 없어요. 일정을 추가한 뒤 다음 작업으로 선택해주세요. 남은 시간은 유지돼요.
          </p>
        )}
        {!choosingNextTask && nextTaskCount === 0 && (
          canCreate ? (
            <p className="m-0 px-2.5 py-2 text-sm text-ink-muted">오늘 할 일이 아직 없어요. 작업을 추가해 보세요.</p>
          ) : (
            <div className="flex flex-col items-start gap-1 px-2.5 py-2">
              <p className="m-0 text-sm text-ink-muted">로그인하면 할 일을 추가하고 기록에 연결할 수 있어요.</p>
              {onOpenLogin ? (
                <button
                  type="button"
                  onClick={() => { closeSidebar(); onOpenLogin(); }}
                  className="ui-button-ghost -ml-3 min-h-10 text-sm text-pomo"
                >
                  로그인
                </button>
              ) : null}
            </div>
          )
        )}

        <TaskSection
          title="오늘"
          items={availableTasks(tasks)}
          selectedTaskId={selectedTaskId}
          getSubjectName={getSubjectName}
          onSelectTask={selectAndClose}
          onToggleTask={onToggleTask}
        />
        <TaskSection
          title="이번 주"
          items={availableTasks(weeklyPlans)}
          selectedTaskId={selectedTaskId}
          getSubjectName={getSubjectName}
          onSelectTask={selectAndClose}
          onToggleTask={onToggleTask}
        />
        <TaskSection
          title="이번 달"
          items={availableTasks(monthlyPlans)}
          selectedTaskId={selectedTaskId}
          getSubjectName={getSubjectName}
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
          getSubjectName={getSubjectName}
          onSelectLongTermTask={(task) => { void selectLongTermTaskAndClose(task); }}
          onSelectSubtask={(subtask) => {
            void selectSubtaskAndClose(subtask);
          }}
          onToggleSubtask={onToggleSubtask}
        />

        <div className="pt-1">
          {canCreate && userId && onCreateTask ? (
            <TaskCreateForm key={userId} userId={userId} onCreateTask={onCreateTask} trailing={clearButton} />
          ) : clearButton ? (
            <div className="flex justify-end">{clearButton}</div>
          ) : null}
        </div>
      </fieldset>
    </>
  );

  if (!isDesktop) {
    return (
      <ModalDialog
        open
        onClose={closeSidebar}
        aria-labelledby={titleId}
        className="max-h-[80dvh] gap-2 pt-3 pb-[calc(36px+env(safe-area-inset-bottom))]"
      >
        <span aria-hidden="true" className="ui-sheet-grabber" />
        <div className="flex min-h-9 items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={closeSidebar}
            className="ui-button-ghost -mr-2.5 min-h-9 rounded-chip px-2.5 text-sm text-ink-muted"
          >
            닫기
          </button>
        </div>
        <div className="flex flex-col">{body}</div>
      </ModalDialog>
    );
  }

  return (
    <Popover.Root open onOpenChange={(open) => { if (!open) closeSidebar(); }}>
      {anchorRef ? <Popover.Anchor virtualRef={anchorRef} /> : null}
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          aria-label={title}
          side="bottom"
          align="center"
          sideOffset={6}
          collisionPadding={16}
          // 보드처럼 늘 버튼 아래(시트 위)로 열고, 남은 높이 안에서 스크롤한다.
          avoidCollisions={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            interactedOutsideRef.current = false;
            const content = contentRef.current;
            (content?.querySelector<HTMLElement>('[data-picker-autofocus]')
              ?? content?.querySelector<HTMLElement>('[data-picker-row]')
              ?? content)?.focus();
          }}
          onCloseAutoFocus={(event) => {
            // 선택·Escape로 닫으면 버튼으로 돌아가고, 바깥을 눌러 닫으면 누른 곳에 둔다.
            event.preventDefault();
            if (!interactedOutsideRef.current) anchorRef?.current?.focus();
          }}
          onInteractOutside={(event) => {
            // 버튼을 다시 누르면 닫혔다가 바로 열리지 않도록 버튼 쪽 토글에 맡긴다.
            if (anchorRef?.current?.contains(event.target as Node)) {
              event.preventDefault();
              return;
            }
            interactedOutsideRef.current = true;
          }}
          onEscapeKeyDown={(event) => {
            // 작업 추가 칸에서 누른 Escape는 입력만 닫는다.
            if (document.activeElement?.closest('[data-task-create-form]')) event.preventDefault();
          }}
          // 안쪽 키 입력이 window의 타이머 단축키(Space)로 새지 않게 막는다.
          onKeyDown={(event) => event.stopPropagation()}
          className="ui-popover ui-popover-surface z-40 flex w-[464px] max-w-[calc(100vw-32px)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-panel px-3 pt-2.5 pb-3 outline-none"
          style={{ maxHeight: 'min(560px, calc(var(--radix-popover-content-available-height, 560px) - 8px))' }}
        >
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
