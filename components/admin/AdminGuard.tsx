'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { getAdminStatus } from '@/lib/admin';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      try {
        const { user, isAdmin: hasAdminAccess } = await getAdminStatus();
        if (cancelled) return;

        if (!user) {
          router.replace('/');
          return;
        }

        if (!hasAdminAccess) {
          toast.error('관리자 권한이 필요합니다.');
          router.replace('/');
          return;
        }

        setIsAdmin(true);
      } catch (error) {
        if (cancelled) return;
        console.error('Admin check failed:', error);
        router.replace('/');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
