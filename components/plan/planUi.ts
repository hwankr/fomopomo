export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** "10월 27일 화요일", short면 "10월 27일 화" */
export function formatDayLabel(date: Date, short = false): string {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}${short ? '' : '요일'}`;
}

/** 공부 시간 표기: "1시간 30분", "2시간", "25분". 1분이 안 되면 "1분 미만". */
export function formatStudyTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  if (minutes > 0) return `${minutes}분`;
  return seconds > 0 ? '1분 미만' : '0분';
}

/** "9:05" — 24시를 넘긴 값(다음날 새벽)은 0시부터 다시 센다. */
export function formatClock(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);
  const hour = Math.floor(minutes / 60) % 24;
  return `${hour}:${String(minutes % 60).padStart(2, '0')}`;
}
