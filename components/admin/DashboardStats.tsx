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
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: '오늘 활동 사용자',
      value: activeUsersToday.toLocaleString(),
      icon: Activity,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: '총 공부 시간',
      value: formatTime(totalStudyTime),
      icon: Clock,
      color: 'text-rose-600',
      bg: 'bg-rose-50 dark:bg-rose-900/20',
    },
    {
      label: '오늘 신규 가입',
      value: newUsersToday.toLocaleString(),
      icon: Calendar,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {stat.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {stat.value}
              </p>
            </div>
            <div className={`rounded-xl p-3 ${stat.bg} ${stat.color}`}>
              <stat.icon className="h-6 w-6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
