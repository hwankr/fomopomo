'use client';

import { useState } from 'react';
import DonationSection from '@/components/DonationSection';
import Navbar from '@/components/Navbar';
import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';
import LoginModal from '@/components/LoginModal';
import { toast } from 'react-hot-toast';
import { isInAppBrowser, handleInAppBrowser } from '@/lib/userAgent';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function SupportClient() {
  const { session } = useAuthSession();

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
      options: { redirectTo: window.location.origin },
    });
  };

  return (
    <div className="flex flex-col">
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onGoogleLogin={handleGoogleLogin}
      />

      <Navbar
        session={session}
        onOpenLogin={() => setIsLoginModalOpen(true)}
      />

      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-9 px-4 pt-4 pb-20 md:gap-12 md:px-10">
        {/* 헤더: 모바일은 뒤로가기를 제목 위에, 데스크톱은 오른쪽에 둔다. */}
        <div className="flex flex-col-reverse gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-6">
          <h1 className="ui-h1">Fomopomo 후원하기</h1>
          <Link
            href="/"
            className="ui-button-ghost -ml-3 min-h-10 w-fit gap-1.5 text-ink-muted md:ml-0"
          >
            <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2.2} />
            홈으로
          </Link>
        </div>

        {/* 후원: 제목과 같은 왼쪽 줄에 맞춘다. */}
        <div className="w-full max-w-sm">
          <DonationSection variant="card" />
        </div>
      </div>
    </div>
  );
}
