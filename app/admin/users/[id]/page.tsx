'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminGuard from '@/components/admin/AdminGuard';
import { Profile, StudySession } from '@/lib/types';
import { ArrowLeft, Clock, Calendar, BookOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function UserDetailPage({ params }: PageProps) {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Unwrap params using use() hook for Next.js 15+
  const resolvedParams = use(params);
  const userId = resolvedParams.id;

  useEffect(() => {
    fetchUserDetail();
  }, [userId]);

  const fetchUserDetail = async () => {
    try {
      // 1. Fetch Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      // 2. Fetch Study Sessions
      const { data: studySessions, error: sessionsError } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      setUser(profile as Profile);
      setSessions(studySessions as StudySession[]);
    } catch (error) {
      console.error('Error fetching user detail:', error);
      toast.error('유저 정보를 불러오는데 실패했습니다.');
      router.push('/admin');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}시간 ${minutes}분`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) return null;

  const totalStudyTime = sessions.reduce((acc, curr) => acc + curr.duration, 0);

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 md:p-12">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            돌아가기
          </button>

          {/* User Header */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700 shadow-sm mb-8">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-3xl">
                {(user.nickname || user.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {user.nickname || '닉네임 없음'}
                </h1>
                <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
                <div className="flex gap-2 mt-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    user.status === 'online' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user.status === 'online' ? '온라인' : '오프라인'}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                    {user.role === 'admin' ? '관리자' : '일반 사용자'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg text-rose-600">
                  <Clock className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-gray-500">총 공부 시간</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatTime(totalStudyTime)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600">
                  <BookOpen className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-gray-500">총 세션 수</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {sessions.length}회
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-purple-600">
                  <Calendar className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-gray-500">가입일</span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {new Date(user.created_at!).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Recent Sessions */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                최근 학습 기록
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">날짜</th>
                    <th className="px-6 py-3 font-medium">작업</th>
                    <th className="px-6 py-3 font-medium">모드</th>
                    <th className="px-6 py-3 font-medium">시간</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {sessions.slice(0, 20).map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(session.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                        {session.task || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${
                          session.mode === 'focus' 
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}>
                          {session.mode === 'focus' ? '집중' : '휴식'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
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
