'use client';

import Navbar from '@/components/Navbar';
import { useTheme } from '@/components/ThemeProvider';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';

export default function TermsPage() {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <Navbar
        session={session}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        onLogout={() => supabase.auth.signOut()}
        onOpenLogin={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
      />
      
      <main className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 md:p-12 shadow-sm border border-gray-200 dark:border-slate-800">
          <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">이용약관</h1>
          
          <div className="space-y-8 text-gray-600 dark:text-gray-300 leading-relaxed">
            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">제1조 (목적)</h2>
              <p>
                본 약관은 Fomopomo(이하 "서비스")가 제공하는 모든 서비스의 이용 조건 및 절차, 이용자와 서비스의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">제2조 (서비스의 제공)</h2>
              <p>
                Fomopomo는 뽀모도로 타이머, 공부 시간 측정, 그룹 스터디 등의 기능을 제공합니다. 서비스는 개발자의 사정에 따라 사전 고지 없이 변경되거나 중단될 수 있습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">제3조 (책임의 한계)</h2>
              <p>
                본 서비스는 "있는 그대로(As-Is)" 제공됩니다. 서비스 이용 중 발생한 데이터 유실, 시스템 오류, 또는 기타 손해에 대해 개발자는 법적 책임을 지지 않습니다. 중요 데이터는 사용자가 별도로 백업해야 합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">제4조 (이용자의 의무)</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>사용자는 타인의 명예를 훼손하거나 불법적인 목적으로 서비스를 이용할 수 없습니다.</li>
                <li>비정상적인 방법(매크로, 해킹 등)으로 시스템 과부하를 유발하는 행위를 금지합니다.</li>
                <li>이용 정책을 위반하는 경우, 사전 통보 없이 계정 이용이 제한될 수 있습니다.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">제5조 (준거법)</h2>
              <p>
                본 약관은 대한민국 법률에 따라 해석되고 규율됩니다.
              </p>
            </section>

            <div className="pt-8 border-t border-gray-100 dark:border-slate-800 text-sm text-gray-500">
              <p>공고일자: 2025년 12월 21일</p>
              <p>시행일자: 2025년 12월 21일</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
