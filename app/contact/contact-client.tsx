'use client';

import Link from 'next/link';
import { ChevronLeft, Mail, Copy } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';
import LoginModal from '@/components/LoginModal';
import { toast } from 'react-hot-toast';
import { isInAppBrowser, handleInAppBrowser } from '@/lib/userAgent';

export default function ContactClient() {
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

      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-9 px-4 pt-4 pb-20 animate-fade-in md:gap-12 md:px-10">
        {/* 헤더: 모바일은 뒤로가기를 제목 위에, 데스크톱은 오른쪽에 둔다. */}
        <div className="flex flex-col-reverse gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="ui-h1">Contact</h1>
            <p className="m-0 text-ink-muted">
              궁금한 점이나 문의사항이 있으시면 아래 방법으로 연락해주세요.
            </p>
          </div>
          <Link
            href="/"
            className="ui-button-ghost -ml-3 min-h-10 w-fit gap-1.5 text-ink-muted md:ml-0"
          >
            <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2.2} />
            홈으로
          </Link>
        </div>

        {/* 연락처: 카드 없이 행 하나 */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText('fabronjeon@naver.com');
              toast.success('이메일이 복사되었습니다');
            }}
            className="group -mx-3 flex min-h-16 items-center gap-3 rounded-tile px-3 py-2 text-left transition-colors hover:bg-hover"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pomo-tint text-pomo">
              <Mail aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">이메일</span>
              <span className="break-all text-sm text-ink-muted">fabronjeon@naver.com</span>
            </span>
            <Copy
              aria-hidden="true"
              className="size-[18px] shrink-0 text-ink-faint transition-colors group-hover:text-ink"
              strokeWidth={1.8}
            />
          </button>
          {/* 부가 안내 */}
          <p className="m-0 text-[13px] text-ink-subtle">
            가능한 빠르게 답변 드리겠습니다
          </p>
        </div>
      </div>
    </div>
  );
}
