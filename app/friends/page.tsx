'use client';

import { useState } from 'react';
import { useAuthSession } from '@/hooks/useAuthSession';
import FriendsDashboard from '@/components/friends/FriendsDashboard';
import LoginModal from '@/components/LoginModal';
import { supabase } from '@/lib/supabase';

export default function FriendsPage() {
  const { session, loading } = useAuthSession();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  if (loading) {
    return (
      <div 
        className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900"
        suppressHydrationWarning
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
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
      <FriendsDashboard 
        session={session} 
        onOpenLogin={() => setIsLoginModalOpen(true)} 
      />
    </>
  );
}
