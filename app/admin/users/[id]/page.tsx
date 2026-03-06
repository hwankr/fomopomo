'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Calendar, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getAdminStatus } from '@/lib/admin';
import { Profile, StudySession } from '@/lib/types';
import AdminGuard from '@/components/admin/AdminGuard';

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function getStatusLabel(status: Profile['status']) {
  if (status === 'studying') return 'Studying';
  if (status === 'online') return 'Online';
  if (status === 'paused') return 'Paused';
  return 'Offline';
}

export default function UserDetailPage({ params }: PageProps) {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);

  const resolvedParams = use(params);
  const userId = resolvedParams.id;

  const fetchUserDetail = useCallback(async () => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

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
      toast.error('Failed to load user detail.');
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) return null;

  const totalStudyTime = sessions.reduce(
    (accumulator, session) => accumulator + session.duration,
    0
  );

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900 md:p-12">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() => router.back()}
            className="mb-6 flex items-center gap-2 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100 text-3xl font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                {(user.nickname || user.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
                  {user.nickname || 'No nickname'}
                </h1>
                <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
                <div className="mt-3 flex gap-2">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    {getStatusLabel(user.status)}
                  </span>
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {user.role === 'admin' ? 'Admin' : 'User'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-2 flex items-center gap-3">
                <div className="rounded-lg bg-rose-50 p-2 text-rose-600 dark:bg-rose-900/20">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-gray-500">
                  Total study time
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatTime(totalStudyTime)}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-2 flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/20">
                  <BookOpen className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-gray-500">
                  Sessions
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {sessions.length}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-2 flex items-center gap-3">
                <div className="rounded-lg bg-purple-50 p-2 text-purple-600 dark:bg-purple-900/20">
                  <Calendar className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-gray-500">
                  Joined
                </span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {user.created_at
                  ? new Date(user.created_at).toLocaleDateString()
                  : '-'}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-100 p-6 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Recent sessions
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Task</th>
                    <th className="px-6 py-3 font-medium">Mode</th>
                    <th className="px-6 py-3 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {sessions.slice(0, 20).map((session) => (
                    <tr
                      key={session.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(session.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                        {session.task || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${
                            session.mode === 'focus'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          }`}
                        >
                          {session.mode === 'focus' ? 'Focus' : 'Break'}
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
