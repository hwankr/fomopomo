'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Calendar, ChevronLeft, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getAdminStatus } from '@/lib/admin';
import { Profile, StudySession } from '@/lib/types';
import AdminGuard from '@/components/admin/AdminGuard';
import Avatar from '@/components/ui/Avatar';

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}시간 ${minutes}분`;
}

function getStatusLabel(status: Profile['status']) {
  if (status === 'studying') return '공부 중';
  if (status === 'online') return '온라인';
  if (status === 'paused') return '일시정지';
  return '오프라인';
}

const RECENT_SESSION_LIMIT = 20;

export default function UserDetailPage({ params }: PageProps) {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [summary, setSummary] = useState({ totalStudyTime: 0, sessionCount: 0 });
  const [loading, setLoading] = useState(true);

  const resolvedParams = use(params);
  const userId = resolvedParams.id;

  const fetchUserDetail = useCallback(async () => {
    try {
      const [profileResult, sessionsResult, summaryResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase
          .from('study_sessions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(RECENT_SESSION_LIMIT),
        supabase
          .rpc('get_admin_user_study_summary', { p_user_id: userId })
          .single(),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (sessionsResult.error) throw sessionsResult.error;
      if (summaryResult.error) throw summaryResult.error;

      const studySummary = summaryResult.data as {
        total_study_time: number;
        session_count: number;
      };

      setUser(profileResult.data as Profile);
      setSessions(sessionsResult.data as StudySession[]);
      setSummary({
        totalStudyTime: studySummary.total_study_time,
        sessionCount: studySummary.session_count,
      });
    } catch (error) {
      console.error('Error fetching user detail:', error);
      toast.error('사용자 상세 정보를 불러오지 못했습니다.');
      router.replace('/admin');
    } finally {
      setLoading(false);
    }
  }, [router, userId]);

  useEffect(() => {
    let isActive = true;

    const initialize = async () => {
      const { isAdmin } = await getAdminStatus();

      if (!isActive) return;

      if (!isAdmin) {
        setLoading(false);
        router.replace('/');
        return;
      }

      await fetchUserDetail();
    };

    void initialize();

    return () => {
      isActive = false;
    };
  }, [fetchUserDetail, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-pomo"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AdminGuard>
      <div className="min-h-screen px-4 py-6 md:px-10 md:py-12">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() => router.back()}
            className="ui-button-ghost -ml-3 mb-6 min-h-10 gap-1.5 text-ink-muted"
          >
            <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2.2} />
            뒤로
          </button>

          <div className="mb-12 flex items-center gap-5">
            <Avatar name={user.nickname || user.email} size={64} />
            <div>
              <h1 className="ui-h1 mb-1">
                {user.nickname || '닉네임 없음'}
              </h1>
              <p className="text-ink-muted">{user.email}</p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold">
                  {getStatusLabel(user.status)}
                </span>
                <span className="rounded-full bg-pomo-tint px-3 py-1 text-xs font-semibold text-pomo-deep">
                  {user.role === 'admin' ? '관리자' : '사용자'}
                </span>
              </div>
            </div>
          </div>

          {/* 카드 없이 흰 바탕 위 숫자로만 나눈다. */}
          <div className="mb-12 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-3">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-pomo-tint text-pomo">
                  <Clock aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
                </div>
                <span className="text-sm text-ink-muted">
                  총 공부 시간
                </span>
              </div>
              <p className="text-2xl font-extrabold tracking-[-0.02em]">
                {formatTime(summary.totalStudyTime)}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-watch-tint text-watch">
                  <BookOpen aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
                </div>
                <span className="text-sm text-ink-muted">
                  세션 수
                </span>
              </div>
              <p className="text-2xl font-extrabold tracking-[-0.02em]">
                {summary.sessionCount.toLocaleString()}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-surface text-ink-muted">
                  <Calendar aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
                </div>
                <span className="text-sm text-ink-muted">
                  가입일
                </span>
              </div>
              <p className="text-lg font-extrabold">
                {user.created_at
                  ? new Date(user.created_at).toLocaleDateString()
                  : '-'}
              </p>
            </div>
          </div>

          <div>
            <h2 className="ui-h2 mb-4">
              최근 세션
            </h2>
            <div className="-mx-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[13px] text-ink-muted">
                  <tr>
                    <th className="px-3 py-3 font-semibold">날짜</th>
                    <th className="px-3 py-3 font-semibold">작업</th>
                    <th className="px-3 py-3 font-semibold">모드</th>
                    <th className="px-3 py-3 font-semibold">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr
                      key={session.id}
                      className="transition-colors hover:bg-hover"
                    >
                      <td className="rounded-l-tile px-3 py-3 text-ink-muted">
                        {new Date(session.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {session.task || '-'}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            session.mode === 'focus'
                              ? 'bg-pomo-tint text-pomo-deep'
                              : 'bg-rest-tint text-rest-deep'
                          }`}
                        >
                          {session.mode === 'focus' ? '집중' : '휴식'}
                        </span>
                      </td>
                      <td className="rounded-r-tile px-3 py-3 text-ink-muted">
                        {formatTime(session.duration)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
