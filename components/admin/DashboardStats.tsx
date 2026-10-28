'use client';

import { Users, Clock, Activity, Calendar } from 'lucide-react';

interface DashboardStatsProps {
  totalUsers: number;
  activeUsersToday: number;
  totalStudyTime: number;
  newUsersToday: number;
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}시간 ${minutes}분`;
}

export default function DashboardStats({
  totalUsers,
  activeUsersToday,
  totalStudyTime,
  newUsersToday,
}: DashboardStatsProps) {
  const stats = [
    {
      label: '전체 사용자',
      value: totalUsers.toLocaleString(),
      icon: Users,
      color: 'text-watch',
      bg: 'bg-watch-tint',
    },
    {
      label: '오늘 활동 사용자',
      value: activeUsersToday.toLocaleString(),
      icon: Activity,
      color: 'text-rest',
      bg: 'bg-rest-tint',
    },
    {
      label: '총 공부 시간',
      value: formatTime(totalStudyTime),
      icon: Clock,
      color: 'text-pomo',
      bg: 'bg-pomo-tint',
    },
    {
      label: '오늘 신규 가입',
      value: newUsersToday.toLocaleString(),
      icon: Calendar,
      color: 'text-ink-muted',
      bg: 'bg-surface',
    },
  ];

  // 카드 없이 흰 바탕 위 숫자로만 나눈다.
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label}>
          <div className="flex items-center gap-3">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${stat.bg} ${stat.color}`}>
              <stat.icon aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-sm text-ink-muted">
                {stat.label}
              </p>
              <p className="text-2xl font-extrabold tracking-[-0.02em]">
                {stat.value}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
