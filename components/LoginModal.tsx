'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import ModalDialog from '@/components/ui/ModalDialog';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleLogin: () => void;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { message?: unknown };
    if (typeof maybeError.message === 'string') {
      return maybeError.message;
    }
  }

  return '오류가 발생했습니다.';
};

export default function LoginModal({
  isOpen,
  onClose,
  onGoogleLogin,
}: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const titleId = useId();
  const emailId = useId();
  const passwordId = useId();
  const googleButtonRef = useRef<HTMLButtonElement>(null);

  const handleEmailAuth = async () => {
    if (!email || !password) {
      toast.error('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;
        toast.success('회원가입에 성공했습니다. 이메일을 확인해주세요.');
        onClose();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        toast.success('로그인에 성공했습니다.');
        onClose();
      }
    } catch (error: unknown) {
      let message = getErrorMessage(error);
      if (message.includes('Email not confirmed')) {
        message = '이메일 인증이 완료되지 않았습니다.\n메일함을 확인해주세요.';
      } else if (message.includes('Invalid login credentials')) {
        message = '이메일 또는 비밀번호가 올바르지 않습니다.';
      } else if (message.includes('User already registered')) {
        message = '이미 가입된 이메일입니다.';
      }

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalDialog
      open={isOpen}
      onClose={onClose}
      aria-labelledby={titleId}
      // 닫기 버튼보다 실제 로그인 수단에 먼저 포커스를 둔다.
      initialFocusRef={googleButtonRef}
      className="relative md:max-w-[400px]"
    >
      <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
      <button
        type="button"
        onClick={onClose}
        className="ui-icon-button absolute top-3 right-3 text-ink-muted md:top-4 md:right-4"
        aria-label="로그인 창 닫기"
      >
        <X aria-hidden="true" size={20} strokeWidth={2} />
      </button>

      <div className="flex flex-col gap-1 pr-10">
        <h2 className="m-0 text-[13px] font-semibold text-ink-muted">
          {isSignUp ? '회원가입' : '로그인'}
        </h2>
        <h1 id={titleId} className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">
          {isSignUp ? 'fomopomo 회원가입' : 'fomopomo 로그인'}
        </h1>
      </div>

      <button
        ref={googleButtonRef}
        type="button"
        onClick={onGoogleLogin}
        className="ui-button-secondary min-h-12 w-full gap-3 rounded-tile"
      >
        <Image
          src="https://www.svgrepo.com/show/475656/google-color.svg"
          alt="Google"
          width={20}
          height={20}
          className="h-5 w-5"
        />
        Google로 계속하기
      </button>

      <p className="m-0 text-center text-[13px] font-medium text-ink-faint">또는</p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={emailId} className="text-[13px] font-semibold text-ink-muted">
            이메일
          </label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="example@mail.com"
            className="ui-input w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={passwordId} className="text-[13px] font-semibold text-ink-muted">
            비밀번호
          </label>
          <input
            id={passwordId}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="********"
            className="ui-input w-full"
            onKeyDown={(event) =>
              event.key === 'Enter' ? void handleEmailAuth() : undefined
            }
          />
        </div>

        <button
          type="button"
          onClick={handleEmailAuth}
          disabled={loading}
          className="ui-button-primary ui-press mt-1 min-h-12 w-full rounded-tile"
        >
          {loading
            ? '처리 중...'
            : isSignUp
              ? '이메일로 가입하기'
              : '이메일로 로그인'}
        </button>
      </div>

      <p className="m-0 text-center text-sm">
        <span className="text-ink-muted">
          {isSignUp
            ? '이미 계정이 있으신가요? '
            : '계정이 없으신가요? '}
        </span>
        <button
          type="button"
          onClick={() => setIsSignUp((current) => !current)}
          className="font-bold text-ink hover:text-pomo"
        >
          {isSignUp ? '로그인' : '회원가입'}
        </button>
      </p>
    </ModalDialog>
  );
}
