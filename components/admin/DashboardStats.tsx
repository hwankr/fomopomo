'use client';

import { Users, Clock, Activity, Calendar } from 'lucide-react';

interface DashboardStatsProps {
  totalUsers: number;
  activeUsersToday: number;
  totalStudyTime: number; // in seconds
  newUsersToday: number;
}

export default function DashboardStats({
  totalUsers,
  activeUsersToday,
  totalStudyTime,
  newUsersToday,
}: DashboardStatsProps) {
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}시간 ${minutes}분`;
  };

  const stats = [
    {
      label: '총 사용자',
      value: totalUsers.toLocaleString(),
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: '오늘 활동 유저',
      value: activeUsersToday.toLocaleString(),
      icon: Activity,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: '총 누적 공부 시간',
      value: formatTime(totalStudyTime),
      icon: Clock,
      color: 'text-rose-600',
      bg: 'bg-rose-50 dark:bg-rose-900/20',
    },
    {
      label: '오늘 가입',
      value: newUsersToday.toLocaleString(),
      icon: Calendar,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, index) => (
        <div
          key={index}
          className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {stat.label}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stat.value}
              </p>
            </div>
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
