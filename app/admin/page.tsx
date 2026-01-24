'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminGuard from '@/components/admin/AdminGuard';
import DashboardStats from '@/components/admin/DashboardStats';
import UserTable from '@/components/admin/UserTable';
import { Profile, StudySession } from '@/lib/types';
import { toast } from 'react-hot-toast';

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

  useEffect(() => {
    fetchData();

    // Real-time subscription for profile updates
    const channel = supabase
      .channel('admin-dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          setUsers((prevUsers) =>
            prevUsers.map((user) =>
              user.id === payload.new.id
                ? { ...user, ...payload.new }
                : user
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    try {
      // 1. Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // 2. Fetch today's study sessions for stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: sessions, error: sessionsError } = await supabase
        .from('study_sessions')
        .select('duration, created_at, user_id');

      if (sessionsError) throw sessionsError;

      // Calculate Stats
      const totalUsers = profiles?.length || 0;
      
      // Active users today (based on study sessions or last_active_at)
      // Here we use study sessions for "active study users"
      const activeUserIds = new Set(
        sessions
          ?.filter(s => new Date(s.created_at) >= today)
          .map(s => s.user_id)
      );
      const activeUsersToday = activeUserIds.size;

      // Total study time
      const totalStudyTime = sessions?.reduce((acc, curr) => acc + curr.duration, 0) || 0;

      // New users today
      const newUsersToday = profiles?.filter(
        p => new Date(p.created_at!) >= today
      ).length || 0;

      setStats({
        totalUsers,
        activeUsersToday,
        totalStudyTime,
        newUsersToday,
      });

      setUsers(profiles as Profile[]);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              관리자 대시보드
            </h1>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/changelog')}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-lg hover:bg-rose-600 transition-colors shadow-sm"
              >
                패치노트 관리
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700 transition-colors"
              >
                앱으로 돌아가기
              </button>
            </div>
          </div>

          <DashboardStats {...stats} />

          <UserTable 
            users={users} 
            onUserClick={(userId) => router.push(`/admin/users/${userId}`)} 
          />
        </div>
      </div>
    </AdminGuard>
  );
}
