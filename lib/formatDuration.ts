// 계획 페이지(TaskList/WeeklyPlan/MonthlyPlan)와 동일한 누적 시간 표기.
// 0초는 표기 자체를 생략하는 것이 기존 계약이라 null을 반환한다.
export const formatDuration = (seconds: number): string | null => {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};
