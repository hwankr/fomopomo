import type { Ref } from 'react';
import type { BeadState } from '@/components/ui/Beads';
import { TaskPickerTrigger } from './TaskPickerTrigger';
import { TimerDigits } from './TimerDigits';
import {
  StageActions,
  StageBeads,
  StageChipButton,
  StageControls,
  StageResetButton,
  StageSettingsButton,
  StageStatus,
} from './stageParts';
import { formatSpokenTime } from './timerDisplayUtils';

// 스톱워치 구슬: 지난 분 + 지금 1알, 최대 60알.
const MAX_STOPWATCH_BEADS = 60;

interface StopwatchDisplayProps {
  stopwatchTime: number;
  isStopwatchRunning: boolean;
  isSaving: boolean;
  onToggleStopwatch: () => void;
  onSaveStopwatch: () => void;
  onResetStopwatch: () => void;
  onOpenSettings?: () => void;

  // Task UI Props
  selectedTaskId: string | null;
  selectedTaskTitle: string;
  selectedTaskSubject?: string | null;
  isTaskPickerOpen?: boolean;
  /** 작업 선택기 내용의 id(여는 버튼의 aria-controls) */
  taskPickerId?: string;
  onToggleTaskPicker: () => void;
  taskTriggerRef?: Ref<HTMLButtonElement>;
}

export const StopwatchDisplay = ({
  stopwatchTime,
  isStopwatchRunning,
  isSaving,
  onToggleStopwatch,
  onSaveStopwatch,
  onResetStopwatch,
  onOpenSettings,
  selectedTaskId,
  selectedTaskTitle,
  selectedTaskSubject = null,
  isTaskPickerOpen = false,
  taskPickerId,
  onToggleTaskPicker,
  taskTriggerRef,
}: StopwatchDisplayProps) => {
  const hasProgress = stopwatchTime > 0;
  const status = isStopwatchRunning ? '재는 중' : hasProgress ? '일시정지' : '스톱워치';

  const minutes = Math.floor(stopwatchTime / 60);
  const beadStates: BeadState[] = Array.from({ length: Math.min(minutes, MAX_STOPWATCH_BEADS) }, () => 'done');
  if (minutes < MAX_STOPWATCH_BEADS) beadStates.push(isStopwatchRunning ? 'current' : 'empty');

  return (
    <div className="flex w-full flex-col items-center md:gap-6">
      <StageStatus status={status} detail="시간을 재요" />

      <TimerDigits
        seconds={stopwatchTime}
        label={`경과 ${formatSpokenTime(stopwatchTime)}`}
        runningTone={isStopwatchRunning ? 'watch' : null}
      />

      <StageBeads label={`${minutes}분 경과`} states={beadStates} tone="watch" />

      <div className="mt-3.5 flex max-w-full justify-center md:mt-0">
        <TaskPickerTrigger
          ref={taskTriggerRef}
          title={selectedTaskId ? selectedTaskTitle : null}
          subject={selectedTaskSubject}
          open={isTaskPickerOpen}
          controls={taskPickerId}
          onClick={onToggleTaskPicker}
        />
      </div>

      <StageControls
        reset={!isStopwatchRunning && hasProgress && <StageResetButton label="스톱워치 초기화" onClick={onResetStopwatch} />}
        settings={onOpenSettings && <StageSettingsButton onClick={onOpenSettings} />}
      >
        <button
          type="button"
          onClick={onToggleStopwatch}
          className="ui-button-primary ui-press min-h-[54px] min-w-[168px] rounded-cta bg-watch px-9 text-base md:min-h-14 md:min-w-[200px] md:text-[17px]"
        >
          {isStopwatchRunning ? '일시정지' : hasProgress ? '재개' : '시작'}
        </button>
      </StageControls>

      <StageActions>
        {!isStopwatchRunning && hasProgress && (
          <StageChipButton onClick={onSaveStopwatch} disabled={isSaving}>
            기록 저장
          </StageChipButton>
        )}
      </StageActions>
    </div>
  );
};
