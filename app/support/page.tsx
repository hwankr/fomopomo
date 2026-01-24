'use client';

import { useState } from 'react';
import DonationSection from '@/components/DonationSection';
import Navbar from '@/components/Navbar';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useTheme } from '@/components/ThemeProvider';
import { supabase } from '@/lib/supabase';
import LoginModal from '@/components/LoginModal';
import SettingsModal from '@/components/SettingsModal';
import { toast } from 'react-hot-toast';
import { isInAppBrowser, handleInAppBrowser } from '@/lib/userAgent';
import { ArrowLeft, Heart, Server, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function SupportPage() {
  const { session, loading: isAuthLoading } = useAuthSession();
  const { isDarkMode, toggleDarkMode } = useTheme();
  
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
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
      options: { redirectTo: window.location.origin },
    });
  };
  
  if (isAuthLoading) return null;

  return (
    <main className="flex min-h-screen flex-col items-center bg-[#f8f9fa] dark:bg-[#0f172a] transition-colors duration-300 font-sans text-gray-900 dark:text-gray-100">
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onGoogleLogin={handleGoogleLogin}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={() => {}} 
      />

      <Navbar
        session={session}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onLogout={() => supabase.auth.signOut()}
      />
      
      <div className="container max-w-lg mx-auto py-6 px-4 pb-24 mt-4 animate-fade-in">
        {/* 뒤로가기 */}
        <Link 
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          홈으로
        </Link>
        
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            후원하기
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Fomopomo를 응원해주세요
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
            여러분의 작은 후원이 서비스 유지와 새로운 기능 개발에 큰 힘이 됩니다.
          </p>
        </div>
        
        {/* 후원 카드 */}
        <DonationSection variant="card" />
        
        {/* 감사 메시지 */}
        <p className="text-center text-xs text-gray-500 dark:text-gray-500 mt-8">
          Fomopomo를 사용해주셔서 감사합니다 🍅
        </p>
      </div>
    </main>
  );
}
