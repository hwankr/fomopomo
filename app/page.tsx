'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import Image from 'next/image';
import Link from 'next/link';
import TimerApp from '@/components/TimerApp';
import HistoryList from '@/components/HistoryList';
import LoginModal from '@/components/LoginModal';
import ReportModal from '@/components/ReportModal';
import SettingsModal from '@/components/SettingsModal';
import { Toaster, toast } from 'react-hot-toast';
import appIcon from './icon.png';
import { isInAppBrowser, handleInAppBrowser } from '@/lib/userAgent';

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [settingsUpdateTrigger, setSettingsUpdateTrigger] = useState(0);

  // ✨ [추가] 기록 목록 새로고침을 위한 트리거 상태
  const [historyUpdateTrigger, setHistoryUpdateTrigger] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      setTimeout(() => setIsDarkMode(true), 0);
    }

    return () => subscription.unsubscribe();
  }, []);

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

  if (isLoading) return null;

  const headerBtnStyle = `
    flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap
    bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900
    dark:bg-slate-800 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white
  `;

  const planBtnStyle = `
    flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap
    bg-indigo-500 text-white hover:bg-indigo-600 hover:shadow-md hover:shadow-indigo-200
    dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:hover:shadow-none
  `;

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <main className="flex min-h-screen flex-col items-center bg-[#f8f9fa] dark:bg-[#0f172a] transition-colors duration-300 p-3 sm:p-4 overflow-y-auto font-sans text-gray-900 dark:text-gray-100">
        <Toaster position="top-center" reverseOrder={false} />

        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onGoogleLogin={handleGoogleLogin}
        />
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
        />
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          onSave={() => setSettingsUpdateTrigger((prev) => prev + 1)}
        />

        {/* Header Container - Wider for PC */}
        <div className="w-full max-w-5xl px-4 mb-8">
          <div className="w-full flex justify-between items-center">
            <div className="flex items-center gap-2 select-none">
              <Image
                src={appIcon}
                alt="Pomofomo icon"
                width={32}
                height={32}
                className="rounded-lg"
                priority
              />
              <h1 className="hidden sm:block text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">
                Pomofomo
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={headerBtnStyle}
              >
                {isDarkMode ? '☀️' : '🌙'}
              </button>

              <Link
                href="/plan"
                className={planBtnStyle}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                  />
                </svg>
                <span className="hidden md:inline">Plan</span>
              </Link>

              <Link
                href="/friends"
                className={planBtnStyle}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
                <span className="hidden md:inline">Friends</span>
              </Link>


              <button
                onClick={() => {
                  if (!session) {
                    toast.error('로그인이 필요한 기능입니다.');
                    return;
                  }
                  setIsReportModalOpen(true);
                }}
                className={headerBtnStyle}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"
                  />
                </svg>
                <span className="hidden md:inline">Report</span>
              </button>

              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className={headerBtnStyle}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span className="hidden md:inline">Setting</span>
              </button>

              {session ? (
                <div className="relative">
                  <button
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    className="w-9 h-9 rounded-lg overflow-hidden border-2 border-white dark:border-slate-600 shadow-sm hover:opacity-80 transition-opacity"
                  >
                    <Image
                      src={
                        session.user.user_metadata.avatar_url ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          session.user.email?.split('@')[0] || 'User'
                        )}&background=random&color=fff`
                      }
                      alt="User"
                      width={36}
                      height={36}
                      className="object-cover"
                    />
                  </button>
                  {isProfileMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10 cursor-default"
                        onClick={() => setIsProfileMenuOpen(false)}
                      ></div>
                      <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 z-20 overflow-hidden py-1 animate-fade-in">
                        <button
                          onClick={() => {
                            supabase.auth.signOut();
                            setIsProfileMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors"
                        >
                          Log out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className={`${headerBtnStyle} bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200`}
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Container - Narrow for Focus */}
        <div className="w-full max-w-lg flex flex-col items-center gap-8 animate-fade-in">
          {/* ✨ TimerApp에 콜백 전달: 저장 완료 시 트리거 숫자를 증가시킴 */}
          <TimerApp
            settingsUpdated={settingsUpdateTrigger}
            onRecordSaved={() => setHistoryUpdateTrigger((prev) => prev + 1)}
            isLoggedIn={!!session}
          />

          {/* ✨ HistoryList에 트리거 전달: 숫자가 바뀌면 새로고침 됨 */}
          {session ? (
            <HistoryList updateTrigger={historyUpdateTrigger} />
          ) : null}
        </div>
      </main>
    </div>
  );
}
