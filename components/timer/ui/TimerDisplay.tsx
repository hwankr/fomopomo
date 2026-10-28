import type { Ref } from 'react';
import { RotateCcw } from 'lucide-react';
import type { BeadState } from '@/components/ui/Beads';
import { cn } from '@/lib/utils';
import type { TimerMode } from '../hooks/useTimerLogic';
import { TaskPickerTrigger } from './TaskPickerTrigger';
import { TimerDigits } from './TimerDigits';
import {
  StageActions,
  StageBeads,
  StageChipButton,
  StageIconButton,
  StageSettingsButton,
  StageStatus,
} from './stageParts';
import { formatSpokenTime, getCurrentCycle, getModeTone, TONE_FILL, type EndedPhase } from './timerDisplayUtils';

interface TimerDisplayProps {
  timerMode: TimerMode;
  timeLeft: number;
  /** 지금 단계의 전체 길이(초). 구슬 수와 진행을 정한다. */
  timerDuration: number;
  isRunning: boolean;
  isSaving: boolean;
  /** 집중을 끝낸 횟수(누적). 화면에는 지금 사이클로 바꿔 보여 준다. */
  cycleCount: number;
  longBreakInterval: number;
  /**
   * 방금 끝난 단계. 있으면 그 단계를 끝난 모습(00:00, 다 찬 구슬, 그 모드 색)으로 그리고
   * "집중 끝/휴식 끝" 안내 띠를 보여 준다. timerMode·timerDuration은 준비된 다음 단계다.
   */
  ended?: EndedPhase | null;
  onEndedPrimary?: () => void;
  onEndedSecondary?: () => void;
  showSaveButton: boolean;
  showResetButton: boolean;
  onToggleTimer: () => void;
  onResetTimer: () => void;
  onSaveTimer: () => void;
  onOpenSettings?: () => void;

  // Task UI Props
  selectedTaskId: string | null;
  selectedTaskTitle: string;
  selectedTaskSubject?: string | null;
  isTaskPickerOpen?: boolean;
  onToggleTaskPicker: () => void;
  taskTriggerRef?: Ref<HTMLButtonElement>;
  onCompleteTask?: () => void;
  canCompleteTask?: boolean;
  isCompletingTask?: boolean;
  isChoosingNextTask?: boolean;
}

const getStatus = (timerMode: TimerMode, isRunning: boolean, isPaused: boolean, ended: EndedPhase | null) => {
  if (ended) return ended.mode === 'focus' ? '집중 끝' : '휴식 끝';
  if (isRunning) return timerMode === 'focus' ? '집중 중' : '휴식 중';
  if (isPaused) return '일시정지';
  return timerMode === 'focus' ? '집중할 준비' : '쉴 준비';
};

// 집중이 끝나면 타이머는 이미 다음 휴식으로 넘어가 있다(timerMode·timerDuration이 다음 단계).
const getEndedMessage = (endedMode: TimerMode, timerMode: TimerMode, timerDuration: number) => {
  if (endedMode !== 'focus') return '휴식이 끝났어요. 다시 집중해 볼까요?';
  const minutes = Math.round(timerDuration / 60);
  return timerMode === 'longBreak'
    ? `집중 시간이 끝났어요. 사이클을 다 채웠으니 ${minutes}분 길게 쉬어요.`
    : `집중 시간이 끝났어요. ${minutes}분 쉬어 가요.`;
};

export const TimerDisplay = ({
  timerMode,
  timeLeft,
  timerDuration,
  isRunning,
  isSaving,
  cycleCount,
  longBreakInterval,
  ended = null,
  onEndedPrimary,
  onEndedSecondary,
  showSaveButton,
  showResetButton,
  onToggleTimer,
  onResetTimer,
  onSaveTimer,
  onOpenSettings,
  selectedTaskId,
  selectedTaskTitle,
  selectedTaskSubject = null,
  isTaskPickerOpen = false,
  onToggleTaskPicker,
  taskTriggerRef,
  onCompleteTask,
  canCompleteTask = false,
  isCompletingTask = false,
  isChoosingNextTask = false,
}: TimerDisplayProps) => {
  // 끝난 동안은 끝난 단계를, 아니면 지금 단계를 그린다.
  const shownMode = ended ? ended.mode : timerMode;
  const shownDuration = ended ? ended.duration : timerDuration;
  const shownTimeLeft = ended ? 0 : timeLeft;
  const tone = getModeTone(shownMode);
  const isPaused = !isRunning && !ended && timeLeft < timerDuration;
  const status = getStatus(timerMode, isRunning, isPaused, ended);
  const cycle = getCurrentCycle(shownMode, ended ? ended.cycleCount : cycleCount, longBreakInterval);

  const totalBeads = Math.max(1, Math.round(shownDuration / 60));
  const usedBeads = Math.min(totalBeads, Math.max(0, Math.floor((shownDuration - shownTimeLeft) / 60)));
  const beadStates: BeadState[] = Array.from({ length: totalBeads }, (_, index) =>
    index < usedBeads ? 'done' : index === usedBeads && isRunning && timeLeft > 0 ? 'current' : 'empty');

  // 집중 진행이 있을 때(완료할 수 있거나 처리 중일 때)만 보인다. 쉬는 화면은 보드처럼 단순하게 둔다.
  const showCompleteTask = timerMode === 'focus' && Boolean(selectedTaskId) && Boolean(onCompleteTask) &&
    !isChoosingNextTask && (canCompleteTask || isCompletingTask);

  return (
    <div className="flex w-full flex-col items-center md:gap-6">
      <StageStatus status={status} detail={`사이클 ${cycle} / ${longBreakInterval}`} />

      <TimerDigits
        seconds={shownTimeLeft}
        label={`남은 시간 ${formatSpokenTime(shownTimeLeft)}`}
        runningTone={isRunning ? tone : null}
      />

      <StageBeads label={`${totalBeads}분 중 ${usedBeads}분 지남`} states={beadStates} tone={tone} />

      <div className="mt-3.5 flex max-w-full flex-col items-center gap-1 md:mt-0">
        <TaskPickerTrigger
          ref={taskTriggerRef}
          title={selectedTaskId || isChoosingNextTask ? selectedTaskTitle : null}
          subject={selectedTaskSubject}
          open={isTaskPickerOpen}
          onClick={onToggleTaskPicker}
        />
        {isChoosingNextTask && (
          <p role="status" className="m-0 text-[13px] text-ink-muted">
            다음 작업을 고르면 남은 시간부터 이어서 시작해요.
          </p>
        )}
      </div>

      {ended && (
        <div className="mt-[18px] flex w-full flex-col gap-2.5 rounded-cta bg-white/75 px-4 py-3.5 md:mt-0 md:max-w-[620px] md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-3.5 md:py-3 md:pr-4 md:pl-5">
          <p className="m-0 text-sm font-medium md:flex-[1_1_240px] md:text-[15px]">
            {getEndedMessage(ended.mode, timerMode, timerDuration)}
          </p>
          <div className="flex gap-2 md:contents">
            <button
              type="button"
              onClick={onEndedPrimary}
              className={cn('ui-button-primary ui-press flex-1 md:flex-none md:px-[18px]', TONE_FILL[tone])}
            >
              {ended.mode === 'focus' ? '휴식 시작' : '집중 시작'}
            </button>
            <button
              type="button"
              onClick={onEndedSecondary}
              className="ui-button-secondary ui-press flex-1 bg-white/75 md:flex-none md:px-3.5"
            >
              {ended.mode === 'focus' ? '계속 집중' : '조금 더 쉬기'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 md:mt-1">
        <button
          type="button"
          onClick={onToggleTimer}
          disabled={isCompletingTask}
          className={cn(
            'ui-button-primary ui-press min-h-[54px] min-w-[168px] rounded-cta px-9 text-base transition-[filter,background-color] duration-300 md:min-h-14 md:min-w-[200px] md:text-[17px]',
            TONE_FILL[tone],
          )}
        >
          {isChoosingNextTask ? '다음 작업 선택' : isRunning ? '일시정지' : '시작'}
        </button>

        {showResetButton && (
          <StageIconButton onClick={onResetTimer} aria-label="타이머 초기화">
            <RotateCcw aria-hidden="true" size={20} strokeWidth={2} />
          </StageIconButton>
        )}

        {onOpenSettings && <StageSettingsButton onClick={onOpenSettings} />}
      </div>

      {(showSaveButton || showCompleteTask) && (
        <StageActions>
          {showSaveButton && (
            <StageChipButton onClick={onSaveTimer} disabled={isSaving}>
              기록 저장
            </StageChipButton>
          )}
          {showCompleteTask && (
            <StageChipButton onClick={onCompleteTask} disabled={!canCompleteTask || isCompletingTask}>
              {isCompletingTask ? '작업 완료 처리 중…' : '작업 완료 · 다음 작업'}
            </StageChipButton>
          )}
        </StageActions>
      )}
    </div>
  );
};
