'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import type { TaskItem } from '@/components/timer/hooks/useTasks';
import { formatDuration } from '@/lib/formatDuration';

interface TaskSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskItem[];
  weeklyPlans?: TaskItem[];
  monthlyPlans?: TaskItem[];
  onSelectTask: (task: TaskItem | null) => void;
  onToggleTask: (task: TaskItem) => void;
  selectedTaskId: string | null;
}

type SectionColor = 'rose' | 'indigo' | 'purple';

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
};

// 미완료를 위로, 완료를 아래로. sort는 stable이라 나머지 순서는 보존된다.
const partitionDoneLast = (items: TaskItem[]) =>
  [...items].sort(
    (a, b) => Number(a.status === 'done') - Number(b.status === 'done')
  );

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
      {partitionDoneLast(items).map((task) => {
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

export default function TaskSidebar({
  isOpen,
  onClose,
  tasks,
  weeklyPlans = [],
  monthlyPlans = [],
  onSelectTask,
  onToggleTask,
  selectedTaskId,
}: TaskSidebarProps) {
  if (!isOpen) return null;

  const selectAndClose = (task: TaskItem | null) => {
    onSelectTask(task);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 z-50 h-full w-80 bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:bg-gray-900">
        <div className="flex h-full flex-col p-6">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              Task list
            </h2>
            <button
              onClick={onClose}
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

          <div className="flex-1 space-y-6 overflow-y-auto">
            <button
              onClick={() => selectAndClose(null)}
              className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-all ${
                selectedTaskId === null
                  ? 'bg-gray-100 text-gray-900 ring-2 ring-gray-200 dark:bg-gray-800 dark:text-white dark:ring-gray-700'
                  : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              Start without a task
            </button>

            <TaskSection
              title="Today"
              items={tasks}
              color="rose"
              selectedTaskId={selectedTaskId}
              onSelectTask={selectAndClose}
              onToggleTask={onToggleTask}
            />
            <TaskSection
              title="This week"
              items={weeklyPlans}
              color="indigo"
              selectedTaskId={selectedTaskId}
              onSelectTask={selectAndClose}
              onToggleTask={onToggleTask}
            />
            <TaskSection
              title="This month"
              items={monthlyPlans}
              color="purple"
              selectedTaskId={selectedTaskId}
              onSelectTask={selectAndClose}
              onToggleTask={onToggleTask}
            />
          </div>
        </div>
      </div>
    </>
  );
}
