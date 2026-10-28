'use client';

import { useAuthSession } from '@/hooks/useAuthSession';
import Dashboard from '@/components/plan/Dashboard';

export default function PlanPage() {
  const { session, loading } = useAuthSession();

  if (loading) {
    return (
      <div
        role="status"
        aria-label="불러오는 중"
        className="flex min-h-[60vh] items-center justify-center"
        suppressHydrationWarning
      >
        <span
          aria-hidden="true"
          className="size-8 animate-spin rounded-full border-2 border-bead border-t-pomo motion-reduce:animate-none"
        />
      </div>
    );
  }

  return <Dashboard session={session} />;
}
