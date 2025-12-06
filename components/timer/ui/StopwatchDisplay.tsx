// Helper to format time
const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

interface StopwatchDisplayProps {
  stopwatchTime: number;
  isStopwatchRunning: boolean;
  isSaving: boolean;
  onToggleStopwatch: () => void;
  onSaveStopwatch: () => void;
  onResetStopwatch: () => void;

  // Task UI Props
  selectedTaskId: string | null;
  selectedTaskTitle: string;
  onOpenTaskSidebar: () => void;
  onClearTask: (e: React.MouseEvent) => void;
}

export const StopwatchDisplay = ({
  stopwatchTime,
  isStopwatchRunning,
  isSaving,
  onToggleStopwatch,
  onSaveStopwatch,
  onResetStopwatch,
  selectedTaskId,
  selectedTaskTitle,
  onOpenTaskSidebar,
  onClearTask,
}: StopwatchDisplayProps) => {

  return (
    <div className="text-center animate-fade-in w-full">
      <div className="mb-6 text-sm font-bold text-indigo-400 uppercase tracking-widest">
        스톱워치
      </div>

      {/* Selected Task Display */}
      <div className="w-full max-w-xs mx-auto relative z-20 flex justify-center transition-all duration-300 mb-6 min-h-[24px]">
        <div
          onClick={onOpenTaskSidebar}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 animate-fade-in cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
        >
          <span className="text-sm font-medium max-w-[200px] truncate">
            {selectedTaskId ? selectedTaskTitle : '작업 지정 없음'}
          </span>
          {selectedTaskId && (
            <button
              onClick={onClearTask}
              className="p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="text-7xl sm:text-8xl font-bold mb-10 font-mono tracking-tighter text-indigo-500 dark:text-indigo-400">
        {formatTime(stopwatchTime)}
      </div>

      <div className="flex gap-4 justify-center items-center">
        <button
          onClick={onToggleStopwatch}
          className="px-10 py-4 rounded-2xl font-bold text-lg text-white bg-indigo-500 hover:bg-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 min-w-[140px]"
        >
          {isStopwatchRunning ? '일시정지' : '시작'}
        </button>

        {!isStopwatchRunning && stopwatchTime > 0 && (
          <>
            <button
              onClick={onSaveStopwatch}
              disabled={isSaving}
              className="px-5 py-4 rounded-2xl font-bold text-white bg-gray-800 hover:bg-black transition-all shadow-sm whitespace-nowrap"
            >
              저장
            </button>
            <button
              onClick={onResetStopwatch}
              className="p-4 rounded-2xl bg-white dark:bg-slate-700 text-gray-400 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 transition-all shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
