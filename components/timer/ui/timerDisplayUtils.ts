import type { BeadTone } from '@/components/ui/Beads';
import type { TimerMode } from '../hooks/useTimerLogic';

// 방금 끝난 단계. 타이머는 이미 다음 단계를 준비해 두므로, 끝난 모습(그 모드의 탭,
// 00:00, 다 찬 구슬, 그 모드 색)을 그리기 위한 값만 따로 둔다.
export type EndedPhase = {
  mode: TimerMode;
  /** 끝난 단계의 전체 길이(초) */
  duration: number;
  /** 끝나기 전의 누적 집중 횟수(그 단계가 속한 사이클을 정한다) */
  cycleCount: number;
};

export const getDisplayCycleCount = (
  cycleCount: number,
  longBreakInterval: number
) => {
  if (cycleCount <= 0 || longBreakInterval <= 0) {
    return 0;
  }

  const remainder = cycleCount % longBreakInterval;
  return remainder === 0 ? longBreakInterval : remainder;
};

// 지금 진행 중인 사이클(1부터). 집중이 끝나면 cycleCount가 먼저 오르므로
// 휴식은 방금 끝낸 사이클에, 집중은 그다음 사이클에 속한다.
export const getCurrentCycle = (
  mode: TimerMode,
  cycleCount: number,
  longBreakInterval: number
) => {
  if (longBreakInterval <= 0) return 1;
  if (mode === 'focus') return (Math.max(0, cycleCount) % longBreakInterval) + 1;
  return getDisplayCycleCount(cycleCount, longBreakInterval) || 1;
};

const splitClock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
};

// 큰 숫자 표기: 25:00, 한 시간 넘으면 01:05:00
export const formatClock = (totalSeconds: number) => {
  const { hours, minutes, seconds } = splitClock(totalSeconds);
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${mmss}` : mmss;
};

// 스크린 리더용: "24분 51초", "1시간 5분 0초"
export const formatSpokenTime = (totalSeconds: number) => {
  const { hours, minutes, seconds } = splitClock(totalSeconds);
  return `${hours ? `${hours}시간 ` : ''}${minutes}분 ${seconds}초`;
};

export const getModeTone = (mode: TimerMode): BeadTone => (mode === 'focus' ? 'pomo' : 'rest');

export const TONE_FILL: Record<BeadTone, string> = {
  pomo: 'bg-pomo',
  rest: 'bg-rest',
  watch: 'bg-watch',
};

export const TONE_DEEP_TEXT: Record<BeadTone, string> = {
  pomo: 'text-pomo-deep',
  rest: 'text-rest-deep',
  watch: 'text-watch-deep',
};

export const TONE_TINT_BG: Record<BeadTone, string> = {
  pomo: 'bg-pomo-tint',
  rest: 'bg-rest-tint',
  watch: 'bg-watch-tint',
};
