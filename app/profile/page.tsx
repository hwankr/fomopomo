'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
// import { User } from '@supabase/supabase-js'; // Removed unused
import ProfileHeader from '@/components/profile/ProfileHeader';
import ContributionGraph from '@/components/profile/ContributionGraph';
import StudyReport from '@/components/StudyReport';
import { useStudyStats } from '@/hooks/useStudyStats';
import Navbar from '@/components/Navbar';
import LoginModal from '@/components/LoginModal';
import SettingsModal from '@/components/SettingsModal';
import { useTheme } from '@/components/ThemeProvider';
import { useAuthSession } from '@/hooks/useAuthSession';
import { toast } from 'react-hot-toast';
import { isInAppBrowser, handleInAppBrowser } from '@/lib/userAgent';

export default function ProfilePage() {
  const { session, loading: sessionLoading } = useAuthSession();
  const { fetchStats, heatmapData, totalFocusTime, loading: statsLoading } = useStudyStats();
  const { isDarkMode, toggleDarkMode } = useTheme();

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsUpdateTrigger, setSettingsUpdateTrigger] = useState(0); // For compatibility if needed, or just refresh

  useEffect(() => {
    if (session?.user) {
        // Fetch stats to populate heatmap and total time
        fetchStats('year', new Date());
    }
  }, [session, fetchStats]);

  const handleGoogleLogin = async () => {
    if (isInAppBrowser()) {
      const handled = handleInAppBrowser();
      if (handled) {
        toast.error(
          '구글 로그인은 보안 정책상\n외부 브라우저(크롬, 사파리 등)에서\n진행해야 합니다.',
          {
            duration: 5000,
          }
        );
        return;
      }
    }

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  if (sessionLoading) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-20 transition-colors duration-300">
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onGoogleLogin={handleGoogleLogin}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={() => setSettingsUpdateTrigger((prev) => prev + 1)}
      />

      <Navbar
        session={session}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onLogout={() => supabase.auth.signOut()}
      />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-fade-in mt-16">
        
        {/* Header Section */}
        <section>
          <ProfileHeader user={session?.user || null} totalFocusTime={totalFocusTime} />
        </section>

        {/* Contribution Graph Section */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span>공부 기록</span>
            <span className="text-xs font-normal text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                최근 365일
            </span>
          </h2>
          {statsLoading && heatmapData.length === 0 ? (
               <div className="h-32 flex items-center justify-center text-gray-400 text-sm">잔디 심는 중...</div>
          ) : (
               <ContributionGraph data={heatmapData} />
          )}
        </section>

        {/* Detailed Report Section */}
        <section>
           <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 px-2">상세 리포트</h2>
           <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
             <StudyReport />
           </div>
        </section>

      </div>
    </div>
  );
}
