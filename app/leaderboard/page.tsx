'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import LeaderboardItem from '@/components/LeaderboardItem';
import { Lock, Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

// Navbar integration imports
import Navbar from '@/components/Navbar';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useTheme } from '@/components/ThemeProvider';
import LoginModal from '@/components/LoginModal';
import SettingsModal from '@/components/SettingsModal';
import { isInAppBrowser, handleInAppBrowser } from '@/lib/userAgent';
import { toast } from 'react-hot-toast';

// Mock data for blurred background
const MOCK_ITEMS = Array.from({ length: 15 }, (_, i) => ({
  rank: i + 1,
  nickname: `User ${i + 1}`,
  total_duration: 36000 - i * 1000,
  user_id: `mock-${i}`
}));

export default function LeaderboardPage() {
  // Auth & Theme hooks for Navbar
  const { session, loading: isAuthLoading } = useAuthSession();
  const { isDarkMode, toggleDarkMode } = useTheme();
  
  // Modals state
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Leaderboard state
  const [loading, setLoading] = useState(true);
  const [participating, setParticipating] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);

  useEffect(() => {
    if (!isAuthLoading) {
      checkParticipation();
    }
  }, [isAuthLoading, session]);

  useEffect(() => {
    if (participating) {
      fetchLeaderboard();
    }
  }, [participating, selectedYear, selectedMonth]);

  const checkParticipation = async () => {
    try {
      if (!session?.user) {
        setLoading(false);
        return;
      }
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_leaderboard_participant')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;
      
      setParticipating(profile?.is_leaderboard_participant || false);
    } catch (error) {
      console.error('Error checking participation:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_monthly_leaderboard', {
          target_year: selectedYear,
          target_month: selectedMonth
        });

      if (error) throw error;
      setLeaderboardData(data || []);
    } catch (error: any) {
      console.error('Error fetching leaderboard:', error.message || error);
    }
  };

  const handleJoin = async () => {
    if (!session?.user) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('profiles')
        .update({ is_leaderboard_participant: true })
        .eq('id', session.user.id);

      if (error) throw error;

      setParticipating(true);
    } catch (error) {
      console.error('Error joining leaderboard:', error);
      alert("리더보드 참여에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };
  
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

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
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
      
      <div className="container max-w-2xl mx-auto py-8 px-4 pb-24 mt-4 animate-fade-in">
        <div className="flex flex-col items-center mb-8 space-y-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="w-8 h-8 text-yellow-500" />
            월간 리더보드
          </h1>
          
          <div className="flex items-center gap-4 bg-muted p-1 rounded-lg">
            <button 
              onClick={handlePrevMonth}
              className="p-2 hover:bg-background/80 rounded-md transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="font-medium min-w-[100px] text-center">
              {selectedYear}년 {selectedMonth}월
            </span>
            
            <button 
              onClick={handleNextMonth}
              disabled={
                selectedYear === currentDate.getFullYear() && 
                selectedMonth === currentDate.getMonth() + 1
              }
              className="p-2 hover:bg-background/80 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative min-h-[500px] border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden rounded-xl shadow-sm">
          {!participating ? (
            <div className="relative p-6">
              {/* Blurred Background Content */}
              <div className="filter blur-md opacity-50 select-none pointer-events-none">
                {MOCK_ITEMS.map((item) => (
                  <LeaderboardItem
                    key={item.rank}
                    rank={item.rank}
                    nickname={item.nickname}
                    totalDuration={item.total_duration}
                  />
                ))}
              </div>

              {/* Overlay CTA */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/20 z-10 p-6 text-center">
                <div className="bg-card p-8 rounded-xl shadow-2xl border border-border max-w-sm w-full space-y-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Lock className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">리더보드 보기 참여하기</h3>
                    <p className="text-muted-foreground text-sm break-keep">
                      다른 유저들과 함께 공부하고 나의 순위를 확인해보세요.<br/>
                      참여 시 나의 공부 시간이 다른 유저에게 공개됩니다.
                    </p>
                  </div>
                  
                  {session?.user ? (
                    <button 
                      onClick={handleJoin} 
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center"
                      disabled={loading}
                    >
                      {loading ? "참여 중..." : "참여하기"}
                    </button>
                  ) : (
                    <button 
                      onClick={() => setIsLoginModalOpen(true)} 
                      className="w-full block bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-lg transition-colors text-center"
                    >
                      로그인하고 참여하기
                    </button>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-4">
                    * 닉네임과 공부 시간만 공개됩니다. (이메일 비공개)
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // Actual Leaderboard Content
            <div className="p-4 space-y-1">
              {loading ? (
                <div className="text-center py-20 text-muted-foreground">로딩 중...</div>
              ) : leaderboardData.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground break-keep">
                  아직 참여자가 없습니다. 첫 번째 주인공이 되어보세요!
                </div>
              ) : (
                leaderboardData.map((item) => (
                  <LeaderboardItem
                    key={item.user_id}
                    rank={item.rank}
                    nickname={item.nickname}
                    totalDuration={item.total_duration}
                    isCurrentUser={session?.user?.id === item.user_id}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
