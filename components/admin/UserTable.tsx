'use client';

import { useEffect, useState } from 'react';
import { Profile } from '@/lib/types';
import { Search, Shield } from 'lucide-react';
import AppSelect from '@/components/ui/AppSelect';
import Avatar from '@/components/ui/Avatar';

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

// 친구 화면과 같은 상태 점 색
const STATUS_DOT_CLASS: Record<NonNullable<Profile['status']>, string> = {
  studying: 'bg-pomo',
  online: 'bg-rest',
  paused: 'bg-away',
  offline: 'bg-bead-past',
};

function getStatusLabel(user: Profile) {
  if (user.status === 'studying') return '공부 중';
  if (user.status === 'online') return '온라인';
  if (user.status === 'paused') return '일시정지';
  return '오프라인';
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
    <div>
      <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h2 className="ui-h2">
          사용자 ({filteredUsers.length})
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span id="user-sort-label">정렬</span>
            <AppSelect
              aria-label="정렬"
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortOption)}
              options={[{ value: 'recentAccess', label: '최근 접속' }, { value: 'joined', label: '최근 가입' }]}
              className="flex-1 sm:w-32"
            />
          </div>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              aria-label="사용자 검색"
              placeholder="이메일 또는 닉네임으로 검색"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="ui-input w-full pl-10 sm:w-72"
            />
          </div>
        </div>
      </div>

      {/* 카드·구분선 없이 행 호버로만 구분한다. */}
      <div className="-mx-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[13px] text-ink-muted">
            <tr>
              <th className="px-3 py-3 font-semibold">사용자</th>
              <th className="px-3 py-3 font-semibold">상태</th>
              <th className="px-3 py-3 font-semibold">현재 작업</th>
              <th className="px-3 py-3 font-semibold">최근 활동</th>
              <th className="px-3 py-3 font-semibold">가입일</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr
                key={user.id}
                onClick={() => onUserClick(user.id)}
                className="cursor-pointer transition-colors hover:bg-hover"
              >
                <td className="rounded-l-tile px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={user.nickname || user.email} />
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold">
                        {user.nickname || '닉네임 없음'}
                        {user.role === 'admin' && (
                          <Shield role="img" aria-label="관리자" className="size-3 fill-current text-pomo" />
                        )}
                      </div>
                      <div className="text-xs text-ink-subtle">
                        {user.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-muted">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[user.status ?? 'offline']}`} />
                    {getStatusLabel(user)}
                    {user.status === 'studying' && user.study_start_time && (
                      <>
                        <span>-</span>
                        <StudyDuration startTime={user.study_start_time} />
                      </>
                    )}
                  </span>
                </td>
                <td className="px-3 py-3 text-ink-muted">
                  {user.current_task || '-'}
                </td>
                <td className="px-3 py-3 text-ink-muted">
                  {formatDateTime(user.last_active_at)}
                </td>
                <td className="rounded-r-tile px-3 py-3 text-ink-muted">
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
