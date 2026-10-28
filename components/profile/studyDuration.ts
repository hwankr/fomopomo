// 프로필의 집중 시간 표기. 본문은 "2시간 30분", 막대 위 값처럼 좁은 자리는 "2h 30m".

export function formatStudyDuration(seconds: number) {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}분`;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

export function formatShortDuration(seconds: number) {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  if (!totalMinutes) return '';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

// 좁은 막대 위(모바일 연간): 1시간 이상은 반올림한 시간("70h"), 그보다 적으면 분("45m")
export function formatRoundedHours(seconds: number) {
  const hours = Math.round(Math.max(0, seconds) / 3600);
  return hours ? `${hours}h` : formatShortDuration(seconds);
}

// 누적 시간처럼 큰 수는 시간 단위만, 1시간이 안 되면 분으로 보여 준다.
export function formatTotalHours(seconds: number) {
  const hours = Math.floor(Math.max(0, seconds) / 3600);
  return hours ? `${hours}시간` : formatStudyDuration(seconds);
}
