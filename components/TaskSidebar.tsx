'use client';

interface Task {
  id: string;
  title: string;
}

interface TaskSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  weeklyPlans?: Task[];
  monthlyPlans?: Task[];
  onSelectTask: (task: Task | null) => void;
  selectedTaskId: string | null;
}

export default function TaskSidebar({
  isOpen,
  onClose,
  tasks,
  weeklyPlans = [],
  monthlyPlans = [],
  onSelectTask,
  selectedTaskId,
}: TaskSidebarProps) {
  if (!isOpen) return null;

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
              onClick={() => {
                onSelectTask(null);
                onClose();
              }}
              className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-all ${
                selectedTaskId === null
                  ? 'bg-gray-100 text-gray-900 ring-2 ring-gray-200 dark:bg-gray-800 dark:text-white dark:ring-gray-700'
                  : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              Start without a task
            </button>

            {tasks.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                  Today
                </h3>
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => {
                      onSelectTask(task);
                      onClose();
                    }}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                      selectedTaskId === task.id
                        ? 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-400'
                        : 'border-transparent text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {task.title}
                  </button>
                ))}
              </div>
            )}

            {weeklyPlans.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                  This week
                </h3>
                {weeklyPlans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => {
                      onSelectTask(plan);
                      onClose();
                    }}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                      selectedTaskId === plan.id
                        ? 'border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-900/50 dark:bg-indigo-900/20 dark:text-indigo-400'
                        : 'border-transparent text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {plan.title}
                  </button>
                ))}
              </div>
            )}

            {monthlyPlans.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                  This month
                </h3>
                {monthlyPlans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => {
                      onSelectTask(plan);
                      onClose();
                    }}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                      selectedTaskId === plan.id
                        ? 'border-purple-100 bg-purple-50 text-purple-600 dark:border-purple-900/50 dark:bg-purple-900/20 dark:text-purple-400'
                        : 'border-transparent text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {plan.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
