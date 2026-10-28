'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import LoginModal from '@/components/LoginModal';
import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';
import { handleInAppBrowser, isInAppBrowser } from '@/lib/userAgent';
import { getStorageOwner } from '@/lib/userScopedStorage';
import SettingsView from './SettingsView';

export default function SettingsScreen() {
  const { session, loading } = useAuthSession();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const handleGoogleLogin = async () => {
    if (isInAppBrowser()) {
      const handled = handleInAppBrowser();
      if (handled) {
        toast.error(
          '구글 로그인은 보안 정책상\n외부 브라우저(크롬, 사파리 등)에서\n진행해야 합니다.',
          { duration: 5000 }
        );
        return;
      }
    }

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/settings' },
    });
  };

  // 저장소 주인(로그인 계정)은 브라우저에서만 알 수 있으므로 세션을 확인한 뒤에 그린다.
  if (loading) return <div aria-busy="true" className="min-h-dvh" />;

  return (
    <>
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onGoogleLogin={handleGoogleLogin}
      />
      <SettingsView
        key={getStorageOwner()}
        session={session}
        onOpenLogin={() => setIsLoginModalOpen(true)}
      />
    </>
  );
}
