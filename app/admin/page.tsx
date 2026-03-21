'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getAdminStatus } from '@/lib/admin';
import { Profile } from '@/lib/types';
import AdminGuard from '@/components/admin/AdminGuard';
import DashboardStats from '@/components/admin/DashboardStats';
import UserTable from '@/components/admin/UserTable';

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<Profile[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsersToday: 0,
    totalStudyTime: 0,
    newUsersToday: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: sessions, error: sessionsError } = await supabase
        .from('study_sessions')
        .select('duration, created_at, user_id');

      if (sessionsError) throw sessionsError;

      const totalUsers = profiles?.length || 0;
      const activeUserIds = new Set(
        sessions
          ?.filter((session) => new Date(session.created_at) >= today)
          .map((session) => session.user_id)
      );
      const activeUsersToday = activeUserIds.size;
      const totalStudyTime =
        sessions?.reduce((acc, current) => acc + current.duration, 0) || 0;
      const newUsersToday =
        profiles?.filter((profile) => new Date(profile.created_at!) >= today)
          .length || 0;

      setStats({
        totalUsers,
        activeUsersToday,
        totalStudyTime,
        newUsersToday,
      });
      setUsers(profiles as Profile[]);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('관리자 대시보드 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const initialize = async () => {
      const { isAdmin } = await getAdminStatus();

      if (!isActive) return;

      if (!isAdmin) {
        setLoading(false);
        router.replace('/');
        return;
      }

      await fetchData();

      if (!isActive) return;

      channel = supabase
        .channel('admin-dashboard-updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
          },
          (payload) => {
            setUsers((previousUsers) =>
              previousUsers.map((user) =>
                user.id === payload.new.id
                  ? { ...user, ...payload.new }
                  : user
              )
            );
          }
        )
        .subscribe();
    };

    void initialize();

    return () => {
      isActive = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchData, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900 md:p-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              관리자 대시보드
            </h1>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/changelog')}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-600"
              >
                변경 내역
              </button>
              <button
                onClick={() => router.push('/')}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                홈으로 돌아가기
              </button>
            </div>
          </div>

          <DashboardStats {...stats} />

          <div className="mt-8">
            <UserTable
              users={users}
              onUserClick={(userId) => router.push(`/admin/users/${userId}`)}
            />
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
