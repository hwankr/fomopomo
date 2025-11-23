'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import TimerApp from '@/components/TimerApp';
import HistoryList from '@/components/HistoryList';
import LoginModal from '@/components/LoginModal';
import ReportModal from '@/components/ReportModal';
import SettingsModal from '@/components/SettingsModal';
import { Toaster } from 'react-hot-toast';

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [settingsUpdateTrigger, setSettingsUpdateTrigger] = useState(0);

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
      setIsDarkMode(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  if (isLoading) return null;

  // ✨ whitespace-nowrap 추가: 절대 줄바꿈 안 됨
  const headerBtnStyle = `
    flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap
    bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900
    dark:bg-slate-800 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white
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

        <div className="py-4 sm:py-8 flex flex-col items-center w-full max-w-lg relative">
          <div className="w-full flex justify-between items-center mb-8 px-1">
            <div className="flex items-center gap-2 select-none">
              <span className="text-3xl">🍅</span>
              <h1 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">
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

              <button
                onClick={() => setIsReportModalOpen(true)}
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
                <span className="hidden sm:inline">Report</span>
              </button>

              {/* ✨ 아이콘 수정됨: 톱니바퀴(Gear) */}
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
                <span className="hidden sm:inline">Setting</span>
              </button>

              {session ? (
                <div className="relative">
                  <button
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    className="w-9 h-9 rounded-lg overflow-hidden border-2 border-white dark:border-slate-600 shadow-sm hover:opacity-80 transition-opacity"
                  >
                    <img
                      src={
                        session.user.user_metadata.avatar_url ||
                        'https://www.svgrepo.com/show/446532/avatar.svg'
                      }
                      alt="User"
                      className="w-full h-full object-cover"
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

          <div className="w-full flex flex-col items-center gap-8 animate-fade-in">
            <TimerApp settingsUpdated={settingsUpdateTrigger} />
            {session ? <HistoryList /> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
