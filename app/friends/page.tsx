'use client';

import { Suspense, useState } from 'react';
import { useAuthSession } from '@/hooks/useAuthSession';
import FriendsDashboard from '@/components/friends/FriendsDashboard';
import LoginModal from '@/components/LoginModal';
import { supabase } from '@/lib/supabase';

function FriendsLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-white" suppressHydrationWarning>
      <span
        role="status"
        aria-label="불러오는 중"
        className="size-8 animate-spin rounded-full border-2 border-bead border-t-pomo"
      />
    </div>
  );
}

export default function FriendsPage() {
  const { session, loading } = useAuthSession();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  if (loading) {
    return <FriendsLoading />;
  }

  return (
    <>
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onGoogleLogin={() => {
          setIsLoginModalOpen(false);
          supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/friends' },
          });
        }}
      />
      {/* 탭을 주소(?tab=)에서 읽으므로 useSearchParams를 Suspense 안에 둔다. */}
      <Suspense fallback={<FriendsLoading />}>
        <FriendsDashboard
          session={session}
          onOpenLogin={() => setIsLoginModalOpen(true)}
        />
      </Suspense>
    </>
  );
}
