'use client';

import { useEffect, useState } from 'react';

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
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-900 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        <div className="p-6 h-full flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              Tasks
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-6 h-6 text-gray-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6">
            {/* No Task Option */}
            <button
              onClick={() => {
                onSelectTask(null);
                onClose();
              }}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${selectedTaskId === null
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white ring-2 ring-gray-200 dark:ring-gray-700'
                : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
            >
              작업 지정 없이 시작
            </button>

            {/* Daily Tasks */}
            {tasks.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Today's Tasks
                </h3>
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => {
                      onSelectTask(task);
                      onClose();
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${selectedTaskId === task.id
                      ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800/50 border border-transparent'
                      }`}
                  >
                    {task.title}
                  </button>
                ))}
              </div>
            )}

            {/* Weekly Plans */}
            {weeklyPlans && weeklyPlans.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Weekly Goals
                </h3>
                {weeklyPlans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => {
                      onSelectTask(plan);
                      onClose();
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${selectedTaskId === plan.id
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800/50 border border-transparent'
                      }`}
                  >
                    {plan.title}
                  </button>
                ))}
              </div>
            )}

            {/* Monthly Plans */}
            {monthlyPlans && monthlyPlans.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Monthly Goals
                </h3>
                {monthlyPlans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => {
                      onSelectTask(plan);
                      onClose();
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${selectedTaskId === plan.id
                      ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800/50 border border-transparent'
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
