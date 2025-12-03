'use client';

import { useState } from 'react';
import { Profile } from '@/lib/types';
import { Search, MoreVertical, Shield } from 'lucide-react';

interface UserTableProps {
  users: Profile[];
  onUserClick: (userId: string) => void;
}

export default function UserTable({ users, onUserClick }: UserTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = users.filter(
    (user) =>
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.nickname?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          사용자 목록 ({filteredUsers.length})
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="이메일 또는 닉네임 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border rounded-xl w-full sm:w-64 bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-6 py-3 font-medium">사용자</th>
              <th className="px-6 py-3 font-medium">상태</th>
              <th className="px-6 py-3 font-medium">현재 작업</th>
              <th className="px-6 py-3 font-medium">가입일</th>
              <th className="px-6 py-3 font-medium text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredUsers.map((user) => (
              <tr
                key={user.id}
                onClick={() => onUserClick(user.id)}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                      {(user.nickname || user.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                        {user.nickname || '닉네임 없음'}
                        {user.role === 'admin' && (
                          <Shield className="w-3 h-3 text-indigo-500" fill="currentColor" />
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
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.status === 'online'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : user.status === 'studying'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {user.status === 'online'
                      ? '온라인'
                      : user.status === 'studying'
                      ? '공부 중'
                      : '오프라인'}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                  {user.current_task || '-'}
                </td>
                <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                  {user.created_at
                    ? new Date(user.created_at).toLocaleDateString()
                    : '-'}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
