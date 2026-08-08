'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getSeoulStudyDayRange } from '@/lib/dateUtils';
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
      // 관리자 지표는 청중이 한국이므로 관리자 브라우저의 타임존과 무관하게
      // Asia/Seoul 기준 05:00 공부일 시작을 서버에 전달한다.
      const { start: dayStart } = getSeoulStudyDayRange();

      const [profilesResult, statsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .rpc('get_admin_dashboard_stats', {
            p_day_start: dayStart.toISOString(),
          })
          .single(),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (statsResult.error) throw statsResult.error;

      const dashboardStats = statsResult.data as {
        total_users: number;
        active_users_today: number;
        total_study_time: number;
        new_users_today: number;
      };

      setStats({
        totalUsers: dashboardStats.total_users,
        activeUsersToday: dashboardStats.active_users_today,
        totalStudyTime: dashboardStats.total_study_time,
        newUsersToday: dashboardStats.new_users_today,
      });
      setUsers(profilesResult.data as Profile[]);
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
