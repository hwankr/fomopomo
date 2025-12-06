import { useState, useCallback } from 'react';
import { TaskItem } from '../hooks/useTasks';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbTasks: TaskItem[];
  selectedTask: string;
  selectedTaskId: string | null;
  onSelectTask: (task: string, id: string | null) => void; // task title, id
  onSave: () => void;
  onSkip: () => void;
  onDisablePopup: () => void;
}

export const TaskModal = ({
  isOpen,
  dbTasks,
  selectedTask,
  selectedTaskId,
  onSelectTask,
  onSave,
  onSkip,
  onDisablePopup,
}: TaskModalProps) => {
  const [manualInput, setManualInput] = useState(selectedTask);

  // Sync internal state if prop updates (optional, or rely on parent)
  // Here we use parent state mainly via onSelectTask
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden scale-100 transition-transform duration-200">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
            무엇에 집중하셨나요?
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            목록에서 작업을 선택하거나 직접 입력하세요.
          </p>

          <div className="space-y-4">
            {dbTasks.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">오늘의 할 일</p>
                <div className="grid gap-2 max-h-40 overflow-y-auto">
                  {dbTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => {
                        onSelectTask(task.title, task.id);
                        setManualInput(task.title);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${selectedTaskId === task.id
                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                        : 'bg-gray-50 dark:bg-slate-700/50 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
                        }`}
                    >
                      {task.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                직접 입력
              </label>
              <input
                type="text"
                value={manualInput}
                onChange={(e) => {
                  setManualInput(e.target.value);
                  onSelectTask(e.target.value, null); // Clear ID
                }}
                placeholder="예: 독서, 코딩..."
                className="w-full bg-gray-50 dark:bg-slate-900 border-2 border-gray-100 dark:border-slate-700 rounded-xl px-4 py-3 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:border-rose-500 dark:focus:border-rose-500 transition-colors"
                autoFocus
              />
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={onSkip}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700 transition-colors"
            >
              건너뛰기
            </button>
            <button
              onClick={onSave}
              disabled={!manualInput.trim()}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rose-500/30 transition-all"
            >
              저장
            </button>
          </div>

          <button
            onClick={onDisablePopup}
            className="w-full mt-4 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline decoration-gray-300 underline-offset-2 transition-colors"
          >
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
};
