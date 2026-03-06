'use client';

import { useEffect, useState } from 'react';
import { Profile } from '@/lib/types';
import { Search, Shield } from 'lucide-react';

interface UserTableProps {
  users: Profile[];
  onUserClick: (userId: string) => void;
}

type SortOption = 'recentAccess' | 'joined';

function StudyDuration({ startTime }: { startTime: string }) {
  const [duration, setDuration] = useState('');

  useEffect(() => {
    const update = () => {
      const start = new Date(startTime).getTime();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);

      if (diff < 0) {
        setDuration('00:00');
        return;
      }

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      setDuration(
        `${hours > 0 ? `${hours}:` : ''}${minutes
          .toString()
          .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span>{duration}</span>;
}

function getStatusLabel(user: Profile) {
  if (user.status === 'studying') return 'Studying';
  if (user.status === 'online') return 'Online';
  if (user.status === 'paused') return 'Paused';
  return 'Offline';
}

function getTimestamp(value?: string | null) {
  if (!value) return 0;

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString();
}

export default function UserTable({ users, onUserClick }: UserTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recentAccess');

  const filteredUsers = users.filter((user) => {
    const normalizedSearch = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(normalizedSearch) ||
      user.nickname?.toLowerCase().includes(normalizedSearch)
    );
  });

  const sortedUsers = [...filteredUsers].sort((left, right) => {
    if (sortBy === 'recentAccess') {
      const accessDiff =
        getTimestamp(right.last_active_at) - getTimestamp(left.last_active_at);

      if (accessDiff !== 0) return accessDiff;
    }

    return getTimestamp(right.created_at) - getTimestamp(left.created_at);
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col justify-between gap-4 border-b border-gray-100 p-4 dark:border-gray-700 sm:flex-row sm:items-center">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Users ({filteredUsers.length})
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Sort</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-200"
            >
              <option value="recentAccess">Recent access</option>
              <option value="joined">Recently joined</option>
            </select>
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email or nickname"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700/50 sm:w-72"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
            <tr>
              <th className="px-6 py-3 font-medium">User</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Current task</th>
              <th className="px-6 py-3 font-medium">Last active</th>
              <th className="px-6 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sortedUsers.map((user) => (
              <tr
                key={user.id}
                onClick={() => onUserClick(user.id)}
                className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {(user.nickname || user.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
                        {user.nickname || 'No nickname'}
                        {user.role === 'admin' && (
                          <Shield className="h-3 w-3 fill-current text-indigo-500" />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {user.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.status === 'online'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : user.status === 'studying'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                          : user.status === 'paused'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {getStatusLabel(user)}
                    {user.status === 'studying' && user.study_start_time && (
                      <>
                        <span className="mx-1">-</span>
                        <StudyDuration startTime={user.study_start_time} />
                      </>
                    )}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                  {user.current_task || '-'}
                </td>
                <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                  {formatDateTime(user.last_active_at)}
                </td>
                <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                  {user.created_at
                    ? new Date(user.created_at).toLocaleDateString()
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
