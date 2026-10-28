'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SlidersVertical } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ContributionGraph from '@/components/profile/ContributionGraph';
import LogoutDialog from '@/components/LogoutDialog';
import StudyReport from '@/components/StudyReport';
import { useStudyStats } from '@/hooks/useStudyStats';
import Navbar from '@/components/Navbar';
import MobileTopBar, { TopBarTitle } from '@/components/layout/MobileTopBar';
import LoginModal from '@/components/LoginModal';
import { useAuthSession } from '@/hooks/useAuthSession';
import { toast } from 'react-hot-toast';
import { isInAppBrowser, handleInAppBrowser } from '@/lib/userAgent';

export default function ProfilePage() {
  const { session, loading: sessionLoading } = useAuthSession();
  const userId = session?.user?.id ?? null;
  // 머리(누적·오늘)·공부 기록·상세 리포트가 집계 하나를 함께 쓴다. 조회는 리포트가 기간을 바꿀 때마다
  // 하고, 그때 오늘 합계(getStudyDayRange, 오전 5시 기준)도 새로 받아 머리와 막대가 같은 값을 보인다.
  const stats = useStudyStats(userId);
  const {
    heatmapData,
    totalFocusTime,
    todayFocusTime,
    earliestYear,
    loading: statsLoading,
  } = stats;

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

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
    <>
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onGoogleLogin={handleGoogleLogin}
      />
      <LogoutDialog open={isLogoutOpen} onClose={() => setIsLogoutOpen(false)} />

      <Navbar
        session={session}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        mobileTopBar={
          <MobileTopBar
            start={<TopBarTitle title="프로필" titleClassName="text-xl" />}
            end={
              <Link href="/settings" aria-label="설정" className="ui-icon-button-surface">
                <SlidersVertical size={19} strokeWidth={1.8} aria-hidden="true" />
              </Link>
            }
          />
        }
      />

      {/* 레이아웃이 이미 <main>을 그리므로 여기서는 div로 감싼다. */}
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-9 px-4 pt-2 pb-8 md:gap-14 md:px-10 md:pt-4 md:pb-20">
        {/* 로그인한 사용자에게만 개인 데이터 섹션을 렌더링한다 (로그아웃 후 잔존 데이터 방지) */}
        {session ? (
          <>
            <ProfileHeader
              user={session.user}
              totalFocusTime={totalFocusTime}
              todayFocusTime={todayFocusTime}
              loading={statsLoading}
              onLogout={() => setIsLogoutOpen(true)}
            />
            <ContributionGraph data={heatmapData} earliestYear={earliestYear} loading={statsLoading} />
            <StudyReport key={userId ?? 'guest'} stats={stats} />
            <button
              type="button"
              onClick={() => setIsLogoutOpen(true)}
              className="ui-button-ghost -ml-3 self-start rounded-control text-ink-muted md:hidden"
            >
              로그아웃
            </button>
          </>
        ) : (
          <section aria-labelledby="profile-guest-title" className="flex flex-col items-start gap-3 py-4 md:gap-4 md:py-10">
            <h1 id="profile-guest-title" className="ui-h1 hidden md:block">프로필</h1>
            <p className="m-0 text-[15px] text-ink-muted">
              로그인하면 공부 기록과 상세 리포트를 볼 수 있어요.
            </p>
            <button
              type="button"
              onClick={() => setIsLoginModalOpen(true)}
              className="ui-button-primary ui-press mt-1 rounded-tile px-5"
            >
              로그인하기
            </button>
          </section>
        )}
      </div>
    </>
  );
}
